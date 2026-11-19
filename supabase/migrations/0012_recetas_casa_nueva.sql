-- Casas nuevas con recetas: al crear una casa nueva (por ejemplo, la de un hijo o una hija),
-- se le copian las recetas de la casa marcada como "plantilla" (la casa principal).
-- Es una copia: lo que se cambie en la casa nueva no toca la casa principal, ni al revés.
--   - Se copian las recetas, sus ingredientes y los productos que usan (sin cantidades de despensa).
--   - No se copia la despensa, el plan, la lista, los tiques ni los gastos.
--   - Las fotos y vídeos siguen apuntando al principio a los de la casa principal (solo para verlos);
--     la app de la casa nueva los copia a su propia carpeta al abrirse (ver adoptarArchivos en almacen.js).
-- Sin sentencias drop/revoke (el aviso de confirmación no llega).

alter table public.hogares add column if not exists plantilla boolean not null default false;

-- Copia las recetas de una casa a otra. La usa crear_hogar. Desde la app solo se puede copiar
-- la casa plantilla a la casa propia; el administrador (sin usuario) puede copiar cualquiera.
create or replace function public.copiar_recetas(p_origen uuid, p_destino uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is not null and (not public.es_miembro(p_destino)
      or not exists (select 1 from public.hogares where id = p_origen and plantilla)) then
    raise exception 'No se pueden copiar esas recetas';
  end if;
  -- Ids nuevos sacados de (id de origen + casa nueva): así no hace falta tabla de equivalencias
  -- y volver a copiar no repite nada.

  -- Productos que usan las recetas (si la casa nueva ya tiene uno con el mismo nombre, se usa ese)
  insert into public.articulos (id, hogar_id, nombre, unidad, categoria, foto_producto_id)
  select md5(a.id::text || p_destino::text)::uuid, p_destino, a.nombre, a.unidad, a.categoria, a.foto_producto_id
  from public.articulos a
  where a.hogar_id = p_origen
    and a.id in (select i.articulo_id from public.receta_ingredientes i where i.hogar_id = p_origen)
    and not exists (select 1 from public.articulos d where d.hogar_id = p_destino and d.nombre = a.nombre);

  -- Recetas (las que la casa nueva ya tiene con el mismo nombre no se repiten)
  insert into public.recetas (id, hogar_id, nombre, raciones, tiempo_min, pasos, etiquetas, favorita, origen,
                              creado_en, foto_path, video_path)
  select md5(r.id::text || p_destino::text)::uuid, p_destino, r.nombre, r.raciones, r.tiempo_min, r.pasos,
         r.etiquetas, r.favorita, r.origen, r.creado_en, r.foto_path, r.video_path
  from public.recetas r
  where r.hogar_id = p_origen
    and not exists (select 1 from public.recetas d where d.hogar_id = p_destino and d.nombre = r.nombre);
  get diagnostics n = row_count;

  -- Ingredientes de las recetas recién copiadas
  insert into public.receta_ingredientes (hogar_id, receta_id, articulo_id, cantidad, nota, orden)
  select p_destino, nr.id, na.id, i.cantidad, i.nota, i.orden
  from public.receta_ingredientes i
  join public.recetas r on r.id = i.receta_id
  join public.recetas nr on nr.id = md5(r.id::text || p_destino::text)::uuid
  join public.articulos a on a.id = i.articulo_id
  join public.articulos na on na.hogar_id = p_destino and na.nombre = a.nombre
  where i.hogar_id = p_origen
    and not exists (select 1 from public.receta_ingredientes x where x.receta_id = nr.id);

  return n;
end;
$$;

-- Crea una casa y mete dentro al usuario actual. Si ya tiene casa, devuelve esa.
-- Novedad: la casa nueva empieza con las recetas de la casa plantilla.
create or replace function public.crear_hogar(p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  h uuid;
  origen uuid;
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión';
  end if;
  select hogar_id into h from public.hogar_miembros where user_id = auth.uid() limit 1;
  if h is not null then
    return h;
  end if;
  insert into public.hogares (nombre) values (coalesce(nullif(trim(p_nombre), ''), 'Casa')) returning id into h;
  insert into public.hogar_miembros (hogar_id, user_id) values (h, auth.uid());
  select id into origen from public.hogares where plantilla and id <> h order by creado_en limit 1;
  if origen is not null then
    perform public.copiar_recetas(origen, h);
  end if;
  return h;
end;
$$;

-- ¿Es esta ruta la foto o el vídeo de una receta de mi casa? (para ver los copiados de otra casa)
create or replace function public.archivo_de_mis_recetas(ruta text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.recetas r
    join public.hogar_miembros m on m.hogar_id = r.hogar_id and m.user_id = auth.uid()
    where r.foto_path = ruta or r.video_path = ruta
  );
$$;

grant execute on function public.archivo_de_mis_recetas(text) to authenticated;

-- Solo ver (y copiar a su carpeta): borrar o cambiar sigue siendo solo para la casa dueña.
create policy "fotos: ver las de mis recetas copiadas" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos' and public.archivo_de_mis_recetas(name));

create policy "videos: ver los de mis recetas copiadas" on storage.objects
  for select to authenticated
  using (bucket_id = 'videos' and public.archivo_de_mis_recetas(name));
