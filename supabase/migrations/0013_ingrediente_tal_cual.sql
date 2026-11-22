-- Ingredientes "tal cual": cada ingrediente de una receta guarda también el texto como se pegó o
-- se leyó ("2 cucharadas de aceite de oliva virgen extra"), y la receta lo muestra así.
-- La cantidad, la unidad y el producto se siguen guardando aparte para la lista de la compra,
-- la despensa y el ajuste de raciones. Las recetas que ya existen no cambian (texto vacío).
-- Sin sentencias drop/revoke (el aviso de confirmación no llega).

alter table public.receta_ingredientes add column if not exists texto text;

-- Al copiar recetas a una casa nueva, también se copia el texto tal cual.
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
  insert into public.receta_ingredientes (hogar_id, receta_id, articulo_id, cantidad, nota, orden, texto)
  select p_destino, nr.id, na.id, i.cantidad, i.nota, i.orden, i.texto
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
