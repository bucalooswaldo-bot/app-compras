-- Plan: además de comida y cena, postre y tentempié.
-- Cambia la regla de valores permitidos de plan_comidas.momento (quitar la antigua y poner la nueva).
-- No borra datos.
alter table public.plan_comidas drop constraint if exists plan_comidas_momento_check;
alter table public.plan_comidas add constraint plan_comidas_momento_check
  check (momento in ('comida', 'cena', 'postre', 'tentempie'));
