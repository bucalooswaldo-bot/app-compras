-- Fase 1: casa compartida, recetas, plan semanal, despensa y lista de la compra.
-- También deja creadas las tablas de tiques (fotos de tiques y resumen de gastos llegan en fases 3-4).
-- Requiere 0001_comparador_precios.sql (hogares, hogar_miembros, es_miembro, articulos, unidad_base).
--
-- Todo lo de una casa lleva hogar_id y solo lo ven y cambian sus miembros (RLS).
-- Los ids los genera la app (uuid) para poder funcionar igual sin conexión en el modo prueba.

-- ---------------------------------------------------------------------------
-- Casa: código de invitación para que el segundo móvil se una
-- ---------------------------------------------------------------------------
alter table public.hogares
  add column if not exists codigo text unique
  default upper(substr(md5(gen_random_uuid()::text), 1, 6));

update public.hogares set codigo = upper(substr(md5(gen_random_uuid()::text), 1, 6)) where codigo is null;

-- Crea una casa y mete dentro al usuario actual. Si ya tiene casa, devuelve esa.
create or replace function public.crear_hogar(p_nombre text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  h uuid;
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
  return h;
end;
$$;

-- Une al usuario actual a la casa del código. Máximo 6 personas por casa.
create or replace function public.unirse_hogar(p_codigo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  h uuid;
begin
  if auth.uid() is null then
    raise exception 'Hace falta iniciar sesión';
  end if;
  select id into h from public.hogares where codigo = upper(trim(p_codigo));
  if h is null then
    raise exception 'Código no válido';
  end if;
  if (select count(*) from public.hogar_miembros where hogar_id = h) >= 6 then
    raise exception 'Esta casa ya está completa';
  end if;
  insert into public.hogar_miembros (hogar_id, user_id) values (h, auth.uid())
  on conflict do nothing;
  return h;
end;
$$;

revoke all on function public.crear_hogar(text), public.unirse_hogar(text) from public, anon;
grant execute on function public.crear_hogar(text), public.unirse_hogar(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Artículos: lo que ella compra ("Arroz", "Leche"). Ya existe en 0001; se añade la sección.
-- ---------------------------------------------------------------------------
alter table public.articulos add column if not exists categoria text not null default 'Otros';
alter table public.articulos add column if not exists creado_en timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Despensa: cuánto hay en casa de cada artículo y por debajo de cuánto avisar.
-- Cantidades en la unidad base del artículo (g, ml o ud).
-- ---------------------------------------------------------------------------
create table if not exists public.despensa (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  articulo_id uuid not null unique references public.articulos (id) on delete cascade,
  cantidad numeric not null default 0 check (cantidad >= 0),
  minimo numeric not null default 0 check (minimo >= 0),
  actualizado_en timestamptz not null default now()
);

-- Suma (o resta, con delta negativo) a la despensa sin bajar de cero.
-- Lo usan "comprado" y "cocinado". Con RLS: solo funciona con artículos de la propia casa.
create or replace function public.sumar_despensa(p_articulo uuid, p_delta numeric)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  h uuid;
  resultado numeric;
begin
  select hogar_id into h from public.articulos where id = p_articulo;
  if h is null or not public.es_miembro(h) then
    raise exception 'Artículo no encontrado';
  end if;
  insert into public.despensa (hogar_id, articulo_id, cantidad)
  values (h, p_articulo, greatest(0, p_delta))
  on conflict (articulo_id) do update
    set cantidad = greatest(0, public.despensa.cantidad + p_delta),
        actualizado_en = now()
  returning cantidad into resultado;
  return resultado;
end;
$$;

revoke all on function public.sumar_despensa(uuid, numeric) from public, anon;
grant execute on function public.sumar_despensa(uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Recetas
-- ---------------------------------------------------------------------------
create table if not exists public.recetas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  nombre text not null,
  raciones integer not null default 4 check (raciones > 0),
  tiempo_min integer,
  pasos text not null default '',
  etiquetas text[] not null default '{}',
  favorita boolean not null default false,
  origen text not null default 'manual' check (origen in ('ia', 'manual')),
  creado_en timestamptz not null default now()
);

-- cantidad null = "al gusto": no entra en la lista de la compra.
create table if not exists public.receta_ingredientes (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  receta_id uuid not null references public.recetas (id) on delete cascade,
  articulo_id uuid not null references public.articulos (id) on delete cascade,
  cantidad numeric check (cantidad is null or cantidad >= 0),
  nota text,
  orden integer not null default 0
);

create index if not exists receta_ingredientes_receta_idx on public.receta_ingredientes (receta_id);

-- ---------------------------------------------------------------------------
-- Plan semanal: qué receta se come cada día (comida o cena) y para cuántos.
-- ---------------------------------------------------------------------------
create table if not exists public.plan_comidas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  fecha date not null,
  momento text not null check (momento in ('comida', 'cena')),
  receta_id uuid not null references public.recetas (id) on delete cascade,
  raciones numeric not null check (raciones > 0),
  cocinado boolean not null default false
);

create index if not exists plan_comidas_fecha_idx on public.plan_comidas (hogar_id, fecha);

-- ---------------------------------------------------------------------------
-- Lista de la compra.
-- Lo que sale de las recetas y de los mínimos se calcula en la app al vuelo;
-- aquí se guarda lo añadido a mano y lo ya comprado (para deshacer y para el historial).
-- ---------------------------------------------------------------------------
create table if not exists public.lista_compra (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  articulo_id uuid not null references public.articulos (id) on delete cascade,
  cantidad numeric check (cantidad is null or cantidad >= 0),
  origen text not null default 'manual' check (origen in ('manual', 'auto')),
  comprado boolean not null default false,
  comprado_en timestamptz,
  creado_en timestamptz not null default now()
);

create index if not exists lista_compra_hogar_idx on public.lista_compra (hogar_id, comprado);

-- ---------------------------------------------------------------------------
-- Tiques (preparado para fases 3-4: foto del tique, gastos y ahorro).
-- Cada línea puede enlazarse al producto del súper (precios) y al artículo (despensa).
-- ---------------------------------------------------------------------------
create table if not exists public.tiques (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  supermercado_id text references public.supermercados (id),
  fecha timestamptz not null,
  total numeric(10, 2),
  foto_path text,                       -- ruta en Supabase Storage
  estado text not null default 'pendiente' check (estado in ('pendiente', 'leido', 'revisado')),
  creado_en timestamptz not null default now()
);

create table if not exists public.tique_lineas (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  tique_id uuid not null references public.tiques (id) on delete cascade,
  texto text not null,                  -- tal cual sale en el tique
  cantidad numeric,                     -- envases o kg, según el tique
  precio_unidad numeric(10, 2),
  importe numeric(10, 2) not null,
  descuento numeric(10, 2) not null default 0,
  producto_id uuid references public.productos_super (id) on delete set null,
  articulo_id uuid references public.articulos (id) on delete set null
);

create index if not exists tiques_fecha_idx on public.tiques (hogar_id, fecha desc);
create index if not exists tique_lineas_tique_idx on public.tique_lineas (tique_id);

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
alter table public.despensa            enable row level security;
alter table public.recetas             enable row level security;
alter table public.receta_ingredientes enable row level security;
alter table public.plan_comidas        enable row level security;
alter table public.lista_compra        enable row level security;
alter table public.tiques              enable row level security;
alter table public.tique_lineas        enable row level security;

revoke all on public.despensa, public.recetas, public.receta_ingredientes, public.plan_comidas,
  public.lista_compra, public.tiques, public.tique_lineas from anon;

grant select, insert, update, delete on public.despensa, public.recetas, public.receta_ingredientes,
  public.plan_comidas, public.lista_compra, public.tiques, public.tique_lineas to authenticated;

-- Cambiar el nombre de la casa
grant update (nombre) on public.hogares to authenticated;
drop policy if exists "renombrar mi casa" on public.hogares;
create policy "renombrar mi casa" on public.hogares
  for update to authenticated using (public.es_miembro(id)) with check (public.es_miembro(id));

do $$
declare
  t text;
begin
  foreach t in array array['despensa', 'recetas', 'receta_ingredientes', 'plan_comidas',
                           'lista_compra', 'tiques', 'tique_lineas'] loop
    execute format('drop policy if exists "de mi casa" on public.%I', t);
    execute format(
      'create policy "de mi casa" on public.%I for all to authenticated
         using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id))', t);
  end loop;
end $$;

-- Cambios en vivo entre los dos móviles (solo existe en Supabase).
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['articulos', 'despensa', 'recetas', 'receta_ingredientes',
                             'plan_comidas', 'lista_compra'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
