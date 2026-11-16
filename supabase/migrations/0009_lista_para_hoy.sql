-- Lista de la compra en dos partes y compra en el súper.
--   para_hoy   -> está en «Compra de hoy» (si no, en «Falta en casa»)
--   por_pagar  -> está en el carro durante la compra; pasa a la despensa y a Gastos al pagar
--   super_id, producto_id, envases, precio -> en qué súper, qué producto, cuántos y cuánto (total) se ha cogido
-- Solo añade columnas; no toca datos.
alter table public.lista_compra add column if not exists para_hoy boolean not null default false;
alter table public.lista_compra add column if not exists por_pagar boolean not null default false;
alter table public.lista_compra add column if not exists super_id text references public.supermercados (id);
alter table public.lista_compra add column if not exists producto_id uuid references public.productos_super (id) on delete set null;
alter table public.lista_compra add column if not exists envases numeric check (envases is null or envases > 0);
alter table public.lista_compra add column if not exists precio numeric(10, 2) check (precio is null or precio >= 0);
