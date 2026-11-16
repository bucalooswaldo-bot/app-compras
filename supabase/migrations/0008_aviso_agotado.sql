-- Aviso «cuando no quede»: además del mínimo (avisar al quedar X), se puede pedir que avise al llegar a 0.
-- minimo > 0           -> avisa al quedar esa cantidad o menos
-- avisar_agotado = true -> avisa cuando ya no hay (cantidad 0)
-- Solo añade una columna; no toca datos.
alter table public.despensa add column if not exists avisar_agotado boolean not null default false;
