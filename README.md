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

## Cómo encaja con los precios (fase 2)

Todo gira alrededor de los **artículos** ("Arroz", "Leche"): las recetas, la despensa y la lista apuntan a ellos.
En la fase 2, la tabla `equivalencias` une cada artículo con los productos de Mercadona e HiperDino que le valen,
y la cesta más barata se calcula sobre la lista que ya genera esta app.

## Pendiente

- La versión compartida se publica sola en GitHub Pages al cambiar `main` (`.github/workflows/publicar.yml`), tras pasar las pruebas.
- Lector de código de barras para la despensa (Chrome en Android lo permite).
- Alergias o productos prohibidos (por preguntar).
