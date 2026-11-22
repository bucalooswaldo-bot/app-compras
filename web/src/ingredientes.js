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
  cda: null, cdas: null, cucharada: null, cucharadas: null, cdta: null, cdtas: null, cdita: null, cditas: null, cucharadita: null,
  cucharaditas: null, pizca: null, puñado: null, punado: null, chorrito: null, chorro: null, toque: null,
  bandeja: null, bandejas: null, bote: null, botes: null, lata: null, latas: null, paquete: null,
  paquetes: null, sobre: null, sobres: null, loncha: null, lonchas: null, rodaja: null, rodajas: null,
  ramita: null, poquito: null, poco: null, hoja: null, hojas: null, trozo: null, trozos: null,
};


const DESCRIPCIONES = /\s+(en juliana|en dados|en daditos|en cubos|en cubitos|en trozos|en rodajas|en tiras|en láminas|en laminas|rallad[oa]s?|picad[oa]s?|frit[oa]s?|dur[oa]s?|fresc[oa]s?|trocead[oa]s?|pelad[oa]s?|cortad[oa]s?|derretid[oa]s?|batid[oa]s?|sin piel|sin hueso|sin espinas|a temperatura ambiente|al gusto|para decorar|para servir|opcional)\b.*$/i;

// Fracciones escritas con un solo signo ("½ cebolla", "1 ½ tazas").
const FRACCIONES = { '½': [0.5, '1/2'], '¼': [0.25, '1/4'], '¾': [0.75, '3/4'], '⅓': [1 / 3, '1/3'], '⅔': [2 / 3, '2/3'] };
function quitarFracciones(t) {
  return t
    .replace(/(\d+)\s*([½¼¾⅓⅔])/g, (_, n, f) => String(redondear(Number(n) + FRACCIONES[f][0], 2)))
    .replace(/[½¼¾⅓⅔]/g, (f) => FRACCIONES[f][1]);
}

// Una línea que sigue a la anterior porque el texto se cortó ("aceite de oliva virgen" + "extra").
const SIGUE_DETRAS = /\b(de|del|con|y|e|o|en|a|al|para|la|el|los|las|sin|virgen)$/i;
const ES_CONTINUACION = /^(extra|virgen|fresc[oa]s?|picad[oa]s?|molid[oa]s?|dulce|picante|maduros?|maduras?|rallad[oa]s?|trocead[oa]s?|pelad[oa]s?|en (polvo|rama|grano|dados|trozos|rodajas|tiras|juliana)|al gusto|para (decorar|servir))\b/;
const EMPIEZA_CANTIDAD = /^(\d|[½¼¾⅓⅔]|(un|una|uno|medio|media|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce)\s)/i;
const CABECERA = /^(ingredientes?|para (el|la|los|las) .*|.{0,40}:)$/i;

/** Quita lo de entre paréntesis y dice qué había: "(opcional)", "(400 g)", "(al gusto)". */
function sacarParentesis(t) {
  const extra = { opcional: false, peso: null, alGusto: false };
  const texto = t.replace(/\(([^)]*)\)?/g, (_, dentro) => {
    const d = dentro.trim();
    if (/opcional/i.test(d)) extra.opcional = true;
    if (/al gusto/i.test(d)) extra.alGusto = true;
    const m = d.match(/(\d+(?:[.,]\d+)?)\s*(g|gr|grs|gramos|kg|ml|cl|l|litros?)\b/i);
    if (m) extra.peso = `${m[1]} ${m[2]}`;
    return ' ';
  }).replace(/\s+/g, ' ').trim();
  return { texto, ...extra };
}

/**
 * Parte un texto en trozos, uno por ingrediente, con lo que acompaña a cada uno:
 * { texto, detalles: ["pelados y picados"], opcional, peso: "400 g", alGusto }.
 * Si viene en líneas, cada línea es un ingrediente ("2 tomates, pelados y picados" es uno solo);
 * si viene todo seguido, se parte por comas.
 */
export function trozosIngredientes(texto) {
  const limpio = quitarFracciones(String(texto ?? '').replace(/\r/g, ''));
  const lineas = [];
  for (let l of limpio.split('\n')) {
    l = l.replace(/^\s*(?:[-•*·▪●◦–—]|\d+[.)](?=\s))\s*/, '').replace(/\s+/g, ' ').trim()
      // "200 gr." / "2 cdas." / "aprox." : el punto es de la abreviatura, no corta nada
      .replace(/(?<![a-zñ])(grs?|g|kg|mg|ml|cl|dl|l|cdas?|cdtas?|cditas?|uds?|aprox|approx|pzas?)\.(?=\s|$|,)/gi, '$1')
      // "2 1/2 tazas" -> "2.5 tazas"
      .replace(/\b(\d+) (\d+)\/(\d+)\b/g, (_, e, a, b) => String(redondear(Number(e) + Number(a) / Number(b), 2)))
      // "Sal - al gusto", "Aceite — 50 ml": el guion separa, no es parte del nombre
      .replace(/\s+[-–—]\s+/g, ' ');
    if (!l) continue;
    const ant = lineas.at(-1);
    if (ant != null && (SIGUE_DETRAS.test(ant) || (/^[a-zñáéíóú(]/.test(l) && ES_CONTINUACION.test(l)) || /^\(/.test(l))) {
      lineas[lineas.length - 1] = `${ant} ${l}`;
    } else lineas.push(l);
  }
  const variasLineas = lineas.filter((l) => !CABECERA.test(l.replace(/[.…]+$/, ''))).length > 1;
  const salida = [];
  const anadir = (t, detalles, par) => {
    // "Para la salsa: 2 tomates" -> "2 tomates"; pero "Huevos: 2" se queda (es la cantidad)
    if (!/^[^:]{1,30}:\s*(\d+(?:[.,/]\d+)?\s*[a-zA-Zñ.]{0,12}|al gusto)$/i.test(t)) t = t.replace(/^[^:]{0,30}:\s*/, '');
    t = t.replace(/[.…]+$/, '').trim();
    if (!t || CABECERA.test(t) || /^(ingredientes?|para la .*)$/i.test(t)) return;
    salida.push({ texto: t, detalles, ...par });
  };
  for (const linea of lineas) {
    if (CABECERA.test(linea.replace(/[.…]+$/, ''))) continue;
    const par = sacarParentesis(linea);
    const sinPar = { opcional: par.opcional, peso: par.peso, alGusto: par.alGusto };
    // Comas que no van entre cifras ("1,5 l" es un número)
    const partes = par.texto.split(variasLineas ? /;|,(?!\d)/ : /;|,(?!\d)|\.(?:\s|$)/).map((x) => x.trim()).filter(Boolean);
    if (!variasLineas) {
      for (const p of partes) for (const q of p.split(/\s+y\s+(?=\S)/i)) anadir(q, [], sinPar);
      continue;
    }
    // En líneas: lo que va tras la coma es cómo se prepara, salvo que traiga su propia cantidad
    let actual = null;
    for (const p of partes) {
      if (actual && !EMPIEZA_CANTIDAD.test(p) && EMPIEZA_CANTIDAD.test(actual.texto)) { actual.detalles.push(p); continue; }
      if (actual) anadir(actual.texto, actual.detalles, sinPar);
      actual = { texto: p, detalles: [] };
    }
    if (!actual) continue;
    // "Sal y pimienta" son dos; "1 cebolla y 2 ajos" también; "2 tomates pelados y picados" es uno
    const ys = actual.texto.split(/\s+y\s+(?=\S)/i);
    if (ys.length > 1 && (!EMPIEZA_CANTIDAD.test(actual.texto) || ys.slice(1).every((y) => EMPIEZA_CANTIDAD.test(y)))) {
      ys.forEach((y, k) => anadir(y, k === ys.length - 1 ? actual.detalles : [], sinPar));
    } else anadir(actual.texto, actual.detalles, sinPar);
  }
  return salida;
}

/** Parte un texto en trozos, uno por ingrediente (solo el texto). */
export function partirIngredientes(texto) {
  return trozosIngredientes(texto).map((t) => t.texto);
}

function leerNumero(t) {
  if (/^\d+\/\d+$/.test(t)) { const [a, b] = t.split('/').map(Number); return b ? a / b : null; }
  if (/^\d+-\d+$/.test(t)) return Number(t.split('-')[1]);
  if (/^\d+(?:[.,]\d+)?$/.test(t)) return Number(t.replace(',', '.'));
  return NUMEROS[normalizar(t)] ?? null;
}

const mayuscula = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const CANTIDAD_FINAL = /^(.*?[^\d\s,.])\s*[-–—:=]?\s*(\d+(?:[.,/]\d+)?(?:\s*-\s*\d+)?\s*(?:[a-zA-Zñ]{1,12}\.?)?)$/;

/**
 * Pone la cantidad delante cuando viene detrás: "Harina 200 g" -> "200 g Harina",
 * "Huevos: 2" -> "2 Huevos", "Zumo de 1 limón" -> "1 limón (zumo)".
 */
function ordenarIngrediente(t) {
  if (/^\d/.test(t)) return t;
  const zumo = t.match(/^(zumo|ralladura|piel|cáscara|cascara) de (\d+(?:[.,/]\d+)?|una?|medio|media) (.+)$/i);
  if (zumo) return `${zumo[2]} ${zumo[3]} (${zumo[1].toLowerCase()})`;
  const m = t.match(CANTIDAD_FINAL);
  if (m) {
    const [num, u = ''] = [m[2].match(/^[\d.,/\s-]+/)[0].trim(), m[2].replace(/^[\d.,/\s-]+/, '').replace(/\.$/, '')];
    if (!u || normalizar(u) in UNIDADES || u.toLowerCase() in UNIDADES) return `${num}${u ? ` ${u}` : ''} ${m[1].replace(/\s*[-–—:=]\s*$/, '')}`;
  }
  return t.replace(/\s*[-–—:=]\s*$/, '');
}

/**
 * Entiende un ingrediente: "80g fideos" -> { nombre:'Fideos', cantidad:80, unidad:'g', nota:null }.
 * Las medidas caseras ("1 cdta soja") quedan como nota y sin cantidad.
 */
export function leerIngrediente(trozo) {
  let t = String(trozo).trim().replace(/\s+/g, ' ').replace(/\sd\s/gi, ' de ');   // "diente d ajo"
  let nota = null;
  if (/al gusto/i.test(t)) { nota = 'al gusto'; t = t.replace(/\s*\bal gusto\b\s*/i, ' ').trim(); }
  t = ordenarIngrediente(t);
  let notaExtra = null;
  t = t.replace(/\s*\(([^)]*)\)\s*$/, (_, d) => { notaExtra = d.trim() || null; return ''; });
  // "50g" -> "50 g", "2cdta" -> "2 cdta"
  t = t.replace(/^(\d+(?:[.,/-]\d+)?)([a-zA-Zñ]+)/, '$1 $2');
  // "cucharada sopera", "cucharadita rasa", "cucharada de postre": el apellido de la medida sobra
  t = t.replace(/^(\S+ (?:cucharad\w*|cdas?|cdtas?|cditas?|tazas?))\s+(?:soperas?|rasas?|colmadas?|grandes?|pequeñas?|de postre|de café|de cafe)\b/i, '$1');
  const p = t.split(' ');
  let cantidad = null, unidad = null, unidadDicha = null, i = 0;
  // "poquito de aceite", "un poco de sal": como "un poco", sin cantidad
  if (/^(poquito|poco)$/i.test(p[0])) p.unshift('un');
  const n = leerNumero(p[0]);
  // "una pizca", "un puñado", "medio pimiento", "2 zanahorias"
  if (n != null && p.length > 1) {
    i = 1;
    const u = normalizar(p[1]);
    if (u in UNIDADES || p[1].toLowerCase() in UNIDADES) {
      const def = UNIDADES[u] ?? UNIDADES[p[1].toLowerCase()];
      if (def) { cantidad = redondear(n * def[1], 3); unidad = def[0]; unidadDicha = normalizar(p[1]); } else nota = `${p[0]} ${p[1]}`;
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
  if (desc) { notaDesc = desc[0].trim().toLowerCase(); nombre = mayuscula(nombre.slice(0, desc.index).trim()); }
  if (!nombre) return null;
  return { nombre, completo, cantidad, unidad, unidadDicha, nota, notaDesc, notaExtra, cantidadDicha: cantidad != null && !unidad ? p[0] : null };
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
  for (const { texto: trozo, detalles, opcional, peso, alGusto } of trozosIngredientes(texto)) {
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
    // nota = la medida casera ("2 cucharadas", "al gusto"); descripciones = cómo se prepara
    let { cantidad, unidad, nota } = ing;
    if (!nota && alGusto) nota = 'al gusto';
    const descripciones = [];
    if (ing.nombre !== ing.completo && ing.notaDesc) descripciones.push(ing.notaDesc);
    if (ing.notaExtra) descripciones.push(ing.notaExtra);
    descripciones.push(...detalles.map((d) => d.toLowerCase()));
    // Tazas y vasos solo son medida exacta para líquidos; "2 tazas de arroz" queda como medida casera
    const esLiquido = /\b(leche|caldo|nata|agua|vino|zumo|aceite|vinagre|soja|salsa|bebida|licor|cerveza|brandy|ron|coñac)\b/.test(normalizar(ing.nombre));
    if (/^(tazas?|vasos?)$/.test(ing.unidadDicha ?? '') && !esLiquido && articulo?.unidad !== 'ml') {
      nota = `${String(redondear(cantidad / (ing.unidadDicha.startsWith('t') ? 250 : 200), 2)).replace('.', ',')} ${ing.unidadDicha}`;
      cantidad = null; unidad = null;
    }
    if (opcional) descripciones.push('opcional');
    // Número sin unidad: "80 fideos" son gramos; "2 zanahorias" son unidades; "1/2 caldo" no se sabe.
    if (cantidad != null && !unidad) {
      unidad = articulo?.unidad ?? (cantidad >= 20 ? 'g' : 'ud');
      if (unidad !== 'ud' && cantidad < 20) { nota = nota ?? ing.cantidadDicha; cantidad = null; }
    }
    // "1 lata de tomate triturado (400 g)": se compra por peso, la lata queda como nota
    const pesoLeido = peso && leerIngrediente(`${peso} x`);
    if (cantidad == null && pesoLeido?.cantidad != null && (!articulo || articulo.unidad === pesoLeido.unidad)) {
      cantidad = pesoLeido.cantidad; unidad = pesoLeido.unidad;
    }
    const unidadArticulo = articulo?.unidad ?? unidad ?? (/\b(leche|caldo|nata|agua|vino|zumo|aceite|vinagre|soja|salsa)\b/.test(normalizar(ing.nombre)) ? 'ml' : 'ud');
    if (cantidad != null && unidad !== unidadArticulo) {
      // Medida que no encaja con cómo se compra (p. ej. "1 bote" de algo que va por gramos): queda como nota.
      nota = nota ?? trozo.trim().split(' ').slice(0, 2).join(' ');
      cantidad = null;
    }
    const notas = [...new Set([nota, ...descripciones].filter(Boolean))].filter((d, k, xs) => k === 0 || !xs[0].includes(d));
    salida.push({
      nombre: articulo?.nombre ?? ing.nombre, articulo, unidad: unidadArticulo, cantidad, nota: notas.join(', ') || null,
      categoria: articulo?.categoria ?? adivinarCategoria(ing.nombre),
    });
  }
  return salida;
}
