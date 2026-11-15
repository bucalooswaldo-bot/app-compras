// "He gastado un bote de mermelada de fresa y una bolsa de papas Munchitos": qué se resta de la despensa.

import { normalizar, pasoDespensa, redondear } from './logica.js';
import { raiz } from './comparar.js';

const NUMEROS = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  doce: 12, medio: 0.5, media: 0.5,
};
// Unidad dicha -> [unidad, factor]; null = envase (bote, bolsa…): se resta "uno" de lo que haya.
const MEDIDAS = {
  kilo: ['g', 1000], kilos: ['g', 1000], kg: ['g', 1000], gramos: ['g', 1], gramo: ['g', 1], g: ['g', 1],
  litro: ['ml', 1000], litros: ['ml', 1000], l: ['ml', 1000], ml: ['ml', 1],
  docena: ['ud', 12], unidad: ['ud', 1], unidades: ['ud', 1],
  bote: null, botes: null, bolsa: null, bolsas: null, lata: null, latas: null, paquete: null, paquetes: null,
  botella: null, botellas: null, brik: null, briks: null, brick: null, tarro: null, tarros: null, caja: null,
  cajas: null, sobre: null, sobres: null, bandeja: null, bandejas: null, barra: null, barras: null, pack: null,
  carton: null, cartones: null, malla: null, tableta: null, tabletas: null,
};
const SOBRAN = new Set([
  'he', 'hemos', 'gastado', 'gastamos', 'gaste', 'usado', 'usamos', 'use', 'abierto', 'abrimos', 'abri', 'se',
  'acabo', 'acabado', 'acabamos', 'terminado', 'terminamos', 'termino', 'consumido', 'quita', 'quitar', 'resta',
  'restar', 'nos', 'hemos', 'comido', 'comimos', 'bebido', 'el', 'la', 'los', 'las', 'de', 'del', 'y', 'tambien',
]);
// Palabras que no ayudan a reconocer el producto ("pequeños", "grande").
const NO_CUENTAN = new Set(['de', 'del', 'con', 'sin', 'en', 'al', 'a', 'o', 'y', 'la', 'el', 'pequeno', 'pequena',
  'grande', 'mediano', 'mediana']);

const claves = (texto) => normalizar(texto).replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9ñ ]/g, ' ')
  .split(/\s+/).filter((w) => w && !NO_CUENTAN.has(w));
// Misma palabra en singular o plural: "tomate"/"tomates", "champiñón"/"champiñones".
const mismo = (a, b) => a === b || raiz(a) === raiz(b) || `${a}s` === b || `${b}s` === a || `${a}es` === b || `${b}es` === a;

/** Parte lo dicho en trozos: uno por producto. */
export function partirConsumo(texto) {
  return String(texto ?? '')
    .split(/[,;.\n]+|\s+y\s+|\s+(?:tambien|también|además|ademas|luego)\s+/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Lee un trozo: "2 botes de tomate triturado" -> { cuantos: 2, medida: null, palabras: ['tomate','triturado'] }.
 */
function leerTrozo(trozo) {
  const w = normalizar(trozo).replace(/[^a-z0-9ñ.,/ ]/g, ' ').split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < w.length && SOBRAN.has(w[i]) && !(w[i] in NUMEROS)) i++;
  let cuantos = null, medida = null, envase = null;
  const n = /^\d+(?:[.,]\d+)?$/.test(w[i] ?? '') ? Number(w[i].replace(',', '.')) : NUMEROS[w[i]];
  // "50g" -> 50 + "g"
  const pegado = n == null && w[i]?.match(/^(\d+(?:[.,]\d+)?)([a-z]+)$/);
  if (n != null) { cuantos = n; i++; } else if (pegado && pegado[2] in MEDIDAS) {
    cuantos = Number(pegado[1].replace(',', '.')); medida = MEDIDAS[pegado[2]]; i++;
  }
  if (w[i] != null && w[i] in MEDIDAS) { medida = MEDIDAS[w[i]]; envase = medida ? null : w[i]; i++; }
  while (i < w.length && (w[i] === 'de' || w[i] === 'del')) i++;
  const resto = w.slice(i).filter((x) => !SOBRAN.has(x) || x === 'de');
  return { cuantos, medida, envase, nombre: resto.join(' ').replace(/^(de|del)\s+/, '').trim() };
}

/** Artículos ordenados de más a menos parecido a lo dicho. */
function parecidos(nombre, articulos, enDespensa) {
  const dichas = claves(nombre);
  if (!dichas.length) return [];
  return articulos
    .map((a) => {
      const suyas = claves(a.nombre);
      if (!suyas.length) return null;
      const comunes = suyas.filter((x) => dichas.some((d) => mismo(x, d))).length;
      if (!comunes) return null;
      const todas = comunes === suyas.length;                  // "mermelada" está en "mermelada de fresa"
      const exacto = todas && comunes === dichas.length;
      const puntos = (exacto ? 100 : 0) + (todas ? 50 : 0) + comunes * 10 + (enDespensa.has(a.id) ? 5 : 0) - suyas.length;
      return { a, puntos, todas };
    })
    .filter(Boolean)
    .sort((x, y) => y.puntos - x.puntos);
}

/**
 * Entiende lo gastado.
 * @returns {Array<{ texto, articulo|null, cantidad:number|null, sugerencias: articulo[] }>}
 *   articulo null = no se sabe qué es: hay que preguntarlo (con `sugerencias` parecidas).
 */
export function entenderConsumo(texto, datos) {
  const enDespensa = new Set(datos.despensa.map((d) => d.articulo_id));
  const salida = [];
  for (const trozo of partirConsumo(texto)) {
    const t = leerTrozo(trozo);
    if (!t.nombre) continue;
    const opciones = parecidos(t.nombre, datos.articulos, enDespensa);
    // Seguro solo si todas las palabras del artículo se han dicho y el siguiente no empata.
    const seguro = opciones[0]?.todas && (!opciones[1] || opciones[1].puntos < opciones[0].puntos) ? opciones[0].a : null;
    const item = { texto: trozo, articulo: seguro, cantidad: null, sugerencias: opciones.slice(0, 5).map((o) => o.a), leido: t };
    if (seguro) item.cantidad = cantidadGastada(t, seguro, datos);
    salida.push(item);
  }
  return salida;
}

/** Cuánto restar, en la unidad del artículo. */
export function cantidadGastada(leido, articulo, datos) {
  const n = leido.cuantos ?? 1;
  if (leido.medida && leido.medida[0] === articulo.unidad) return redondear(n * leido.medida[1], 3);
  if (articulo.unidad === 'ud') return n;
  // Un bote o una bolsa de algo que va por peso: se resta lo de un paso (100 g, 250 ml…), sin pasar de lo que hay.
  const hay = datos.despensa.find((d) => d.articulo_id === articulo.id)?.cantidad ?? 0;
  const paso = pasoDespensa(articulo.unidad, hay);
  return redondear(hay > 0 ? Math.min(hay, n * paso) : n * paso, 3);
}
