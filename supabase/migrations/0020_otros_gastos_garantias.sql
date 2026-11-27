-- Otros gastos de casa (lo que no es del súper) y garantías. Decidido por Oswaldo el 27/11/2026.
-- - Un interruptor por casa (ajustes_casa.otros_gastos). Apagado por defecto; encendido en la casa de Mary.
-- - Los tiques pueden ser de otra tienda: llevan `tipo` (droguería, farmacia, ropa, casa, otros) y `tienda`.
--   Los tiques sin tipo son los del súper, como hasta ahora.
-- - Garantías: qué es, dónde, cuándo se compró, hasta cuándo, y la foto del tique (cajón "fotos" de la casa).
-- Sin "drop" ni borrados de datos.

-- 1. Ajustes de cada casa
create table if not exists public.ajustes_casa (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null unique references public.hogares (id) on delete cascade,
  otros_gastos boolean not null default false,
  creado_en timestamptz not null default now()
);
alter table public.ajustes_casa enable row level security;
grant select, insert, update, delete on public.ajustes_casa to authenticated;
create policy "de mi casa" on public.ajustes_casa for all to authenticated
  using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id));

-- La casa de Mary (la casa plantilla) lo tiene encendido
insert into public.ajustes_casa (hogar_id, otros_gastos)
select id, true from public.hogares where plantilla
on conflict (hogar_id) do update set otros_gastos = true;

-- 2. Tiques de otras tiendas
alter table public.tiques add column if not exists tipo text
  check (tipo is null or tipo in ('drogueria', 'farmacia', 'ropa', 'casa', 'otros'));
alter table public.tiques add column if not exists tienda text check (tienda is null or length(tienda) <= 80);

-- 3. Garantías
create table if not exists public.garantias (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  tique_id uuid references public.tiques (id) on delete set null,
  que text not null check (length(que) between 1 and 80),
  tienda text check (tienda is null or length(tienda) <= 80),
  comprado date not null,
  hasta date not null,
  foto_path text,                       -- foto del tique, en fotos/<hogar_id>/…
  creado_en timestamptz not null default now()
);
create index if not exists garantias_hogar_idx on public.garantias (hogar_id, hasta);
alter table public.garantias enable row level security;
grant select, insert, update, delete on public.garantias to authenticated;
create policy "de mi casa" on public.garantias for all to authenticated
  using (public.es_miembro(hogar_id)) with check (public.es_miembro(hogar_id));

-- Que el otro móvil vea los cambios al momento
do $$ begin
  alter publication supabase_realtime add table public.ajustes_casa, public.garantias;
exception when others then null;
end $$;
