-- Comparador de precios: productos, precios, equivalencias y preferencias.
-- Prueba de concepto. Pensado para Supabase (Postgres 15+).
--
-- Idea general:
--   * "productos_super" es lo que vende cada súper (un envase concreto: "Tomate triturado Hacendado 400 g").
--   * "articulos" es lo que ella piensa comprar ("tomate triturado"). Cada casa tiene los suyos.
--   * "equivalencias" une un artículo con los productos de cada súper que le valen.
--   * "precios" guarda cada precio visto, con su origen (web, tique, folleto, a mano) y su fecha.
--   * "preferencias" dice qué productos o marcas le gustan, no le gustan o son obligatorios.

-- ---------------------------------------------------------------------------
-- Casa compartida (si la fase 1 ya crea estas tablas, quitar este bloque)
-- ---------------------------------------------------------------------------
create table if not exists public.hogares (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  creado_en timestamptz not null default now()
);

create table if not exists public.hogar_miembros (
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (hogar_id, user_id)
);

-- ¿El usuario actual pertenece a esta casa? (security definer para no chocar con RLS)
create or replace function public.es_miembro(h uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hogar_miembros
    where hogar_id = h and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Catálogo (común, lo escriben solo las tareas programadas)
-- ---------------------------------------------------------------------------
create table if not exists public.supermercados (
  id text primary key,                 -- 'mercadona' | 'hiperdino' | 'lidl'
  nombre text not null
);

insert into public.supermercados (id, nombre) values
  ('mercadona', 'Mercadona'),
  ('hiperdino', 'HiperDino'),
  ('lidl', 'Lidl')
on conflict (id) do nothing;

-- Unidad base para comparar: gramos, mililitros o unidades.
do $$ begin
  create type public.unidad_base as enum ('g', 'ml', 'ud');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.origen_precio as enum ('web', 'tique', 'folleto', 'manual');
exception when duplicate_object then null; end $$;

create table if not exists public.productos_super (
  id uuid primary key default gen_random_uuid(),
  supermercado_id text not null references public.supermercados (id),
  id_externo text not null,            -- id del producto en la web del súper (o nombre normalizado si no hay)
  nombre text not null,
  marca text,
  formato text,                        -- texto tal cual lo da el súper: "Bote 400 g", "Paquete"
  cantidad numeric,                    -- tamaño total del envase en la unidad base (400 para 400 g)
  unidad public.unidad_base,
  ean text,                            -- código de barras, si se conoce
  imagen_url text,                     -- enlace a la foto del súper (no se descarga)
  url text,                            -- enlace a la ficha en la web del súper
  seguir boolean not null default false,  -- true = se actualiza su precio en la tarea semanal
  activo boolean not null default true,   -- false = ya no aparece en la web
  actualizado_en timestamptz not null default now(),
  unique (supermercado_id, id_externo)
);

create index if not exists productos_super_ean_idx on public.productos_super (ean) where ean is not null;

create table if not exists public.precios (
  id bigint generated always as identity primary key,
  producto_id uuid not null references public.productos_super (id) on delete cascade,
  precio numeric(10, 2) not null check (precio >= 0),        -- precio del envase
  precio_anterior numeric(10, 2),                            -- si está de oferta, el de antes
  -- Precio por kg, litro o unidad: lo calculamos siempre nosotros a partir del envase.
  precio_por_unidad numeric(12, 4),
  origen public.origen_precio not null,
  visto_en timestamptz not null default now(),
  hogar_id uuid references public.hogares (id) on delete cascade, -- solo para tiques/manual: quién lo aportó
  nota text
);

create index if not exists precios_producto_fecha_idx on public.precios (producto_id, visto_en desc);

-- Último precio conocido de cada producto.
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
order by p.producto_id, p.visto_en desc;

-- ---------------------------------------------------------------------------
-- Lo de cada casa: artículos, equivalencias y preferencias
-- ---------------------------------------------------------------------------
create table if not exists public.articulos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  nombre text not null,                -- "Tomate triturado"
  unidad public.unidad_base not null,  -- en qué se mide lo que se necesita
  unique (hogar_id, nombre)
);

create table if not exists public.equivalencias (
  articulo_id uuid not null references public.articulos (id) on delete cascade,
  producto_id uuid not null references public.productos_super (id) on delete cascade,
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  primary key (articulo_id, producto_id)
);

do $$ begin
  create type public.tipo_preferencia as enum ('favorito', 'no_gusta', 'obligatorio');
exception when duplicate_object then null; end $$;

-- Una preferencia apunta a un producto concreto o a una marca entera (una de las dos).
create table if not exists public.preferencias (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  tipo public.tipo_preferencia not null,
  producto_id uuid references public.productos_super (id) on delete cascade,
  marca text,
  articulo_id uuid references public.articulos (id) on delete cascade, -- opcional: limita la preferencia a un artículo
  check ((producto_id is null) <> (marca is null))
);

-- ---------------------------------------------------------------------------
-- Permisos (RLS): el catálogo lo lee cualquier usuario con sesión;
-- lo de cada casa solo lo ven y cambian sus miembros.
-- Las tareas programadas escriben con la clave de servicio, que se salta RLS.
-- ---------------------------------------------------------------------------
alter table public.hogares         enable row level security;
alter table public.hogar_miembros  enable row level security;
alter table public.supermercados   enable row level security;
alter table public.productos_super enable row level security;
alter table public.precios         enable row level security;
alter table public.articulos       enable row level security;
alter table public.equivalencias   enable row level security;
alter table public.preferencias    enable row level security;

revoke all on public.hogares, public.hogar_miembros, public.supermercados, public.productos_super,
  public.precios, public.articulos, public.equivalencias, public.preferencias from anon;

grant select on public.supermercados, public.productos_super, public.precio_actual to authenticated;
grant select, insert on public.precios to authenticated;
grant select on public.hogares, public.hogar_miembros to authenticated;
grant select, insert, update, delete on public.articulos, public.equivalencias, public.preferencias to authenticated;

create policy "ver mi casa" on public.hogares
  for select to authenticated using (public.es_miembro(id));

create policy "ver miembros de mi casa" on public.hogar_miembros
  for select to authenticated using (public.es_miembro(hogar_id));

create policy "catálogo de súper visible" on public.supermercados
  for select to authenticated using (true);

create policy "catálogo de productos visible" on public.productos_super
  for select to authenticated using (true);

create policy "precios visibles" on public.precios
  for select to authenticated using (hogar_id is null or public.es_miembro(hogar_id));

-- Desde la app solo se añaden precios de tique o a mano, siempre de la propia casa.
create policy "añadir precio de tique o a mano" on public.precios
  for insert to authenticated
  with check (origen in ('tique', 'manual') and hogar_id is not null and public.es_miembro(hogar_id));

create policy "artículos de mi casa" on public.articulos
  for all to authenticated
  using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id));

create policy "equivalencias de mi casa" on public.equivalencias
  for all to authenticated
  using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id));

create policy "preferencias de mi casa" on public.preferencias
  for all to authenticated
  using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id));
