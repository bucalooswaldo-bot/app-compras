-- Vídeos de las recetas (bajados de redes sociales y comprimidos en el móvil).
-- Van en el cajón privado "videos", en una carpeta por casa: videos/<hogar_id>/<uuid>.mp4
-- Mismas reglas que las fotos (0005): solo los miembros de la casa los ven, suben o borran.
-- Sin sentencias drop/revoke (el aviso de confirmación no llega).

alter table public.recetas add column if not exists video_path text;

-- 50 MB por vídeo: el máximo por archivo del plan gratis.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;

create policy "videos: ver los de mi casa" on storage.objects
  for select to authenticated
  using (bucket_id = 'videos' and public.foto_de_mi_casa(name));

create policy "videos: subir a mi casa" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'videos' and public.foto_de_mi_casa(name));

create policy "videos: cambiar los de mi casa" on storage.objects
  for update to authenticated
  using (bucket_id = 'videos' and public.foto_de_mi_casa(name))
  with check (bucket_id = 'videos' and public.foto_de_mi_casa(name));

create policy "videos: borrar los de mi casa" on storage.objects
  for delete to authenticated
  using (bucket_id = 'videos' and public.foto_de_mi_casa(name));
