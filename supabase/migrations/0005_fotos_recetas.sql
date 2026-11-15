-- Fotos de las recetas.
-- Se guardan en Supabase Storage, en el cajón privado "fotos", dentro de una carpeta por casa:
--   fotos/<hogar_id>/<uuid>.jpg
-- Solo los miembros de la casa pueden verlas, subirlas o borrarlas. La app las ve con
-- direcciones temporales (1 día). Sin sentencias drop/revoke (el aviso de confirmación no llega).

alter table public.recetas add column if not exists foto_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ¿La primera carpeta de la ruta es una casa del usuario? (sin convertir a uuid, para no fallar con rutas raras)
create or replace function public.foto_de_mi_casa(ruta text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hogar_miembros
    where user_id = auth.uid() and hogar_id::text = split_part(ruta, '/', 1)
  );
$$;

grant execute on function public.foto_de_mi_casa(text) to authenticated;

create policy "fotos: ver las de mi casa" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos' and public.foto_de_mi_casa(name));

create policy "fotos: subir a mi casa" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and public.foto_de_mi_casa(name));

create policy "fotos: cambiar las de mi casa" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and public.foto_de_mi_casa(name))
  with check (bucket_id = 'fotos' and public.foto_de_mi_casa(name));

create policy "fotos: borrar las de mi casa" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and public.foto_de_mi_casa(name));
