-- Lista de la compra en dos partes: "Para hoy" (lo que se compra en la próxima visita al súper)
-- y "Más adelante" (todo lo demás). Solo añade una columna; no toca datos.
alter table public.lista_compra add column if not exists para_hoy boolean not null default false;
