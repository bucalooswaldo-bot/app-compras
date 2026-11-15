// Ingredientes de las recetas escritos como texto ("80 g fideos, 1/2 cebolla, sal").
// Sirve para "Pegar ingredientes" en el editor y para arreglar recetas antiguas
// donde todos los ingredientes quedaron en una sola línea.

import { normalizar, redondear } from './logica.js';
import { raiz } from './comparar.js';

const NUMEROS = {
  un: 1, una: 1, uno: 1, medio: 0.5, media: 0.5, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12,
};

// Unidad dicha -> [unidad base, factor]. null = medida casera: se guarda como nota, sin cantidad.
const UNIDADES = {
  g: ['g', 1], gr: ['g', 1], grs: ['g', 1], gramo: ['g', 1], gramos: ['g', 1],
  kg: ['g', 1000], kilo: ['g', 1000], kilos: ['g', 1000],
  ml: ['ml', 1], cl: ['ml', 10], l: ['ml', 1000], litro: ['ml', 1000], litros: ['ml', 1000],
  taza: ['ml', 250], tazas: ['ml', 250], vaso: ['ml', 200], vasos: ['ml', 200],
  diente: ['ud', 1], dientes: ['ud', 1], ud: ['ud', 1], uds: ['ud', 1], unidad: ['ud', 1], unidades: ['ud', 1],
  docena: ['ud', 12],
  cda: null, cdas: null, cucharada: null, cucharadas: null, cdta: null, cdtas: null, cucharadita: null,
  cucharaditas: null, pizca: null, puñado: null, punado: null, chorrito: null, chorro: null, toque: null,
  bandeja: null, bandejas: null, bote: null, botes: null, lata: null, latas: null, paquete: null,
  paquetes: null, sobre: null, sobres: null, loncha: null, lonchas: null, rodaja: null, rodajas: null,
  ramita: null, poquito: null, poco: null, hoja: null, hojas: null, trozo: null, trozos: null,
};


const DESCRIPCIONES = /\s+(en juliana|en dados|en rodajas|en tiras|rallad[oa]s?|picad[oa]s?|frit[oa]s?|dur[oa]s?|fresc[oa]s?|al gusto|para decorar|opcional)\b.*$/i;

/** Parte un texto en trozos, uno por ingrediente. */
export function partirIngredientes(texto) {
  return String(texto ?? '')
    .replace(/\([^)]*\)/g, ' ')                       // "(comino, orégano…)" fuera
    .split(/\n|[,;]|\.(?:\s|$)|\s+y\s+(?=\S)/i)
    .map((t) => t.replace(/^\s*[-•*·]\s*/, '').replace(/^[^:]{0,30}:\s*/, '').replace(/[.…]+$/, '').trim())
    .filter((t) => t && !/^(ingredientes?|para la .*)$/i.test(t));
}

function leerNumero(t) {
  if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split('/').map(Number); return b ? a / b : null; }
  if (/^\d+-\d+$/.test(t)) return Number(t.split('-')[1]);
  if (/^\d+(?:[.,]\d+)?$/.test(t)) return Number(t.replace(',', '.'));
  return NUMEROS[normalizar(t)] ?? null;
}

const mayuscula = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Entiende un ingrediente: "80g fideos" -> { nombre:'Fideos', cantidad:80, unidad:'g', nota:null }.
 * Las medidas caseras ("1 cdta soja") quedan como nota y sin cantidad.
 */
export function leerIngrediente(trozo) {
  let t = String(trozo).trim().replace(/\s+/g, ' ').replace(/\sd\s/gi, ' de ');   // "diente d ajo"
  let nota = null;
  if (/al gusto/i.test(t)) nota = 'al gusto';
  // "50g" -> "50 g", "2cdta" -> "2 cdta"
  t = t.replace(/^(\d+(?:[.,/-]\d+)?)([a-zA-Zñ]+)/, '$1 $2');
  const p = t.split(' ');
  let cantidad = null, unidad = null, i = 0;
  // "poquito de aceite", "un poco de sal": como "un poco", sin cantidad
  if (/^(poquito|poco)$/i.test(p[0])) p.unshift('un');
  const n = leerNumero(p[0]);
  // "una pizca", "un puñado", "medio pimiento", "2 zanahorias"
  if (n != null && p.length > 1) {
    i = 1;
    const u = normalizar(p[1]);
    if (u in UNIDADES || p[1].toLowerCase() in UNIDADES) {
      const def = UNIDADES[u] ?? UNIDADES[p[1].toLowerCase()];
      if (def) { cantidad = redondear(n * def[1], 3); unidad = def[0]; } else nota = `${p[0]} ${p[1]}`;
      i = 2;
    } else if (!['un', 'una', 'uno'].includes(normalizar(p[0]))) {
      cantidad = n;   // sin unidad: se decide luego (unidades o gramos) según el artículo
    }
    if (p[i] && /^(de|del|d)$/i.test(p[i])) i++;
  }
  const completo = mayuscula(p.slice(i).join(' ').replace(/^(de|del|d)\s+/i, '').trim());
  let nombre = completo;
  let notaDesc = null;
  const desc = nombre.match(DESCRIPCIONES);
  if (desc) { notaDesc = desc[1].toLowerCase(); nombre = mayuscula(nombre.slice(0, desc.index).trim()); }
  if (!nombre) return null;
  return { nombre, completo, cantidad, unidad, nota, notaDesc, cantidadDicha: cantidad != null && !unidad ? p[0] : null };
}

/** Busca el artículo por nombre, plural o primera palabra ("aceite" -> "Aceite de oliva"). */
export function emparejarIngrediente(articulos, nombre) {
  const n = normalizar(nombre);
  const exacto = articulos.find((a) => normalizar(a.nombre) === n);
  if (exacto) return exacto;
  const r = n.split(/\s+/).map(raiz).join(' ');
  const porRaiz = articulos.find((a) => normalizar(a.nombre).split(/\s+/).map(raiz).join(' ') === r);
  if (porRaiz) return porRaiz;
  if (!n.includes(' ')) {
    const empiezan = articulos.filter((a) => raiz(normalizar(a.nombre).split(/\s+/)[0]) === raiz(n));
    if (empiezan.length === 1) return empiezan[0];
  }
  return null;
}

const CATEGORIA_POR_PALABRA = [
  [/^(caldo|salsa|crema de|tomate frito)/, 'Despensa'],
  [/pollo|pavo|ternera|cerdo|carne|costilla|chuleta|filete|hamburguesa|salchicha|lomo/, 'Carne'],
  [/merluza|salmon|atun fresco|bacalao|gamba|langostino|calamar|pescado|mejillon|sepia|pulpo/, 'Pescado'],
  [/leche|yogur|nata|mantequilla|huevo|queso fresco/, 'Lácteos y huevos'],
  [/jamon|chorizo|queso|bacon|pavo en lonchas|salchichon/, 'Charcutería y quesos'],
  [/lechuga|tomate|cebolla|cebolleta|ajo|pimiento|zanahoria|calabacin|berenjena|esparrago|champinon|seta|espinaca|brocoli|coliflor|papa|patata|batata|manzana|platano|limon|naranja|fresa|pera|aguacate|pepino|puerro|apio|cebollino|perejil|cilantro|chile|millo|maiz|judia|calabaza/, 'Frutas y verduras'],
  [/pan\b|pan de|tortilla de trigo|picos/, 'Panadería'],
  [/lata|conserva|triturado|aceituna|garbanzo cocido|maiz dulce/, 'Conservas'],
  [/congelad/, 'Congelados'],
  [/vino|cerveza|refresco|zumo/, 'Bebidas'],
  [/arroz|pasta|fideo|macarron|espagueti|harina|azucar|sal|aceite|vinagre|especia|lenteja|garbanzo|alubia|caldo|soja|mayonesa|ketchup|cacahuete|galleta|cafe|cacao/, 'Despensa'],
];

export function adivinarCategoria(nombre) {
  const n = normalizar(nombre);
  return CATEGORIA_POR_PALABRA.find(([re]) => re.test(n))?.[1] ?? 'Otros';
}

/**
 * Convierte texto en ingredientes listos para guardar.
 * @returns {Array<{nombre, articulo|null, unidad:'g'|'ml'|'ud', cantidad:number|null, nota:string|null}>}
 *   articulo: el ya existente si lo hay; si no, `unidad` es con la que se crearía.
 */
export function entenderIngredientes(texto, articulos) {
  const salida = [];
  for (const trozo of partirIngredientes(texto)) {
    const ing = leerIngrediente(trozo);
    if (!ing) continue;
    // Primero el nombre entero ("Queso rallado", "Jamón cocido"); si no, sin la descripción ("Zanahoria" + "rallada").
    let articulo = emparejarIngrediente(articulos, ing.completo);
    if (articulo) ing.nombre = ing.completo;
    else {
      articulo = emparejarIngrediente(articulos, ing.nombre);
      // "Queso rallado" se compra así; "cebolleta picada" es Cebolleta con la nota "picada".
      if (!articulo && ing.notaDesc && /rallad/.test(ing.notaDesc)) ing.nombre = ing.completo;
    }
    let { cantidad, unidad, nota } = ing;
    if (ing.nombre !== ing.completo) nota = nota ?? ing.notaDesc;
    // Número sin unidad: "80 fideos" son gramos; "2 zanahorias" son unidades; "1/2 caldo" no se sabe.
    if (cantidad != null && !unidad) {
      unidad = articulo?.unidad ?? (cantidad >= 20 ? 'g' : 'ud');
      if (unidad !== 'ud' && cantidad < 20) { nota = nota ?? ing.cantidadDicha; cantidad = null; }
    }
    const unidadArticulo = articulo?.unidad ?? unidad ?? (/\b(leche|caldo|nata|agua|vino|zumo|aceite|vinagre|soja|salsa)\b/.test(normalizar(ing.nombre)) ? 'ml' : 'ud');
    if (cantidad != null && unidad !== unidadArticulo) {
      // Medida que no encaja con cómo se compra (p. ej. "1 bote" de algo que va por gramos): queda como nota.
      nota = nota ?? trozo.trim().split(' ').slice(0, 2).join(' ');
      cantidad = null;
    }
    salida.push({
      nombre: articulo?.nombre ?? ing.nombre, articulo, unidad: unidadArticulo, cantidad, nota,
      categoria: articulo?.categoria ?? adivinarCategoria(ing.nombre),
    });
  }
  return salida;
}
