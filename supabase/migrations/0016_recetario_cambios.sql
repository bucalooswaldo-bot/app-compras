-- Correcciones y fotos del recetario de la app (pedido por Oswaldo el 23/11/2026).
-- El recetario base sigue en web/recetario.json. Aquí se guardan, receta a receta, los cambios que hacen
-- las personas que lo revisan (de momento Mary): texto corregido, foto, revisada u oculta.
-- Lo ven todas las casas; solo los editores del recetario pueden cambiarlo.

create table if not exists public.recetario_editores (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.recetario_editores enable row level security;
drop policy if exists "cada uno se ve" on public.recetario_editores;
create policy "cada uno se ve" on public.recetario_editores for select to authenticated using (user_id = auth.uid());

create or replace function public.es_editor_recetario()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.recetario_editores where user_id = auth.uid());
$$;

create table if not exists public.recetario_cambios (
  id text primary key,                     -- id de la receta en web/recetario.json
  receta jsonb,                            -- receta corregida entera (null = el texto sigue como en la app)
  foto text,                               -- ruta de la foto en el cajón público "recetario"
  revisada boolean not null default false,
  oculta boolean not null default false,   -- quitada del recetario (los editores la siguen viendo)
  actualizado timestamptz not null default now(),
  actualizado_por uuid default auth.uid()
);
alter table public.recetario_cambios enable row level security;
drop policy if exists "todos leen" on public.recetario_cambios;
create policy "todos leen" on public.recetario_cambios for select to anon, authenticated using (true);
drop policy if exists "editores escriben" on public.recetario_cambios;
create policy "editores escriben" on public.recetario_cambios for all to authenticated
  using (public.es_editor_recetario()) with check (public.es_editor_recetario());

-- Fotos del recetario: cajón público (se ven sin enlace temporal) y solo los editores suben o borran
insert into storage.buckets (id, name, public) values ('recetario', 'recetario', true) on conflict (id) do nothing;
drop policy if exists "recetario: editores suben" on storage.objects;
create policy "recetario: editores suben" on storage.objects for insert to authenticated
  with check (bucket_id = 'recetario' and public.es_editor_recetario());
drop policy if exists "recetario: editores cambian" on storage.objects;
create policy "recetario: editores cambian" on storage.objects for update to authenticated
  using (bucket_id = 'recetario' and public.es_editor_recetario());
drop policy if exists "recetario: editores borran" on storage.objects;
create policy "recetario: editores borran" on storage.objects for delete to authenticated
  using (bucket_id = 'recetario' and public.es_editor_recetario());

-- Mary edita el recetario
insert into public.recetario_editores (user_id)
select id from auth.users where email = 'mari.vivefeliz@gmail.com'
on conflict do nothing;
