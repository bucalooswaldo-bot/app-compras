// Comparar precios: cálculos sin pantalla ni base de datos (se prueban con `node --test`).
//
//   entenderDictado: "necesito aceite sal tomate triturado y 2 kilos de papas" -> cosas sueltas
//   sugerir:         de lo que devuelve el buscador de un súper, cuál encaja y sale más barato
//   calcularCesta:   cuánto cuesta la lista en cada súper y cuánto se ahorra repartiéndola

import { normalizar, redondear } from './logica.js';

// Los súper de la casa viven en supers.js (cadenas conocidas + los que se añaden a mano).
import { SUPERS } from './supers.js';
export { SUPERS, SUPERS_WEB, nombreSuper } from './supers.js';

// Solo se recomienda ir a dos súper si se ahorra al menos esto (euros).
export const AHORRO_MINIMO_PARA_REPARTIR = 3;

// ---------------------------------------------------------------------------
// Palabras
// ---------------------------------------------------------------------------
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'con', 'para', 'o', 'y', 'a', 'al', 'un', 'una']);

/** Plural a singular, a lo bruto: "huevos" -> "huevo", "champiñones" -> "champinon". */
export function raiz(palabra) {
  const p = normalizar(palabra);
  if (p.length > 4 && /[^aeiou]es$/.test(p)) return p.slice(0, -2);
  if (p.length > 3 && p.endsWith('s')) return p.slice(0, -1);
  return p;
}

const palabras = (texto) => normalizar(texto).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(Boolean);
export const palabrasClave = (texto) => palabras(texto).filter((p) => !VACIAS.has(p) && !/^\d/.test(p));

// En Canarias se dice distinto que en la web de Mercadona.
const SINONIMOS = { papas: 'patatas', papa: 'patata', millo: 'maiz', guayabo: 'guayaba' };

/** Texto que se manda al buscador del súper: "Millo (mazorca)" -> "maiz", "Azafrán o colorante" -> "Azafrán". */
export function textoBusqueda(nombre, detalle, supermercado) {
  let t = String(nombre).replace(/\([^)]*\)/g, ' ').split(/\s+o\s+/i)[0];
  if (detalle) t += ` ${detalle}`;
  t = t.replace(/\s+/g, ' ').trim();
  if (supermercado === 'mercadona') {
    t = t.split(' ').map((w) => SINONIMOS[normalizar(w)] ?? w).join(' ');
  }
  return t;
}

// ---------------------------------------------------------------------------
// Dictado: separar una frase en cosas sueltas
// ---------------------------------------------------------------------------
const RELLENO = new Set([
  'necesito', 'necesitamos', 'quiero', 'queremos', 'hace', 'hacen', 'falta', 'faltan', 'nos', 'me', 'compra',
  'comprar', 'compramos', 'apunta', 'apuntar', 'añade', 'anade', 'añadir', 'anadir', 'agrega', 'pon', 'poner',
  'tambien', 'ademas', 'luego', 'tenemos', 'que', 'hay', 'traer', 'trae', 'coger', 'coge', 'algo', 'por', 'favor',
  'el', 'la', 'los', 'las', 'unos', 'unas', 'de', 'del', 'mas',
]);

const NUMEROS = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, medio: 0.5, media: 0.5, quince: 15, veinte: 20,
};

// Unidad dicha -> [unidad base, factor]; null = envases ("dos paquetes")
const UNIDADES_DICHAS = {
  kilo: ['g', 1000], kilos: ['g', 1000], kg: ['g', 1000], gramos: ['g', 1], gramo: ['g', 1], g: ['g', 1],
  litro: ['ml', 1000], litros: ['ml', 1000], l: ['ml', 1000], ml: ['ml', 1], mililitros: ['ml', 1],
  docena: ['ud', 12], docenas: ['ud', 12], unidades: ['ud', 1], unidad: ['ud', 1],
  paquete: null, paquetes: null, bote: null, botes: null, lata: null, latas: null, botella: null, botellas: null,
  bolsa: null, bolsas: null, brik: null, briks: null, brick: null, bricks: null, carton: null, cartones: null,
  caja: null, cajas: null, tarro: null, tarros: null, pack: null, malla: null, barra: null, barras: null,
  loncha: null, lonchas: null, rodaja: null, rodajas: null, filete: null, filetes: null, pieza: null, piezas: null,
  sobre: null, sobres: null, bandeja: null, bandejas: null, tarrina: null, tarrinas: null, rebanada: null, rebanadas: null,
  botellin: null, botellines: null, garrafa: null, garrafas: null, manojo: null, manojos: null, racimo: null, racimos: null,
  tableta: null, tabletas: null, rollo: null, rollos: null, packs: null, mallas: null, cuña: null, cuñas: null, cuna: null, cunas: null,
  vaso: null, vasos: null, cartón: null, tarrito: null, tarritos: null, cabeza: null, cabezas: null, diente: null, dientes: null,
};

/** Palabras para pedir por envase o trozo, para elegir al poner la cantidad a mano. */
export const ENVASES = ['paquetes', 'latas', 'botes', 'botellas', 'bolsas', 'lonchas', 'filetes', 'bandejas', 'cajas', 'docenas'];

/** "lonchas", 1 -> "loncha"; "latas", 3 -> "latas". */
export function envaseSegun(envase, n) {
  const e = String(envase ?? '').trim();
  if (n !== 1) return e;
  if (/(on|or|al|el)es$/i.test(e)) return e.slice(0, -2);   // botellines -> botellín no; cartones -> carton
  return e.replace(/s$/i, '');
}

/** Cantidad dicha como texto para la lista: "3 lonchas", "2 paquetes", "1,5 kg", "6". */
export function textoCantidadDicha(cosa) {
  if (cosa?.cantidad == null) return null;
  const num = (n) => String(redondear(n, 3)).replace('.', ',');
  if (cosa.envase) return `${num(cosa.cantidad)} ${envaseSegun(cosa.envase, cosa.cantidad)}`;
  if (cosa.unidad === 'g') return cosa.cantidad >= 1000 ? `${num(cosa.cantidad / 1000)} kg` : `${num(cosa.cantidad)} g`;
  if (cosa.unidad === 'ml') return cosa.cantidad >= 1000 ? `${num(cosa.cantidad / 1000)} l` : `${num(cosa.cantidad)} ml`;
  return num(cosa.cantidad);
}

// Palabras que, detrás de un artículo, lo describen ("leche sin lactosa", "aceite de girasol")
// en vez de empezar otra cosa de la lista.
const DESCRIPTIVAS = new Set([
  'entera', 'entero', 'desnatada', 'desnatado', 'semidesnatada', 'semi', 'integral', 'integrales', 'natural',
  'naturales', 'light', 'zero', 'grande', 'grandes', 'pequeño', 'pequeña', 'pequeno', 'pequena', 'fresco', 'fresca',
  'frescos', 'frescas', 'congelado', 'congelada', 'congelados', 'congeladas', 'blanco', 'blanca', 'blancos',
  'negro', 'negra', 'rojo', 'roja', 'rojos', 'verde', 'verdes', 'dulce', 'salado', 'salada', 'picante', 'ecologico',
  'ecologica', 'bio', 'extra', 'virgen', 'refinado', 'girasol', 'oliva', 'molido', 'molida', 'rallado', 'rallada',
  'frito', 'frita', 'fritos', 'fritas', 'cocido', 'cocidos', 'cocida', 'cocidas', 'tierno', 'curado', 'semicurado', 'viejo', 'griego', 'griegos',
  'fino', 'gordo', 'largo', 'redondo', 'vaporizado', 'basmati', 'campero', 'camperos', 'xl', 'l', 'm',
]);
const UNEN = new Set(['sin', 'con', 'de', 'del', 'para', 'en', 'al', 'a']);

// Marcas habituales (para "leche puleva" o "atún calvo"). Las del catálogo de la casa se añaden al llamar.
export const MARCAS = [
  'hacendado', 'puleva', 'pascual', 'asturiana', 'central lechera asturiana', 'kaiku', 'danone', 'nestle', 'gallo',
  'bimbo', 'calvo', 'isabel', 'orlando', 'apis', 'solis', 'carbonell', 'coosur', 'ybarra', 'hojiblanca', 'borges',
  'brillante', 'sos', 'la fallera', 'cola cao', 'colacao', 'nesquik', 'nocilla', 'tulipan', 'flora', 'president',
  'garcia baquero', 'el pozo', 'elpozo', 'campofrio', 'oscar mayer', 'coca cola', 'pepsi', 'fanta', 'mahou',
  'tropical', 'dorada', 'firgas', 'tirma', 'celgan', 'kalise', 'flor de guia', 'arehucas', 'ifa', 'ifa eliges',
  'hiperdino', 'bosque verde', 'deliplus', 'granja riosol', 'riosol', 'kellogg', 'kelloggs', 'gullon', 'cuetara',
  'maggi', 'knorr', 'gallina blanca', 'heinz', 'hellmann', 'hellmanns', 'ligeresa', 'nescafe', 'marcilla',
  'saimaza', 'la piara', 'litoral', 'fontaneda', 'oreo', 'chips ahoy', 'dodot', 'colhogar', 'scottex', 'fairy',
  'ariel', 'skip', 'mimosin', 'sanex', 'colgate', 'larios', 'clesa', 'yoplait', 'alpro', 'vivesoy', 'don simon',
  'la casera', 'nestea', 'aquarius', 'chovi', 'ybarra', 'kikkoman', 'barilla', 'gallo', 'la cocinera', 'pescanova',
  'findus', 'la sirena', 'auchan', 'el corte ingles', 'dia', 'eroski', 'carrefour', 'milbona', 'pilos',
];

/**
 * Separa lo dictado o escrito en cosas sueltas.
 * @param {string} texto
 * @param {{id:string, nombre:string, unidad:string}[]} articulos  los de la casa
 * @param {string[]} [marcas]  marcas conocidas (además de MARCAS)
 * @returns {{nombre:string, articulo:object|null, cantidad:number|null, unidad:string|null, detalle:string|null}[]}
 */
/** Un "artículo" que en realidad es una frase dictada entera ("Necesito aceite sal tomate…"). */
export function pareceFrase(nombre) {
  const p = palabras(String(nombre).replace(/\([^)]*\)/g, ' '));
  return p.length >= 2 && (RELLENO.has(p[0]) || (p.length >= 4 && /,|\sy\s/i.test(nombre)));
}

export function entenderDictado(texto, articulos, marcas = []) {
  // Diccionario de nombres conocidos (y su primera palabra si no se repite: "aceite" -> "Aceite de oliva").
  const conocidos = new Map();
  const primeras = new Map();
  for (const a of articulos) {
    const p = palabras(a.nombre.replace(/\([^)]*\)/g, ' '));
    if (!p.length || pareceFrase(a.nombre)) continue;
    conocidos.set(p.map(raiz).join(' '), a);
    const alt = a.nombre.match(/\(([^)]+)\)/)?.[1];
    if (alt) conocidos.set(palabras(alt).map(raiz).join(' '), a);
    if (p.length > 1 && p[0].length >= 3) primeras.set(raiz(p[0]), primeras.has(raiz(p[0])) ? null : a);
  }
  for (const [k, a] of primeras) if (a && !conocidos.has(k)) conocidos.set(k, a);
  const largoMax = Math.max(1, ...[...conocidos.keys()].map((k) => k.split(' ').length));
  const listaMarcas = [...new Set([...MARCAS, ...marcas.map(normalizar)])].map((m) => palabras(m)).filter((m) => m.length);

  const trozos = String(texto ?? '')
    .split(/[,;.\n]+|\s+y\s+|\s+e\s+(?=[aeiou]?[^aeiou\s])|\s+(?:tambien|también|además|ademas|luego|y\s+luego)\s+/i)
    .map((t) => t.trim())
    .filter(Boolean);

  const salida = [];
  for (const trozo of trozos) {
    // Palabras tal cual (para los nombres) y sin acentos (para comparar)
    const orig = trozo.toLowerCase().replace(/[^\p{L}\p{N}.,]+/gu, ' ').replace(/(?<!\d)[.,]|[.,](?!\d)/g, ' ').split(/\s+/).filter(Boolean);
    const t = orig.map((w) => normalizar(w));
    let i = 0;
    let actual = null;      // la cosa que se está formando
    let pendiente = null;   // cantidad dicha antes del nombre: { cantidad, unidad }
    const cerrar = () => { if (actual) salida.push(actual); actual = null; };
    const nueva = (nombre, articulo) => {
      cerrar();
      actual = { nombre, articulo, cantidad: null, unidad: null, detalle: null, ...(pendiente ?? {}) };
      pendiente = null;
    };
    const anadirDetalle = (w) => { actual.detalle = actual.detalle ? `${actual.detalle} ${w}` : w; };

    while (i < t.length) {
      const w = t[i];
      const sig = t[i + 1];
      // 1. Cantidad: "2", "dos", "medio kilo", "una docena de", "3 latas de"
      const esUno = w === 'un' || w === 'una' || w === 'uno';
      const n = /^\d+(?:[.,]\d+)?$/.test(w) ? Number(w.replace(',', '.')) : NUMEROS[w];
      if (n != null && (!esUno || (sig != null && sig in UNIDADES_DICHAS))) {
        let cantidad = n, unidad = null, envase = null;
        i++;
        if (t[i] != null && t[i] in UNIDADES_DICHAS) {
          const u = UNIDADES_DICHAS[t[i]];
          if (u) { cantidad = redondear(n * u[1], 3); unidad = u[0]; } else envase = orig[i];
          i++;
        }
        if (t[i] === 'de' || t[i] === 'del') i++;
        // Cantidad detrás del nombre y al final ("leche 6", "tomates 1 kg"): es de lo anterior.
        if (actual && actual.cantidad == null && i >= t.length) {
          Object.assign(actual, envase ? { cantidad, unidad, envase } : { cantidad, unidad });
          continue;
        }
        cerrar();
        pendiente = envase ? { cantidad, unidad, envase } : { cantidad, unidad };
        continue;
      }
      // Nombre conocido más largo que empiece aquí
      let encontrado = null, largo = 0;
      for (let k = Math.min(largoMax, t.length - i); k >= 1; k--) {
        const clave = t.slice(i, i + k).map(raiz).join(' ');
        if (conocidos.has(clave)) { encontrado = conocidos.get(clave); largo = k; break; }
      }
      // 2. Detrás de "sin", "con", "de"…: describe lo anterior ("leche sin lactosa", "pan sin sal")
      if (actual?.detalle && UNEN.has(actual.detalle.split(' ').at(-1))) {
        anadirDetalle(orig.slice(i, i + (largo || 1)).join(' '));
        i += largo || 1;
        continue;
      }
      // 3. Artículo conocido: empieza una cosa nueva
      if (encontrado) {
        nueva(encontrado.nombre, encontrado);
        i += largo;
        continue;
      }
      // 4. Marca conocida detrás de una cosa ("leche puleva")
      const marca = actual && listaMarcas.find((m) => m.every((x, j) => t[i + j] === x));
      if (marca) { anadirDetalle(orig.slice(i, i + marca.length).join(' ')); i += marca.length; continue; }
      // 5. "de", "sin", "con" detrás de una cosa
      if (actual && UNEN.has(w)) { anadirDetalle(orig[i]); i++; continue; }
      // 6. Palabras de relleno ("necesito", "nos hace falta")
      if (RELLENO.has(w) || esUno) { i++; continue; }
      // 7. Descripciones ("entera", "integral")
      if (actual && DESCRIPTIVAS.has(w)) { anadirDetalle(orig[i]); i++; continue; }
      // 8. Palabra desconocida: se suma a la cosa desconocida en marcha o empieza otra.
      if (actual && !actual.articulo && !actual.detalle) actual.nombre = `${actual.nombre} ${orig[i]}`;
      else nueva(orig[i], null);
      i++;
    }
    cerrar();
  }

  // Limpieza: "de" suelto al final del detalle; nombre nuevo con mayúscula.
  return salida.map((c) => {
    let detalle = c.detalle?.replace(/(^|\s+)(de|del|con|sin|para|en|al|a)$/, '').trim() || null;
    const nombre = c.articulo ? c.articulo.nombre : c.nombre[0].toUpperCase() + c.nombre.slice(1);
    return { ...c, nombre, detalle };
  });
}

/** Cantidad dicha pasada a la unidad del artículo (o null si no encaja: "2 paquetes" de algo en gramos). */
export function cantidadParaArticulo(cosa, unidadArticulo) {
  if (cosa.cantidad == null) return null;
  if (cosa.unidad == null) return unidadArticulo === 'ud' ? cosa.cantidad : null;
  return cosa.unidad === unidadArticulo ? cosa.cantidad : null;
}

/** Unidad para un artículo nuevo, según cómo se pidió. */
export const unidadNueva = (cosa) => cosa.unidad ?? 'ud';

// ---------------------------------------------------------------------------
// Elegir producto entre los resultados del buscador
// ---------------------------------------------------------------------------
const textoProducto = (p) => palabras(`${p.nombre} ${p.marca ?? ''}`);

/** ¿La palabra del producto es la pedida (o su plural)? "sal" no vale para "salmón". */
const casa = (w, c) => w === c || (c.length >= 5 && w.startsWith(c));

/** ¿Este producto lleva todas estas palabras (o sus plurales)? */
export function encaja(producto, claves) {
  const ws = textoProducto(producto).map(raiz);
  return claves.every((c) => ws.some((w) => casa(w, raiz(c))));
}

/** Cuántas de las palabras lleva. */
function aciertos(producto, claves) {
  const ws = textoProducto(producto).map(raiz);
  return claves.filter((c) => ws.some((w) => casa(w, raiz(c)))).length;
}

// Palabras que convierten el producto en otra cosa ("huevos de codorniz", "margarina con sal"):
// cuentan como tres palabras de más, salvo que se pidan.
const RAREZAS = new Set(['codorniz', 'lactosa', 'gluten', 'ecologico', 'ecologica', 'bio', 'light', 'zero', 'infantil',
  'perro', 'gato', 'lavavajilla', 'spray', 'margarina', 'ultracongelado', 'ultracongelada', 'microonda', 'cocido',
  'cocida', 'frita', 'frito', 'sabor', 'snack', 'aroma', 'polvo', 'edulcorante', 'glas', 'vainillado'].map((w) => w));

const MEDIDAS = new Set(['kg', 'g', 'gr', 'grs', 'l', 'lt', 'ml', 'cl', 'ud', 'uds', 'u', 'x', 'pack', 'peso', 'al']);

/** Palabras del nombre que no se pidieron (ni son marca ni medida): "Patatas prefritas corte fino" -> 3. */
function sobrantes(producto, claves) {
  const marca = new Set(palabras(producto.marca ?? '').map(raiz));
  const pedidas = claves.map(raiz);
  return palabras(producto.nombre)
    .filter((w) => !VACIAS.has(w) && !MEDIDAS.has(w) && !/^\d/.test(w))
    .map(raiz)
    .filter((w) => !marca.has(w) && !pedidas.some((c) => casa(w, c)))
    .reduce((n, w) => n + (RAREZAS.has(w) ? 3 : 1), 0);
}

/** ¿El nombre (quitando la marca) empieza por lo pedido? "Sal fina" sí; "Margarina con sal" no. */
function empiezaPor(producto, clave) {
  const marca = new Set(palabras(producto.marca ?? '').map(raiz));
  const ws = palabras(producto.nombre).map(raiz);
  const primera = ws.find((w) => !marca.has(w) && !VACIAS.has(w));
  // "Papa seleccionada kg": a veces la "marca" leída es el propio producto.
  return (!!primera && casa(primera, raiz(clave))) || (!!ws[0] && casa(ws[0], raiz(clave)));
}

/**
 * De los resultados de un súper, el que mejor encaja con lo pedido y sale más barato.
 *   1. Tiene que llevar las palabras pedidas (las de la marca o el tipo, todas).
 *   2. Ganan los más parecidos a lo pedido: "Patatas" antes que "Patatas prefritas ultracongeladas".
 *   3. Formato normal: el que basta para la cantidad pedida o, sin cantidad, el más cercano a 1 kg / 1 l / 12 ud
 *      (para no proponer una garrafa de 5 l ni un sobre de 100 g).
 *   4. De esos, el más barato por kg, litro o unidad.
 * @param {object[]} resultados  productos del buscador, en el orden en que los da el súper
 * @param {{nombre:string, detalle?:string|null, unidad:string, cantidad?:number|null}} pedido
 * @param {(p:object)=>boolean} [vale]  filtro de preferencias ("no me gusta")
 */
export function sugerir(resultados, pedido, vale = () => true) {
  const claves = palabrasClave(textoBusqueda(pedido.nombre, null, null).split(' ')
    .map((w) => SINONIMOS[normalizar(w)] && resultados.some((r) => encaja(r, [SINONIMOS[normalizar(w)]])) ? SINONIMOS[normalizar(w)] : w)
    .join(' '));
  const detalle = palabrasClave(pedido.detalle ?? '');
  let candidatos = resultados.slice(0, 12).filter((p) => Number.isFinite(p.precio) && vale(p));
  if (detalle.length) candidatos = candidatos.filter((p) => encaja(p, detalle));
  if (!claves.length || !candidatos.length) return null;
  // Tienen que llevar la primera palabra; ganan los que llevan más palabras de lo pedido…
  candidatos = candidatos.filter((p) => encaja(p, claves.slice(0, 1)));
  if (!candidatos.length) return null;
  const cabeza = candidatos.filter((p) => empiezaPor(p, claves[0]));
  if (cabeza.length) candidatos = cabeza;
  const max = Math.max(...candidatos.map((p) => aciertos(p, claves)));
  candidatos = candidatos.filter((p) => aciertos(p, claves) === max);
  // …y los que menos palabras añaden.
  const todas = [...claves, ...detalle];
  const min = Math.min(...candidatos.map((p) => sobrantes(p, todas)));
  candidatos = candidatos.filter((p) => sobrantes(p, todas) <= min + 1);
  // Misma unidad que el artículo, si los hay.
  const misma = candidatos.filter((p) => p.unidad === pedido.unidad && p.cantidad);
  if (misma.length) candidatos = misma;
  const conTam = candidatos.filter((p) => p.cantidad);
  if (pedido.cantidad && conTam.length && conTam[0].unidad === pedido.unidad) {
    // Con cantidad: lo que cueste menos comprar esa cantidad.
    return [...conTam].sort((a, b) => coste(pedido, a).total - coste(pedido, b).total || precioUnidad(a) - precioUnidad(b))[0];
  }
  if (conTam.length > 1) {
    const objetivo = conTam[0].unidad === 'ud' ? 12 : 1000;
    const lejania = (x) => Math.abs(Math.log(x / objetivo));
    const ref = conTam.map((p) => p.cantidad).sort((a, b) => lejania(a) - lejania(b))[0];
    candidatos = candidatos.filter((p) => !p.cantidad || (p.cantidad >= ref / 2 && p.cantidad <= ref * 2));
  }
  return [...candidatos].sort((a, b) => precioUnidad(a) - precioUnidad(b) || a.precio - b.precio)[0] ?? null;
}

export function precioUnidad(p) {
  if (p.precio_por_unidad != null) return Number(p.precio_por_unidad);
  if (!p.cantidad) return Infinity;
  return p.unidad === 'ud' ? p.precio / p.cantidad : (p.precio / p.cantidad) * 1000;
}

export function etiquetaUnidad(unidad) {
  return { g: '€/kg', ml: '€/l', ud: '€/ud' }[unidad] ?? '';
}

// ---------------------------------------------------------------------------
// Cesta
// ---------------------------------------------------------------------------
/** Cuántos envases hacen falta y cuánto cuestan. aprox = no se pudo calcular con la cantidad. */
export function coste(item, producto) {
  if (!Number.isFinite(producto.precio)) return null;
  if (item.cantidad == null || !producto.cantidad || producto.unidad !== item.unidad) {
    // Sin cantidad (o medida distinta, p. ej. cebollas por unidades y malla en kg): un envase.
    const envases = item.cantidad != null && item.unidad === 'ud' && !producto.cantidad ? Math.ceil(item.cantidad) : 1;
    return { envases, total: redondear(envases * producto.precio), aprox: item.cantidad != null };
  }
  const envases = Math.max(1, Math.ceil(item.cantidad / producto.cantidad - 1e-9));
  return { envases, total: redondear(envases * producto.precio), aprox: false };
}

/**
 * @param {{clave:string, nombre:string, cantidad:number|null, unidad:string,
 *          candidatos: Record<string, object[]>}[]} items  candidatos ya filtrados por preferencias
 * @param {string[]} supers
 */
export function calcularCesta(items, supers = SUPERS.map((s) => s[0])) {
  const lineas = items.map((item) => {
    const porSuper = {};
    for (const s of supers) {
      const cands = (item.candidatos[s] ?? []).filter((p) => Number.isFinite(p.precio));
      if (!cands.length) continue;
      if (item.cantidad == null) {
        // Sin cantidad: el más barato por kg/l/ud, un envase.
        const p = [...cands].sort((a, b) => precioUnidad(a) - precioUnidad(b) || a.precio - b.precio)[0];
        porSuper[s] = { producto: p, envases: 1, total: redondear(p.precio), aprox: false };
      } else {
        porSuper[s] = cands.map((p) => ({ producto: p, ...coste(item, p) }))
          .sort((a, b) => a.total - b.total || precioUnidad(a.producto) - precioUnidad(b.producto))[0];
      }
    }
    // Sin cantidad y con envases de distinto tamaño (malla de 3 kg frente a 1 kg): se compara lo mismo,
    // el precio del envase más pequeño, calculado por kg/l/ud.
    const opciones = Object.values(porSuper);
    if (item.cantidad == null && opciones.length > 1) {
      const tams = opciones.map((o) => o.producto.cantidad);
      const unidades = new Set(opciones.map((o) => o.producto.unidad));
      if (tams.every((t) => t > 0) && unidades.size === 1 && Math.max(...tams) / Math.min(...tams) > 1.25) {
        const para = Math.min(...tams);
        for (const o of opciones) {
          if (o.producto.cantidad === para) continue;
          o.total = redondear(precioUnidad(o.producto) * (o.producto.unidad === 'ud' ? para : para / 1000));
          o.aprox = true;
          o.para = { cantidad: para, unidad: o.producto.unidad };
        }
      }
    }
    const disponibles = Object.keys(porSuper);
    const mejor = disponibles.length
      ? disponibles.reduce((a, b) => (porSuper[b].total < porSuper[a].total ? b : a))
      : null;
    return { item, porSuper, mejor };
  });

  // Se comparan los súper con precio para al menos la mitad de lo que tiene precio
  // (un súper con pocos precios de tiques entra en el reparto pero no en el total).
  const conPrecio = lineas.filter((l) => l.mejor).length;
  const activos = supers.filter((s) => {
    const n = lineas.filter((l) => l.porSuper[s]).length;
    return n > 0 && n >= conPrecio / 2;
  });
  const comunes = lineas.filter((l) => activos.length && activos.every((s) => l.porSuper[s]));
  const totales = Object.fromEntries(activos.map((s) => [s,
    redondear(comunes.reduce((t, l) => t + l.porSuper[s].total, 0))]));
  const masBarato = comunes.length ? activos.reduce((a, b) => (totales[b] < totales[a] ? b : a)) : null;
  const repartido = redondear(comunes.reduce((t, l) => t + l.porSuper[l.mejor].total, 0));
  const ahorro = masBarato ? redondear(totales[masBarato] - repartido) : 0;
  const soloEn = Object.fromEntries(supers.map((s) => [s,
    lineas.filter((l) => l.porSuper[s] && Object.keys(l.porSuper).length === 1)]));
  const sinPrecio = lineas.filter((l) => !l.mejor);

  // Si se reparte: qué se compra en cada súper (cada cosa, en el más barato).
  const reparto = Object.fromEntries(supers.map((s) => [s, lineas.filter((l) => l.mejor === s)]));
  const totalReparto = Object.fromEntries(supers.map((s) => [s,
    redondear(reparto[s].reduce((t, l) => t + l.porSuper[s].total, 0))]));

  let recomendacion;
  if (!masBarato) recomendacion = { tipo: 'sin_datos' };
  else if (ahorro >= AHORRO_MINIMO_PARA_REPARTIR) recomendacion = { tipo: 'repartir', ahorro };
  else recomendacion = { tipo: 'uno', supermercado: masBarato, ahorro, diferencia: diferenciaCon(totales, masBarato) };

  return { lineas, activos, comunes: comunes.length, totales, masBarato, repartido, ahorro, soloEn, sinPrecio, reparto,
    totalReparto, recomendacion };
}

function diferenciaCon(totales, ganador) {
  const otros = Object.entries(totales).filter(([s]) => s !== ganador).map(([, t]) => t);
  return otros.length ? redondear(Math.min(...otros) - totales[ganador]) : 0;
}

export const euros = (n) => (n == null ? '–' : `${n.toFixed(2).replace('.', ',')} €`);
