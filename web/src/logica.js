// Cálculos de la app, sin pantalla ni base de datos (se prueban con `node --test`).
// "datos" tiene la forma: { articulos, despensa, recetas, ingredientes, plan, lista }
// con los mismos campos que las tablas de Supabase.

// ---------------------------------------------------------------------------
// Fechas (en hora local, como 'AAAA-MM-DD')
// ---------------------------------------------------------------------------
export function fechaISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function sumarDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  return fechaISO(new Date(a, m - 1, d + n));
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function nombreDia(iso, hoy = fechaISO()) {
  if (iso === hoy) return 'Hoy';
  if (iso === sumarDias(hoy, 1)) return 'Mañana';
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  const dia = DIAS[f.getDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${d} ${MESES[m - 1]}`;
}

// ---------------------------------------------------------------------------
// Unidades: todo se guarda en g, ml o ud; se enseña como kg o l cuando es grande.
// ---------------------------------------------------------------------------
export const UNIDADES_ENTRADA = {
  g: [['g', 1], ['kg', 1000]],
  ml: [['ml', 1], ['l', 1000]],
  ud: [['ud', 1]],
};

export function redondear(n, dec = 2) {
  const f = 10 ** dec;
  return Math.round((n + Number.EPSILON) * f) / f;
}

function numero(n) {
  return String(redondear(n, 2)).replace('.', ',');
}

/** 1500, 'g' -> "1,5 kg"; 250, 'ml' -> "250 ml"; 3, 'ud' -> "3 ud" */
export function formatoCantidad(cantidad, unidad) {
  if (cantidad == null) return '';
  if (unidad === 'g') return cantidad >= 1000 ? `${numero(cantidad / 1000)} kg` : `${numero(cantidad)} g`;
  if (unidad === 'ml') return cantidad >= 1000 ? `${numero(cantidad / 1000)} l` : `${numero(cantidad)} ml`;
  return `${numero(cantidad)} ud`;
}

/** Lo que se pone en un campo para editar: [número, unidad de entrada] */
export function aEntrada(cantidad, unidad) {
  if (cantidad == null) return ['', unidad];
  if (unidad === 'g' && cantidad >= 1000) return [numero(cantidad / 1000), 'kg'];
  if (unidad === 'ml' && cantidad >= 1000) return [numero(cantidad / 1000), 'l'];
  return [numero(cantidad), unidad];
}

/** "1,5", 'kg' -> 1500 (null si está vacío o no es un número) */
export function deEntrada(texto, unidadEntrada) {
  const s = String(texto ?? '').trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  const factor = { kg: 1000, l: 1000 }[unidadEntrada] ?? 1;
  return redondear(n * factor, 3);
}

/** Paso de los botones + y − de la despensa */
export function pasoDespensa(unidad, cantidad = 0) {
  if (unidad === 'ud') return 1;
  if (cantidad >= 2000) return 500;
  return unidad === 'g' ? 100 : 250;
}

// ---------------------------------------------------------------------------
// Recetas
// ---------------------------------------------------------------------------
export function escalar(cantidad, racionesReceta, raciones) {
  if (cantidad == null) return null;
  return redondear((cantidad * raciones) / (racionesReceta || 1), 3);
}

/** Ingredientes de una comida del plan, ya escalados a sus raciones. */
export function ingredientesDeComida(datos, comida) {
  const receta = datos.recetas.find((r) => r.id === comida.receta_id);
  if (!receta) return [];
  return datos.ingredientes
    .filter((i) => i.receta_id === receta.id && i.cantidad != null)
    .map((i) => ({
      articulo_id: i.articulo_id,
      cantidad: escalar(i.cantidad, receta.raciones, comida.raciones),
    }));
}

// ---------------------------------------------------------------------------
// Lista de la compra automática
// ---------------------------------------------------------------------------
/**
 * Lo que falta comprar para las comidas planificadas entre `desde` y `hasta` (incluidos)
 * que aún no se han cocinado, más lo que está por debajo del mínimo.
 *
 *   falta = lo que piden las recetas + mínimo − lo que hay en casa   (si sale > 0)
 *
 * Lo que ya está en la lista a mano (sin comprar) se descuenta para no pedirlo dos veces.
 * @returns {Array<{articulo_id, cantidad, recetas: string[], bajoMinimo: boolean}>}
 */
export function faltas(datos, desde, hasta) {
  const necesita = new Map();   // articulo_id -> cantidad
  const porReceta = new Map();  // articulo_id -> Set(nombre de receta)
  const sinCantidad = new Set(); // ingredientes "al gusto" o sin cantidad que no son básicos (sal, aceite…)

  for (const comida of datos.plan) {
    if (comida.cocinado || comida.fecha < desde || comida.fecha > hasta) continue;
    const receta = datos.recetas.find((r) => r.id === comida.receta_id);
    for (const ing of ingredientesDeComida(datos, comida)) {
      necesita.set(ing.articulo_id, (necesita.get(ing.articulo_id) ?? 0) + ing.cantidad);
      if (!porReceta.has(ing.articulo_id)) porReceta.set(ing.articulo_id, new Set());
      if (receta) porReceta.get(ing.articulo_id).add(receta.nombre);
    }
    // Sin cantidad ("lechuga", "un puñado de espinacas"): se pide si no hay en casa, sin decir cuánto.
    for (const i of datos.ingredientes) {
      if (i.receta_id !== comida.receta_id || i.cantidad != null) continue;
      const a = datos.articulos.find((x) => x.id === i.articulo_id);
      if (!a || esBasico(a.nombre)) continue;
      sinCantidad.add(a.id);
      if (!porReceta.has(a.id)) porReceta.set(a.id, new Set());
      if (receta) porReceta.get(a.id).add(receta.nombre);
    }
  }

  const despensa = new Map(datos.despensa.map((d) => [d.articulo_id, d]));
  const enLista = new Map();
  for (const l of datos.lista) {
    if (l.comprado || (esDescarte(l) && !descarteVigente(l, desde))) continue;
    enLista.set(l.articulo_id, (enLista.get(l.articulo_id) ?? 0) + (l.cantidad ?? Infinity));
  }

  const ids = new Set([...necesita.keys(), ...sinCantidad, ...datos.despensa.filter(tieneAviso).map((d) => d.articulo_id)]);
  const resultado = [];
  for (const id of ids) {
    const articulo = datos.articulos.find((a) => a.id === id);
    if (!articulo) continue;
    const d = despensa.get(id);
    const hay = d?.cantidad ?? 0;
    const minimo = d?.minimo ?? 0;
    const pide = necesita.get(id) ?? 0;
    const bajoMinimo = !!d && estaBajo({ ...d, cantidad: hay });
    if (pide === 0 && !bajoMinimo) {
      // Solo lo pide una receta sin cantidad: si no hay nada en casa ni está ya en la lista, se apunta sin cantidad.
      if (sinCantidad.has(id) && hay <= 0 && !enLista.has(id)) {
        resultado.push({ articulo_id: id, cantidad: null, recetas: [...(porReceta.get(id) ?? [])], bajoMinimo: false });
      }
      continue;
    }
    let falta = pide + minimo - hay - (enLista.get(id) ?? 0);
    if (articulo.unidad === 'ud') falta = Math.ceil(falta - 1e-9);
    falta = redondear(falta, 3);
    if (falta <= 0) {
      // Justo en el mínimo ("avísame cuando quede 1"): se apunta sin cantidad, si no está ya en la lista.
      if (bajoMinimo && !enLista.has(id)) resultado.push({ articulo_id: id, cantidad: null, recetas: [...(porReceta.get(id) ?? [])], bajoMinimo });
      continue;
    }
    resultado.push({ articulo_id: id, cantidad: falta, recetas: [...(porReceta.get(id) ?? [])], bajoMinimo });
  }
  return ordenarPorPasillo(resultado, datos.articulos);
}

/** Momentos del día en el plan, en el orden en que se enseñan. */
// ---------------------------------------------------------------------------
// Lista del día
// ---------------------------------------------------------------------------
/** "Hoy no": una línea 'auto' sin comprar dice que eso no hace falta. Solo vale el día en que se puso. */
export const esDescarte = (l) => l.origen === 'auto' && !l.comprado;
export const descarteVigente = (l, hoy) => esDescarte(l) && (l.creado_en ?? '').slice(0, 10) >= hoy;
/** Lo apuntado a mano y aún sin comprar. */
export const pendienteManual = (l) => !l.comprado && l.origen !== 'auto';

/**
 * Lo que soléis comprar (2 veces o más, por tiques o por la lista) y ahora no está en la lista
 * ni hay en casa. Devuelve ids de artículo, lo más comprado primero.
 */
export function sugerirCompra(datos, yaEnLista, max = 8) {
  const veces = new Map();
  const contar = (id) => id && veces.set(id, (veces.get(id) ?? 0) + 1);
  for (const l of datos.tique_lineas ?? []) contar(l.articulo_id);
  for (const l of datos.lista) if (l.comprado) contar(l.articulo_id);
  const hay = new Map(datos.despensa.map((d) => [d.articulo_id, d.cantidad]));
  return [...veces]
    .filter(([id, n]) => n >= 2 && !yaEnLista.has(id) && !(hay.get(id) > 0) && datos.articulos.some((a) => a.id === id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([id]) => id);
}

/** ¿Ha llegado al mínimo que se puso para avisar? */
// Aviso de la despensa como un solo valor: null = sin aviso, 0 = cuando no quede, > 0 = al quedar esa cantidad.
export const avisoDe = (d) => (d?.minimo > 0 ? d.minimo : d?.avisar_agotado ? 0 : null);
export const camposAviso = (v) => ({ minimo: v > 0 ? v : 0, avisar_agotado: v === 0 });
export const tieneAviso = (d) => avisoDe(d) != null;
export const estaBajo = (d) => (d.minimo > 0 && d.cantidad <= d.minimo) || (!!d.avisar_agotado && d.cantidad <= 0);
export const noHay = (d) => tieneAviso(d) && d.cantidad <= 0;

export const MOMENTOS = [['comida', 'Comida'], ['cena', 'Cena'], ['postre', 'Postre'], ['tentempie', 'Tentempié']];
export const nombreMomento = (m) => MOMENTOS.find((x) => x[0] === m)?.[1] ?? m;

/** Lo que se suele tener siempre en casa: sin cantidad en la receta, no entra en la lista. */
const BASICOS = /^(sal|pimienta|aceite|vinagre|agua|especias?|comino|oregano|tomillo|romero|laurel|pimenton|azafran|colorante|picante|canela|nuez moscada|hielo)\b/;
export const esBasico = (nombre) => BASICOS.test(normalizar(nombre));

const ORDEN_CATEGORIAS = [
  'Frutas y verduras', 'Carne', 'Pescado', 'Charcutería y quesos', 'Lácteos y huevos',
  'Panadería', 'Despensa', 'Conservas', 'Congelados', 'Bebidas', 'Droguería', 'Otros',
];

export function ordenCategoria(c) {
  const i = ORDEN_CATEGORIAS.indexOf(c);
  return i === -1 ? ORDEN_CATEGORIAS.length : i;
}

/** Ordena por sección del súper y luego por nombre. */
export function ordenarPorPasillo(filas, articulos) {
  const art = new Map(articulos.map((a) => [a.id, a]));
  return [...filas].sort((x, y) => {
    const a = art.get(x.articulo_id), b = art.get(y.articulo_id);
    return ordenCategoria(a?.categoria) - ordenCategoria(b?.categoria)
      || (a?.nombre ?? '').localeCompare(b?.nombre ?? '', 'es');
  });
}

/** Agrupa filas ({articulo_id,...}) por categoría, en el orden del súper. */
export function agruparPorCategoria(filas, articulos) {
  const art = new Map(articulos.map((a) => [a.id, a]));
  const grupos = new Map();
  for (const f of ordenarPorPasillo(filas, articulos)) {
    const c = art.get(f.articulo_id)?.categoria ?? 'Otros';
    if (!grupos.has(c)) grupos.set(c, []);
    grupos.get(c).push(f);
  }
  return [...grupos.entries()];
}

// ---------------------------------------------------------------------------
// Artículos
// ---------------------------------------------------------------------------
export function normalizar(texto) {
  return String(texto ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function buscarArticulo(articulos, nombre) {
  const n = normalizar(nombre);
  return articulos.find((a) => normalizar(a.nombre) === n) ?? null;
}
