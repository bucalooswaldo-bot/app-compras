# Compras de casa (fase 1)

App web para el móvil (se instala en la pantalla de inicio desde Chrome) con:

- **Recetas**: 20 recetas de inicio propuestas por la IA (cocina casera y canaria), favoritas, etiquetas, raciones ajustables, crear y editar.
- **Plan**: próximos 7 días, comida y cena. "Hecho" descuenta los ingredientes de la despensa (y se puede deshacer).
- **Despensa**: qué hay en casa (solo cantidades), con mínimo opcional. Botones + y − para ajustar rápido.
- **Lista de la compra**: se calcula sola con
  `lo que piden las recetas del plan + el mínimo − lo que hay en casa`,
  ordenada por secciones del súper. Se pueden añadir cosas a mano. Al marcar algo como comprado pasa a la despensa
  (y se puede cambiar la cantidad comprada o deshacer).
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

## Comparar precios (fase 2)

- **Dictar la lista**: en Lista se puede escribir o dictar una frase entera ("necesito aceite, sal, leche puleva y 2 kilos de papas").
  La app la separa en cosas sueltas, con cantidad y marca o tipo (`web/src/comparar.js`, `entenderDictado`).
- **¿Dónde sale más barato?**: para cada cosa busca su producto en Mercadona (precios de Gran Canaria) e HiperDino,
  elige el más barato de los que encajan (o el que ella elija a mano, que se recuerda) y calcula el total en cada súper
  y cuánto se ahorra repartiendo. Solo recomienda ir a dos súper si se ahorran 3 € o más.
- **"No me gusta"**: una marca marcada así no se vuelve a proponer.
- **De dónde salen los precios**: la función `precios` de Supabase (`supabase/functions/precios/`) es la única que habla
  con las webs de los súper. Solo busca cuando hay una cosa nueva sin producto, y cada día a las 04:00 (UTC) refresca los
  productos enlazados cuyo precio tiene más de 6 días: cada producto se consulta como mucho una vez por semana.
  Si un súper cambia su web, se arregla su bloque en `lectores.ts`.
- **Lidl** no tiene web de precios: sus precios salen de los tiques que se guardan (ver abajo). En la comparación
  aparece cuando hay precios de Lidl para al menos la mitad de la lista; si no, cuenta solo en "Si repartes".

## Tiques y gastos (fase 3)

- Pestaña **Gastos**: "Añadir tique" con una foto del tique de papel o una captura del tique de Lidl Plus.
  El texto se lee en el propio móvil con Tesseract (`web/vendor/ocr/`, se descarga la primera vez, unos 10 MB);
  la foto no se sube a ningún sitio. `web/src/tiques.js` saca súper, fecha, total y líneas (cantidades, peso, descuentos).
- Antes de guardar se revisa: cada línea se puede corregir y enlazar a un artículo de la casa (se propone solo).
  Al guardar se puede tachar de la lista lo comprado.
- La función `guardar_tique` (`supabase/migrations/0004_tiques.sql`) guarda el tique y, si es de Lidl, crea el producto
  de Lidl con su precio y lo enlaza con el artículo: así Lidl entra en la comparación.
- Resumen por semana, mes y año, por súper, y cuánto se habría ahorrado comprando cada cosa donde hoy está más barata.

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

## Fotos de las recetas

- En cada receta: "📷 Añadir foto" abre la cámara o la galería del móvil. La foto se reduce en el móvil (1280 px) antes de guardarse.
- Se guardan en Supabase Storage, cajón privado `fotos`, carpeta `<hogar_id>/` (`supabase/migrations/0005_fotos_recetas.sql`). Solo la propia casa puede verlas; la app usa direcciones temporales de 1 día.
- Las recetas sin foto muestran un dibujo según su tipo (pescado, pasta, cuchara…).
- En modo prueba la foto se guarda en el propio móvil, más pequeña (640 px).
