-- Lista de la compra por WhatsApp con enlace para ir marcando.
--
-- Al enviar la lista se crea un enlace secreto (token largo y aleatorio) que abre web/lista.html.
-- Esa página no inicia sesión: solo ve ESA lista (nombre, cantidad, sección) y puede marcar lo que coge.
-- No ve recetas, despensa ni nada más de la casa.
-- Marcar desde el enlace hace lo mismo que el círculo de la app: tacha la cosa y la suma a la despensa.
-- El enlace caduca al acabar el día siguiente (hora de Canarias) o al «Terminar la compra» en la app.
--
-- Seguridad: las tablas no se abren a anon. Solo dos funciones (SECURITY DEFINER) aceptan el token.
-- Solo añade tablas y funciones; no toca datos.

create table if not exists public.listas_compartidas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  titulo text not null,
  creado_en timestamptz not null default now(),
  caduca_en timestamptz not null
);

create table if not exists public.lista_compartida_cosas (
  id uuid primary key default gen_random_uuid(),
  enlace_id uuid not null references public.listas_compartidas (id) on delete cascade,
  orden integer not null,
  articulo_id uuid not null references public.articulos (id) on delete cascade,
  lista_id uuid,            -- fila de lista_compra si ya existía (lo apuntado a mano / «para hoy»)
  marcada_id uuid,          -- fila de lista_compra que se tachó desde el enlace
  cantidad numeric,
  nombre text not null,
  detalle text,
  categoria text not null default 'Otros'
);

create index if not exists lista_compartida_cosas_enlace_idx on public.lista_compartida_cosas (enlace_id, orden);
create index if not exists listas_compartidas_hogar_idx on public.listas_compartidas (hogar_id, caduca_en);

alter table public.listas_compartidas     enable row level security;
alter table public.lista_compartida_cosas enable row level security;
revoke all on public.listas_compartidas, public.lista_compartida_cosas from anon, authenticated;

-- Los de la casa pueden ver y cerrar (caducar) sus enlaces; nada más.
grant select on public.listas_compartidas to authenticated;
grant update (caduca_en) on public.listas_compartidas to authenticated;
drop policy if exists "mis enlaces" on public.listas_compartidas;
create policy "mis enlaces" on public.listas_compartidas
  for all to authenticated using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id));

-- ---------------------------------------------------------------------------
-- Crear el enlace (desde la app, con sesión). Devuelve el token.
-- p_cosas: [{ articulo_id, lista_id?, cantidad?, nombre, detalle?, categoria? }] en el orden de la lista.
-- ---------------------------------------------------------------------------
create or replace function public.crear_lista_compartida(p_hogar uuid, p_titulo text, p_cosas jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.listas_compartidas;
  c jsonb;
  n integer := 0;
begin
  if not public.es_miembro(p_hogar) then
    raise exception 'No es tu casa';
  end if;
  if jsonb_typeof(p_cosas) <> 'array' or jsonb_array_length(p_cosas) = 0 or jsonb_array_length(p_cosas) > 300 then
    raise exception 'Lista vacía o demasiado larga';
  end if;
  -- Limpieza: enlaces caducados hace más de una semana.
  delete from public.listas_compartidas where hogar_id = p_hogar and caduca_en < now() - interval '7 days';

  insert into public.listas_compartidas (hogar_id, titulo, caduca_en)
  values (p_hogar, left(coalesce(nullif(trim(p_titulo), ''), 'Lista de la compra'), 80),
          (date_trunc('day', now() at time zone 'Atlantic/Canary') + interval '2 days') at time zone 'Atlantic/Canary')
  returning * into e;

  for c in select * from jsonb_array_elements(p_cosas) loop
    n := n + 1;
    -- Solo artículos de esta casa; la fila de la lista, solo si es de esta casa y de ese artículo.
    insert into public.lista_compartida_cosas (enlace_id, orden, articulo_id, lista_id, cantidad, nombre, detalle, categoria)
    select e.id, n, a.id,
           (select l.id from public.lista_compra l
             where l.id = nullif(c ->> 'lista_id', '')::uuid and l.hogar_id = p_hogar and l.articulo_id = a.id),
           nullif(c ->> 'cantidad', '')::numeric,
           left(coalesce(nullif(c ->> 'nombre', ''), a.nombre), 120),
           left(nullif(c ->> 'detalle', ''), 120),
           left(coalesce(nullif(c ->> 'categoria', ''), 'Otros'), 60)
      from public.articulos a
     where a.id = (c ->> 'articulo_id')::uuid and a.hogar_id = p_hogar;
  end loop;
  return e.token;
end;
$$;

-- La fila de lista_compra que cuenta como «cogida» para una cosa del enlace (o null):
-- la tachada desde el enlace, la de la lista si ya está tachada, o la tachada en la app después de enviar.
create or replace function public.lista_compartida_fila(e public.listas_compartidas, c public.lista_compartida_cosas)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select l.id from public.lista_compra l
   where l.hogar_id = e.hogar_id and l.comprado
     and (l.id = c.marcada_id or l.id = c.lista_id
          or (l.articulo_id = c.articulo_id and l.comprado_en >= e.creado_en))
   order by (l.id = c.marcada_id) desc, (l.id = c.lista_id) desc, l.comprado_en desc
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Ver la lista del enlace (sin sesión). null si no existe o ha caducado.
-- ---------------------------------------------------------------------------
create or replace function public.ver_lista_compartida(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e public.listas_compartidas;
begin
  select * into e from public.listas_compartidas where token = p_token and caduca_en > now();
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'titulo', e.titulo,
    'caduca_en', e.caduca_en,
    'cosas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'nombre', c.nombre, 'detalle', c.detalle, 'categoria', c.categoria,
               'cogido', public.lista_compartida_fila(e, c) is not null) order by c.orden)
        from public.lista_compartida_cosas c where c.enlace_id = e.id), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Marcar o desmarcar una cosa desde el enlace (sin sesión). Hace lo mismo que la app:
-- marcar -> tachada en la lista y sumada a la despensa; desmarcar -> al revés.
-- Devuelve la lista entera (como ver_lista_compartida).
-- ---------------------------------------------------------------------------
create or replace function public.marcar_lista_compartida(p_token text, p_cosa uuid, p_cogido boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.listas_compartidas;
  c public.lista_compartida_cosas;
  l public.lista_compra;
  fila uuid;
  unidad text;
  cant numeric;
begin
  select * into e from public.listas_compartidas where token = p_token and caduca_en > now();
  if not found then
    raise exception 'Este enlace ya ha caducado';
  end if;
  select * into c from public.lista_compartida_cosas where id = p_cosa and enlace_id = e.id for update;
  if not found then
    raise exception 'No está en esta lista';
  end if;
  fila := public.lista_compartida_fila(e, c);

  if p_cogido and fila is null then
    select a.unidad into unidad from public.articulos a where a.id = c.articulo_id;
    select * into l from public.lista_compra where id = c.lista_id and hogar_id = e.hogar_id;
    cant := coalesce(l.cantidad, c.cantidad);
    if cant is null and unidad = 'ud' then cant := 1; end if;
    if l.id is not null then
      update public.lista_compra set comprado = true, comprado_en = now(), cantidad = cant where id = l.id;
      fila := l.id;
    else
      insert into public.lista_compra (hogar_id, articulo_id, cantidad, origen, comprado, comprado_en)
      values (e.hogar_id, c.articulo_id, cant, 'auto', true, now())
      returning id into fila;
    end if;
    if coalesce(cant, 0) > 0 then
      insert into public.despensa (hogar_id, articulo_id, cantidad)
      values (e.hogar_id, c.articulo_id, cant)
      on conflict (articulo_id) do update
        set cantidad = public.despensa.cantidad + excluded.cantidad, actualizado_en = now();
    end if;
    update public.lista_compartida_cosas set marcada_id = fila where id = c.id;

  elsif not p_cogido and fila is not null then
    select * into l from public.lista_compra where id = fila;
    if l.por_pagar then
      -- En el carro del «modo compra» de la app: se saca del carro, como en la app.
      update public.lista_compra set comprado = false, comprado_en = null, por_pagar = false, super_id = null,
        producto_id = null, envases = null, precio = null where id = l.id;
    else
      if coalesce(l.cantidad, 0) > 0 then
        update public.despensa set cantidad = greatest(0, cantidad - l.cantidad), actualizado_en = now()
         where articulo_id = l.articulo_id and hogar_id = e.hogar_id;
      end if;
      if l.origen = 'auto' then
        delete from public.lista_compra where id = l.id;
      else
        update public.lista_compra set comprado = false, comprado_en = null where id = l.id;
      end if;
    end if;
    update public.lista_compartida_cosas set marcada_id = null where id = c.id;
  end if;

  return public.ver_lista_compartida(p_token);
end;
$$;

revoke all on function public.crear_lista_compartida(uuid, text, jsonb) from public, anon;
grant execute on function public.crear_lista_compartida(uuid, text, jsonb) to authenticated;
revoke all on function public.lista_compartida_fila(public.listas_compartidas, public.lista_compartida_cosas) from public, anon, authenticated;
revoke all on function public.ver_lista_compartida(text) from public;
grant execute on function public.ver_lista_compartida(text) to anon, authenticated;
revoke all on function public.marcar_lista_compartida(text, uuid, boolean) from public;
grant execute on function public.marcar_lista_compartida(text, uuid, boolean) to anon, authenticated;
