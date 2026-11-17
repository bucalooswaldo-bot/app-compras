-- Avisos en el móvil: cada móvil que los activa se apunta aquí (su "dirección" de avisos).
-- Cada hora, una tarea pide a la función "avisos" que mande el aviso a los móviles cuya hora elegida
-- (hora de Canarias) es la de ahora. Solo se manda si hay algo que contar y no es igual al último.
-- Sin "drop" ni "revoke": todo se añade.

create table if not exists public.avisos_moviles (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  hora integer not null default 9 check (hora between 0 and 23),
  ultimo_envio date,
  ultimo_texto text,
  creado_en timestamptz not null default now()
);
create index if not exists avisos_moviles_hora_idx on public.avisos_moviles (hora);

alter table public.avisos_moviles enable row level security;
create policy "de mi casa" on public.avisos_moviles for all to authenticated
  using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id));

create or replace function tareas.pedir_avisos()
returns bigint
language sql
set search_path = public, extensions
as $$
  select net.http_post(
    url := 'https://uunbrslndzfmarzinlhe.supabase.co/functions/v1/avisos',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-clave', (select valor from public.ajustes_servidor where clave = 'cron_clave')),
    body := '{"accion":"enviar"}'::jsonb,
    timeout_milliseconds := 60000
  );
$$;

select cron.schedule('avisos-movil', '0 * * * *', 'select tareas.pedir_avisos()');
