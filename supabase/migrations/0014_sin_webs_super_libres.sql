-- Sin lectura de webs de supermercados (decidido por Oswaldo el 23/11/2026, para poder vender la app).
-- - Se quita la tarea diaria que pedía precios a las webs (la función "precios" ya no se usa).
-- - Los precios leídos de las webs dejan de contar (no se borran: precio_actual ya no los ve).
-- - Súper libres: cada casa elige los suyos (supermercados_casa) y puede escribir los que no estén.
-- - Todos los precios salen de los tiques. Lo aprendido de los tiques de una casa es solo de esa casa.
-- Sin "drop table" ni borrados de datos.

-- 1. Fuera la tarea programada de precios
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'actualizar-precios';
  end if;
end $$;
drop function if exists tareas.pedir_actualizacion_precios();

-- 2. Súper de cada casa
create table if not exists public.supermercados_casa (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  clave text not null,            -- 'mercadona', 'carrefour'… o 'propio-fruteria-pepe' si se escribe a mano
  nombre text not null,
  orden int not null default 0,
  creado_en timestamptz not null default now(),
  unique (hogar_id, clave)
);
alter table public.supermercados_casa enable row level security;
revoke all on public.supermercados_casa from anon;
grant select, insert, update, delete on public.supermercados_casa to authenticated;
create policy "súper de mi casa" on public.supermercados_casa
  for all to authenticated
  using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id));

-- Los tiques y la lista pueden llevar cualquier súper (también los escritos a mano)
alter table public.tiques drop constraint if exists tiques_supermercado_id_fkey;
alter table public.lista_compra drop constraint if exists lista_compra_super_id_fkey;
alter table public.productos_super drop constraint if exists productos_super_supermercado_id_fkey;

-- Cadenas conocidas (solo para nombres; la app trae su propia lista)
insert into public.supermercados (id, nombre) values
  ('carrefour', 'Carrefour'), ('dia', 'Dia'), ('alcampo', 'Alcampo'), ('aldi', 'Aldi'), ('eroski', 'Eroski'),
  ('consum', 'Consum'), ('ahorramas', 'Ahorramás'), ('bm', 'BM Supermercados'), ('gadis', 'Gadis'),
  ('froiz', 'Froiz'), ('bonpreu', 'Bonpreu'), ('caprabo', 'Caprabo'), ('coviran', 'Covirán'),
  ('masymas', 'Masymas'), ('spar', 'Spar'), ('elcorteingles', 'El Corte Inglés'), ('familycash', 'Family Cash')
on conflict (id) do nothing;

-- 3. Productos aprendidos de los tiques: de cada casa
alter table public.productos_super add column if not exists hogar_id uuid references public.hogares (id) on delete cascade;
alter table public.productos_super drop constraint if exists productos_super_supermercado_id_id_externo_key;
create unique index if not exists productos_super_casa_unico
  on public.productos_super (coalesce(hogar_id, '00000000-0000-0000-0000-000000000000'::uuid), supermercado_id, id_externo);
-- Productos que salieron de tiques (Lidl): pasan a ser de la casa que pagó ese tique
update public.productos_super p set hogar_id = x.hogar_id
from (select producto_id, min(hogar_id::text)::uuid hogar_id from public.precios
      where origen = 'tique' and hogar_id is not null group by producto_id
      having count(distinct hogar_id) = 1) x
where p.id = x.producto_id and p.hogar_id is null
  and not exists (select 1 from public.precios w where w.producto_id = p.id and w.origen = 'web');

drop policy if exists "catálogo de productos visible" on public.productos_super;
drop policy if exists "productos de mi casa" on public.productos_super;
-- Se ven los de mi casa y, de los antiguos de las webs, solo los que mi casa ya tenía enlazados (nombre y foto).
create policy "productos de mi casa" on public.productos_super
  for select to authenticated using (
    (hogar_id is not null and public.es_miembro(hogar_id))
    or (hogar_id is null and exists (select 1 from public.equivalencias e
                                     where e.producto_id = productos_super.id and public.es_miembro(e.hogar_id))));

-- Precio actual: solo de tiques o puesto a mano (los de las webs ya no cuentan)
create or replace view public.precio_actual
with (security_invoker = true) as
select distinct on (p.producto_id)
  p.producto_id,
  p.precio,
  p.precio_anterior,
  p.precio_por_unidad,
  p.origen,
  p.visto_en
from public.precios p
where p.origen <> 'web'
order by p.producto_id, p.visto_en desc;

-- 4. Guardar un tique: cada línea con texto es un producto de ese súper en esa casa, con su precio
create or replace function public.guardar_tique(
  p_hogar uuid, p_super text, p_fecha timestamptz, p_total numeric, p_lineas jsonb, p_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  l jsonb;
  prod uuid;
  art uuid;
  precio numeric;
begin
  if auth.uid() is null or not public.es_miembro(p_hogar) then
    raise exception 'No autorizado';
  end if;
  p_super := nullif(trim(coalesce(p_super, '')), '');
  if p_super is not null and length(p_super) > 60 then
    raise exception 'Supermercado no válido';
  end if;

  insert into public.tiques (id, hogar_id, supermercado_id, fecha, total, estado)
  values (p_id, p_hogar, p_super, p_fecha, p_total, 'revisado');

  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    prod := null;
    art := nullif(l->>'articulo_id', '')::uuid;
    if art is not null and not exists (select 1 from public.articulos where id = art and hogar_id = p_hogar) then
      art := null;
    end if;

    -- Con súper conocido: el texto del tique es el producto; el precio, lo pagado por envase (o por kg).
    if p_super is not null and coalesce(l->>'texto', '') <> '' then
      select id into prod from public.productos_super
        where hogar_id = p_hogar and supermercado_id = p_super and id_externo = lower(trim(l->>'texto'));
      if prod is null then
        insert into public.productos_super (hogar_id, supermercado_id, id_externo, nombre, cantidad, unidad, actualizado_en)
        values (p_hogar, p_super, lower(trim(l->>'texto')), trim(l->>'texto'),
                case when (l->>'kg')::boolean then 1000 else null end,
                case when (l->>'kg')::boolean then 'g'::public.unidad_base else null end, now())
        returning id into prod;
      else
        update public.productos_super set actualizado_en = now(), activo = true where id = prod;
      end if;

      precio := case
        when (l->>'kg')::boolean and coalesce((l->>'cantidad')::numeric, 0) > 0
          then round(((l->>'importe')::numeric - coalesce((l->>'descuento')::numeric, 0)) / (l->>'cantidad')::numeric, 2)
        when coalesce((l->>'precio_unidad')::numeric, 0) > 0 then (l->>'precio_unidad')::numeric
        when coalesce((l->>'cantidad')::numeric, 0) > 1
          then round((l->>'importe')::numeric / (l->>'cantidad')::numeric, 2)
        else (l->>'importe')::numeric
      end;
      insert into public.precios (producto_id, precio, precio_por_unidad, origen, visto_en, hogar_id, nota)
      values (prod, precio, case when (l->>'kg')::boolean then precio end, 'tique', p_fecha, p_hogar,
              case when coalesce((l->>'descuento')::numeric, 0) > 0 then 'con descuento' end);

      if art is not null then
        insert into public.equivalencias (articulo_id, producto_id, hogar_id, auto)
        values (art, prod, p_hogar, false)
        on conflict (articulo_id, producto_id) do nothing;
      end if;
    end if;

    insert into public.tique_lineas (hogar_id, tique_id, texto, cantidad, precio_unidad, importe, descuento, kg,
                                     producto_id, articulo_id)
    values (p_hogar, p_id, coalesce(l->>'texto', ''), (l->>'cantidad')::numeric, (l->>'precio_unidad')::numeric,
            coalesce((l->>'importe')::numeric, 0), coalesce((l->>'descuento')::numeric, 0),
            coalesce((l->>'kg')::boolean, false), prod, art);
  end loop;
  return p_id;
end;
$$;

-- Las casas que ya tienen tiques empiezan con esos súper elegidos; la de Mary, con sus tres de siempre.
insert into public.supermercados_casa (hogar_id, clave, nombre, orden)
select distinct t.hogar_id, t.supermercado_id, s.nombre, 0
from public.tiques t join public.supermercados s on s.id = t.supermercado_id
on conflict (hogar_id, clave) do nothing;
insert into public.supermercados_casa (hogar_id, clave, nombre, orden)
select e.hogar_id, x.clave, x.nombre, x.orden
from (select distinct hogar_id from public.equivalencias) e
cross join (values ('mercadona', 'Mercadona', 0), ('hiperdino', 'HiperDino', 1), ('lidl', 'Lidl', 2)) x(clave, nombre, orden)
on conflict (hogar_id, clave) do nothing;

-- Cambios en vivo para los súper de la casa
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'supermercados_casa') then
    alter publication supabase_realtime add table public.supermercados_casa;
  end if;
end $$;
