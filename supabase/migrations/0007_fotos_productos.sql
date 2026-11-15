-- Fotos de los productos en la Despensa.
-- Las de Mercadona e HiperDino ya vienen del súper (productos_super.imagen_url) y se ven directamente.
-- Lidl no tiene catálogo con fotos: cada casa puede hacer la suya, que se guarda con el enlace artículo-producto
-- (equivalencias.foto_path, en el cajón privado "fotos" de la casa).
-- articulos.foto_producto_id: el producto cuya foto representa al artículo (si la casa lo elige).
-- Sin sentencias drop/revoke.

alter table public.equivalencias add column if not exists foto_path text;
alter table public.articulos add column if not exists foto_producto_id uuid references public.productos_super (id) on delete set null;
