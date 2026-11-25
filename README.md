# Menuda (antes «Compras de casa»)

App web para el móvil (se instala en la pantalla de inicio desde Chrome) con:

- **Recetas**: 20 recetas de inicio propuestas por la IA (cocina casera y canaria), favoritas, etiquetas, raciones ajustables, crear y editar (todas, también las propuestas). Ingredientes uno por fila con cantidad y unidad, elegidos de un listado o separados de un texto pegado (`src/ingredientes.js`).
- **Plan**: próximos 7 días: comida, cena, postre y tentempié (migración `0006`), eligiendo la receta de un listado con foto. "Hecho" descuenta los ingredientes de la despensa (y se puede deshacer).
- **Despensa**: qué hay en casa (solo cantidades), con mínimo opcional. Botones + y − para ajustar rápido. "He gastado…" (escrito o dictado: "bote de tomate triturado, bolsa de papas Munchitos") resta de la despensa tras confirmar, y pregunta lo que no reconoce (`src/consumo.js`). "Repasar despensa" manda a la lista, con un toque, lo que queda poco o ya no hay.
- **Lista de la compra**: se calcula sola con
  `lo que piden las recetas del plan + el mínimo − lo que hay en casa`,
  ordenada por secciones del súper. Se pueden añadir cosas a mano. Al marcar algo como comprado pasa a la despensa
  (y se puede cambiar la cantidad comprada o deshacer). Los ingredientes sin cantidad ("lechuga") también entran si no hay en casa, salvo los básicos (sal, aceite, especias). Lo que sale solo se puede quitar de la lista del día (✕, "hoy no"; vuelve al día siguiente o con ↩), y debajo se proponen las cosas que se compran a menudo y no hay en casa.
- **Casa compartida**: cada persona entra con su correo; la segunda se une con un código de 6 letras. Los cambios
  aparecen en el otro móvil al momento.

## Dos modos

- **Prueba** (`web/config-prueba.js`, o añadir `?prueba` a la dirección): todo se guarda en el propio dispositivo.
  Es la versión publicada como enlace para probarla.
- **Compartido** (`web/config.js`): usa el proyecto de Supabase **app-compras** (Fráncfort).

## Carpetas

- `web/`: la app tal cual se publica. No necesita compilar nada.
  - `src/logica.js`: los cálculos (lista automática, unidades, fechas). Probados en `test/logica.test.js`.
  - `src/almacen.js`: guarda los datos (en el móvil o en Supabase).
  - `src/app.js`: las pantallas.
  - `src/recetas-inicio.js`: recetas y artículos de inicio.
  - `vendor/`: Preact + htm y supabase-js copiados (sin dependencias externas).
- `supabase/migrations/`:
  - `0001_comparador_precios.sql`: casa, artículos, productos de cada súper, precios, equivalencias y preferencias (de la prueba de precios).
  - `0002_fase1.sql`: código de invitación, despensa, recetas, plan, lista y, ya preparadas para más adelante, las tablas de **tiques** (foto del tique, líneas con precio, enlace al producto del súper y al artículo) para el resumen de gastos y ahorro.
- `test/`: pruebas (`npm test`) y pruebas de permisos de la base de datos (`sql-pruebas.sql`).

## Precios y supermercados (desde la versión 44)

- **La app no lee ninguna web de supermercados** (decidido el 23/11/2026, para poder venderla). Se quitó la función
  `precios` y su tarea diaria; los precios que se leyeron de las webs ya no cuentan (`precio_actual` solo ve los de tiques
  o puestos a mano). Migración `0014_sin_webs_super_libres.sql`.
- **Todos los precios salen de los tiques** de cada casa, y lo aprendido de los tiques de una casa solo lo ve esa casa.
- **Supermercados libres** (`web/src/supers.js`): cadenas de toda España reconocidas en el tique y súper escritos a mano.
  Ajustes → Mis supermercados, al revisar un tique o al ir a comprar.
- **¿Dónde sale más barato?** compara con lo que la casa pagó en cada súper. **Dictar la lista** y **"No me gusta"** siguen igual.
- El código de barras se consulta en Open Food Facts (base de datos abierta), desde el móvil.
- **Recetario de la app** (en preparación, `recetario/`): índice de platos y recetas escritas para la app.

## Tiques y gastos (fase 3)

- Pestaña **Gastos**: "Añadir tique" con una foto del tique de papel o una captura del tique de Lidl Plus.
  El texto se lee en el propio móvil con Tesseract (`web/vendor/ocr/`, se descarga la primera vez, unos 10 MB);
  la foto no se sube a ningún sitio. `web/src/tiques.js` saca súper, fecha, total y líneas (cantidades, peso, descuentos).
- Antes de guardar se revisa: cada línea se puede corregir y enlazar a un artículo de la casa (se propone solo).
  Al guardar se puede tachar de la lista lo comprado.
- La función `guardar_tique` (versión de la migración `0014`) guarda el tique y convierte cada línea en un producto de ese
  súper para esa casa, con su precio, enlazado al artículo.
- Vale para tiques de cualquier súper (papel o captura de la app del súper).
- Resumen por semana, mes y año, por súper y por sección, y cuánto se habría ahorrado comprando cada cosa donde hoy está más barata.
- "Descargar todos los gastos" baja un CSV (se abre en Excel) con una fila por cosa comprada, para hacer informes.

## Fotos y marcas en la Despensa

- Cada cosa de la despensa lleva la foto de su marca principal (la elegida con ⭐, o la que más compráis).
  Al tocar la foto se ven sus marcas: foto, súper, formato, precio y si se ha comprado.
- Las fotos de Mercadona e HiperDino son las de sus webs (`productos_super.imagen_url`, se enlazan sin copiarlas).
  Las de Lidl se hacen con el móvil y se guardan en el cajón privado de la casa (`equivalencias.foto_path`).
- "Añadir una marca" busca en Mercadona e HiperDino y la enlaza con el artículo (también vale para comparar precios).
- Migración `0007_fotos_productos.sql` (aplicada).

## Menú de la semana (fase 4)

- En Plan, "✨ Proponer el menú de estos 7 días" rellena los huecos libres (`web/src/menu.js`): prioriza lo que hay en
  casa, lo que está de oferta y las favoritas, y no repite lo de las dos últimas semanas ni dos platos del mismo tipo seguidos.
  Se puede quitar lo que no apetezca o pedir otra propuesta. Es todo con reglas, sin IA de pago.

## Cómo encaja con los precios (fase 2)

Todo gira alrededor de los **artículos** ("Arroz", "Leche"): las recetas, la despensa y la lista apuntan a ellos.
En la fase 2, la tabla `equivalencias` une cada artículo con los productos de Mercadona e HiperDino que le valen,
y la cesta más barata se calcula sobre la lista que ya genera esta app.

## Pendiente

- La versión compartida se publica sola en GitHub Pages al cambiar `main` (`.github/workflows/publicar.yml`), tras pasar las pruebas.
- Lector de código de barras para la despensa (Chrome en Android lo permite).
- Alergias o productos prohibidos (por preguntar).

## Recetario de la app (aparte de las recetas de cada casa)

- En **Recetas** hay dos partes: **🏠 Mis recetas** (las que crea o trae cada casa, como las de Mary) y
  **📖 Recetario de la app** (recetas escritas para la app, iguales para todas las casas).
- Las recetas del recetario se escriben por tandas en `recetario/tanda-*.json` (índice de platos en `recetario/platos.py`)
  y `python3 recetario/construir.py` las comprueba y las junta en `web/recetario.json`, que es lo que carga la app.
- Una receta del recetario solo se guarda en la casa cuando se usa (favorita, plan o cocinarla), con `origen = 'app'` y
  `catalogo_id` (migración `0015_recetario_app.sql`). Así cuenta para la lista y la despensa, pero no sale en «Mis recetas».
  «Copiar a mis recetas» hace una copia propia para cambiarla. Las patatas del recetario son las «papas» de la casa si las tiene.
- Al elegir receta para el plan, al buscar salen también las del recetario.

## Fotos de las recetas

- En cada receta: "📷 Añadir foto" abre la cámara o la galería del móvil. La foto se reduce en el móvil (1280 px) antes de guardarse.
- Se guardan en Supabase Storage, cajón privado `fotos`, carpeta `<hogar_id>/` (`supabase/migrations/0005_fotos_recetas.sql`). Solo la propia casa puede verlas; la app usa direcciones temporales de 1 día.
- Las recetas sin foto muestran un dibujo según su tipo (pescado, pasta, cuchara…).
- En modo prueba la foto se guarda en el propio móvil, más pequeña (640 px).
