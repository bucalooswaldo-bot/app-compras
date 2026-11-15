-- Fase 2-3: enlazar la lista con productos de Mercadona e HiperDino y comparar la cesta.
-- Requiere 0001 y 0002. Sin "drop" ni "revoke" a propósito (todo se añade).
--
-- Cómo llegan los precios:
--   * La app busca con la función "precios" (Supabase Edge Function), que lee el buscador de cada súper
--     y guarda lo encontrado en productos_super + precios.
--   * Cada día a las 04:00 (hora UTC) una tarea pide a esa función que refresque los productos enlazados
--     cuyo precio tiene más de 6 días: cada producto se consulta como mucho una vez por semana.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Equivalencias: qué producto de cada súper vale para cada artículo de la casa.
-- La app necesita un id por fila; "auto" = lo eligió la app (la más barata de las que encajan),
-- false = lo eligió ella a mano.
-- ---------------------------------------------------------------------------
alter table public.equivalencias add column if not exists id uuid not null default gen_random_uuid();
alter table public.equivalencias add column if not exists auto boolean not null default false;
alter table public.equivalencias add column if not exists creado_en timestamptz not null default now();
create unique index if not exists equivalencias_id_idx on public.equivalencias (id);

-- Marca pedida para esta compra en concreto ("leche Puleva").
alter table public.lista_compra add column if not exists marca text;

-- Cambios en vivo también para las equivalencias y las preferencias.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['equivalencias', 'preferencias'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Clave para que solo la tarea programada pueda pedir la actualización.
-- RLS activado y sin políticas: desde la app no se puede leer; la función la lee con la clave de servicio.
-- ---------------------------------------------------------------------------
create table if not exists public.ajustes_servidor (
  clave text primary key,
  valor text not null
);
alter table public.ajustes_servidor enable row level security;

insert into public.ajustes_servidor (clave, valor)
values ('cron_clave', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------------
-- Tarea diaria
-- ---------------------------------------------------------------------------
-- En un esquema propio, que la API no expone: la app no puede llamarla.
create schema if not exists tareas;

create or replace function tareas.pedir_actualizacion_precios()
returns bigint
language sql
set search_path = public, extensions
as $$
  select net.http_post(
    url := 'https://uunbrslndzfmarzinlhe.supabase.co/functions/v1/precios',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-clave', (select valor from public.ajustes_servidor where clave = 'cron_clave')),
    body := '{"accion":"actualizar"}'::jsonb,
    timeout_milliseconds := 120000
  );
$$;


select cron.schedule('actualizar-precios', '0 4 * * *', 'select tareas.pedir_actualizacion_precios()');
