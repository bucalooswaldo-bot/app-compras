// Añadir a la despensa con una foto del producto: cálculos sin pantalla (se prueban con `node --test`).
//
//   superPorMarca:   Hacendado -> Mercadona, Milbona -> Lidl, HiperDino -> HiperDino…
//   superProbable:   la marca, y si no lo dice, donde soléis comprar ese artículo (tiques)
//   nombreSencillo:  "Patatas fritas clásicas Hacendado 300 g" -> "Patatas fritas clásicas"
//   elegirArticulo:  qué artículo de la casa es (o ninguno: será nuevo)
//   cantidadASumar:  1 ud, o los gramos/ml del paquete si el artículo se cuenta por peso
//   nombreDeEtiqueta: lo más probable que sea el nombre, entre lo leído en la etiqueta

import { normalizar, redondear } from './logica.js';
import { emparejarArticulo, seccionPorTexto } from './tiques.js';

// Marcas propias de cada súper (en minúsculas y sin tildes).
const MARCAS_PROPIAS = {
  mercadona: ['hacendado', 'deliplus', 'bosque verde', 'compy', 'solcare', 'beauty by deliplus', '9.60', 'nupcia'],
  lidl: ['milbona', 'pilos', 'belbake', 'pikok', 'freeway', 'solevita', 'cien', 'w5', 'combino', 'sondey', 'chef select',
    'deluxe', 'snack day', 'crownfield', 'golden seafood', 'vitasia', 'italiamo', 'alesto', 'dulano', 'baresa', 'realvalle',
    'favorina', 'gelatelli', 'bellarom', 'kania', 'saskia', 'perlenbacher', 'el cronista', 'vemondo', 'trattoria alfredo',
    'nixe', 'tastino', 'mcennedy', 'eridanous', 'oaklands', 'lupilu', 'formil', 'dentalux', 'floralys', 'cosmia',
    'silvercrest', 'parkside', 'ocean sea', 'nautica', 'fin carre', 'fin de siecle', 'cimarosa', 'lord nelson', 'harvest basket'],
  hiperdino: ['hiperdino', 'dino'],
};

/** El súper por la marca (marca propia), o null si es de las que hay en todas partes. */
export function superPorMarca(marca, nombre = '') {
  const m = normalizar(marca);
  const n = ` ${normalizar(nombre)} `;
  for (const [s, marcas] of Object.entries(MARCAS_PROPIAS)) {
    if (marcas.some((x) => m === x || m.startsWith(`${x} `))) return s;
    // Sin marca leída: si el nombre la lleva ("Leche entera Hacendado")
    if (!m && marcas.some((x) => x.length > 3 && n.includes(` ${x} `))) return s;
  }
  return null;
}

/**
 * En qué súper lo habéis comprado, lo más probable.
 * @returns {{ supermercado: string|null, motivo: string|null }}
 */
export function superProbable({ marca, nombre, exacto, articuloId, datos }) {
  const porMarca = superPorMarca(marca, nombre);
  if (porMarca) return { supermercado: porMarca, motivo: 'por la marca' };
  if (exacto) return { supermercado: exacto, motivo: 'lo vende con este código' };
  if (articuloId && datos) {
    const tiques = new Map((datos.tiques ?? []).map((t) => [t.id, t]));
    const veces = {};
    for (const l of datos.tique_lineas ?? []) {
      if (l.articulo_id !== articuloId) continue;
      const s = tiques.get(l.tique_id)?.supermercado_id;
      if (s && s !== 'otro') veces[s] = (veces[s] ?? 0) + 1;
    }
    const [mejor] = Object.entries(veces).sort((a, b) => b[1] - a[1]);
    if (mejor) return { supermercado: mejor[0], motivo: 'donde lo soléis comprar' };
  }
  return { supermercado: null, motivo: null };
}

const FORMATO = /\b\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(kg|grs?|g|mg|litros?|lt|l|cl|ml|uds?|u|unidades)\b\.?/gi;

/** Nombre corto para la despensa: sin marca ni formato, con mayúscula inicial. */
export function nombreSencillo(nombre, marca) {
  let t = String(nombre ?? '').replace(FORMATO, ' ').replace(/\b(al peso|a granel|kg)\b/gi, ' ');
  if (marca) {
    const m = String(marca).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`(^|\\s)${m}(?=\\s|$)`, 'gi'), ' ');
  }
  t = t.replace(/\s+/g, ' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1).toLowerCase() : '';
}

/**
 * Qué artículo de la casa es.
 * 1) el que ya está enlazado con ese producto de súper, 2) el que encaja por nombre.
 * @returns {{ articulo: object|null, seguro: boolean }}
 */
export function elegirArticulo({ nombre, productoIds = [], datos }) {
  const ids = new Set(productoIds.filter(Boolean));
  const enlazado = (datos.equivalencias ?? []).find((e) => ids.has(e.producto_id));
  const porEnlace = enlazado && datos.articulos.find((a) => a.id === enlazado.articulo_id);
  if (porEnlace) return { articulo: porEnlace, seguro: true };
  if (!nombre) return { articulo: null, seguro: false };
  const exacto = datos.articulos.find((a) => normalizar(a.nombre) === normalizar(nombre));
  if (exacto) return { articulo: exacto, seguro: true };
  // Primero entre lo que ya hay en la despensa
  const enCasa = new Set((datos.despensa ?? []).map((d) => d.articulo_id));
  const deCasa = emparejarArticulo(nombre, datos.articulos.filter((a) => enCasa.has(a.id)));
  const articulo = deCasa ?? emparejarArticulo(nombre, datos.articulos);
  return { articulo, seguro: false };
}

/** Cuánto sumar al artículo por un paquete: 1 si se cuenta por unidades; el peso o volumen del paquete si no. */
export function cantidadASumar(unidadArticulo, producto) {
  if (unidadArticulo === 'ud') return 1;
  if (producto?.unidad === unidadArticulo && producto.cantidad > 0) return redondear(producto.cantidad, 3);
  return null; // no se sabe: que lo ponga ella
}

const SECCIONES_OFF = [
  [/dairies|milks|yogurts|cheeses|eggs/, 'Lácteos y huevos'],
  [/frozen/, 'Congelados'],
  [/beverages|waters|sodas|juices|beers|wines/, 'Bebidas'],
  [/canned|conserves/, 'Conservas'],
  [/breads|viennoiseries/, 'Panadería'],
  [/meats|poultry|sausages/, 'Carne'],
  [/fishes|seafood/, 'Pescado'],
  [/hams|charcuterie|cold-cuts/, 'Charcutería y quesos'],
  [/fruits|vegetables/, 'Frutas y verduras'],
  [/cleaning|detergents|hygiene|cosmetics/, 'Droguería'],
  [/snacks|cereals|pastas|rices|oils|sugars|spreads|biscuits|chocolates|coffees|teas|condiments|sauces/, 'Despensa'],
];

/** Sección para un artículo nuevo: por las categorías de la ficha, o por el nombre. */
export function seccionDe(nombre, categorias = []) {
  const c = categorias.join(' ');
  return SECCIONES_OFF.find(([re]) => re.test(c))?.[1] ?? seccionPorTexto(nombre) ?? 'Otros';
}

const RUIDO = /ingredientes|ingredients|consumir|conservar|lote|valor(es)? nutricional|energ[ií]a|kcal|grasas|hidratos|prote[ií]nas|\bsal\b.*\d|fabricado|envasado|www\.|\.com|\.es\b|tel[eé]fono|cp \d|^\d/;

/** Entre las líneas leídas en la etiqueta, las que parecen el nombre (las primeras con palabras de verdad). */
export function nombreDeEtiqueta(texto) {
  const lineas = String(texto ?? '').split('\n')
    .map((l) => l.replace(/[^\p{L}\d.,%' -]/gu, ' ').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 3 && !RUIDO.test(normalizar(l)))
    .filter((l) => (l.match(/\p{L}{3,}/gu) ?? []).length >= 1);
  const buenas = lineas.filter((l) => (l.match(/\p{L}/gu) ?? []).length / l.length > 0.6);
  return buenas.slice(0, 3).join(' ').slice(0, 60).trim();
}
