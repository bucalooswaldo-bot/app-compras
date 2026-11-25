-- Cantidad libre en la lista de la compra: "3 lonchas", "2 paquetes", "1 bandeja grande".
-- Se usa cuando la cantidad no es de la unidad del artículo (g, ml o ud). Si hay número de su unidad,
-- va en "cantidad" como siempre (y es la que se suma a la despensa).
-- Solo añade una columna; no toca datos.
alter table public.lista_compra add column if not exists cantidad_texto text
  check (cantidad_texto is null or length(cantidad_texto) <= 60);
