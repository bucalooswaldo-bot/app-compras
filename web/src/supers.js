// Supermercados: las cadenas conocidas de España y los que cada casa añade a mano.
// Los de la casa son los que ha elegido, más los que han salido en sus tiques.

import { normalizar } from './logica.js';

/** Cadenas conocidas: [id, nombre, cómo se reconoce en el texto de un tique]. */
export const CADENAS = [
  ['mercadona', 'Mercadona', /mercadona/],
  ['lidl', 'Lidl', /\blidl\b/],
  ['carrefour', 'Carrefour', /carrefour/],
  ['dia', 'Dia', /\bdia\s?(%|retail|s\.?a\.?|market|supermercado)|distribuidora internacional de alimentacion/],
  ['alcampo', 'Alcampo', /alcampo|auchan/],
  ['aldi', 'Aldi', /\baldi\b/],
  ['eroski', 'Eroski', /eroski/],
  ['consum', 'Consum', /\bconsum\b/],
  ['hiperdino', 'HiperDino', /hiper\s?dino|dinosol|superdino/],
  ['ahorramas', 'Ahorramás', /ahorramas/],
  ['bm', 'BM Supermercados', /\bbm supermercados|uvesco/],
  ['gadis', 'Gadis', /\bgadis\b/],
  ['froiz', 'Froiz', /\bfroiz\b/],
  ['bonpreu', 'Bonpreu', /bon\s?preu|esclat/],
  ['caprabo', 'Caprabo', /caprabo/],
  ['coviran', 'Covirán', /coviran/],
  ['masymas', 'Masymas', /masymas|mas y mas/],
  ['spar', 'Spar', /\bspar\b/],
  ['elcorteingles', 'El Corte Inglés', /corte ingles|hipercor|supercor/],
  ['familycash', 'Family Cash', /family cash/],
];

/**
 * Súper de la casa, en el orden en que se enseñan: [id, nombre].
 * Es un array que se cambia en su sitio (ponerSupers) para que todas las pantallas lo vean igual.
 */
export const SUPERS = [];
/** Solo los ids de SUPERS (donde se busca lo comprado). */
export const SUPERS_WEB = [];

const nombreCadena = (id) => CADENAS.find((c) => c[0] === id)?.[1];

/** Nombre para enseñar de un súper (cadena conocida, uno de la casa o el id tal cual). */
export function nombreSuper(id) {
  if (!id) return 'Sin súper';
  return SUPERS.find((s) => s[0] === id)?.[1] ?? nombreCadena(id) ?? id;
}

/**
 * Súper de la casa a partir de sus datos: los elegidos (tabla supermercados_casa) en su orden,
 * y detrás los que salen en tiques y no están elegidos.
 */
export function supersDe(datos) {
  const elegidos = [...(datos.supers ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const salida = elegidos.map((s) => [s.clave, s.nombre || nombreCadena(s.clave) || s.clave]);
  const ya = new Set(salida.map((s) => s[0]));
  for (const t of datos.tiques ?? []) {
    const id = t.supermercado_id;
    if (id && !ya.has(id)) {
      salida.push([id, nombreCadena(id) ?? id]);
      ya.add(id);
    }
  }
  return salida;
}

export function ponerSupers(datos) {
  const lista = supersDe(datos);
  SUPERS.splice(0, SUPERS.length, ...lista);
  SUPERS_WEB.splice(0, SUPERS_WEB.length, ...lista.map((s) => s[0]));
  return SUPERS;
}

/** Clave para un súper escrito a mano: "Frutería Pepe" -> "propio-fruteria-pepe". */
export function clavePropia(nombre) {
  const base = normalizar(nombre).replace(/[^a-z0-9ñ]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `propio-${base || 'super'}`;
}

/** Si el nombre escrito es una cadena conocida, su id; si no, una clave propia. */
export function claveDeNombre(nombre) {
  const t = normalizar(nombre).trim();
  const cadena = CADENAS.find(([id, n, re]) => normalizar(n) === t || id === t || re.test(t));
  return cadena ? cadena[0] : clavePropia(nombre);
}

/**
 * Qué súper es un tique por su texto: primero los de la casa escritos a mano (por su nombre),
 * luego las cadenas conocidas. null si no se sabe.
 */
export function detectarSuper(texto, propios = SUPERS) {
  const t = normalizar(texto);
  for (const [id, nombre] of propios) {
    if (!id.startsWith('propio-')) continue;
    const n = normalizar(nombre).trim();
    if (n.length >= 3 && t.includes(n)) return id;
  }
  for (const [id, , re] of CADENAS) if (re.test(t)) return id;
  return null;
}
