-- Fase 3: tiques (Lidl Plus y los demás) leídos en el móvil.
-- Guarda el tique y sus líneas. En los de Lidl, cada línea se convierte en un producto de Lidl con su precio
-- (origen 'tique'), que es como Lidl entra en la comparación de precios.
-- Sin "drop" ni "revoke" a propósito.

-- Cantidad en kg de las líneas al peso ("1,234 kg"): para el resumen de gastos.
alter table public.tique_lineas add column if not exists kg boolean not null default false;

/**
 * p_lineas: [{ texto, cantidad, precio_unidad, importe, descuento, kg, articulo_id }]
 * Devuelve el id del tique.
 */
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
  if p_super is not null and not exists (select 1 from public.supermercados where id = p_super) then
    raise exception 'Supermercado desconocido';
  end if;

  insert into public.tiques (id, hogar_id, supermercado_id, fecha, total, estado)
  values (p_id, p_hogar, p_super, p_fecha, p_total, 'revisado');

  for l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    prod := null;
    art := nullif(l->>'articulo_id', '')::uuid;
    if art is not null and not exists (select 1 from public.articulos where id = art and hogar_id = p_hogar) then
      art := null;
    end if;

    -- Lidl: el texto del tique es el producto; el precio, lo pagado por envase (o por kg).
    if p_super = 'lidl' and coalesce(l->>'texto', '') <> '' then
      insert into public.productos_super (supermercado_id, id_externo, nombre, cantidad, unidad, actualizado_en)
      values ('lidl', lower(trim(l->>'texto')), trim(l->>'texto'),
              case when (l->>'kg')::boolean then 1000 else null end,
              case when (l->>'kg')::boolean then 'g'::public.unidad_base else null end, now())
      on conflict (supermercado_id, id_externo) do update set actualizado_en = now(), activo = true
      returning id into prod;

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
              case when coalesce((l->>'descuento')::numeric, 0) > 0 then 'con descuento Lidl Plus' end);

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

grant execute on function public.guardar_tique(uuid, text, timestamptz, numeric, jsonb, uuid) to authenticated;

-- Cambios en vivo de los tiques entre los dos móviles.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['tiques', 'tique_lineas'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
