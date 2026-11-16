// Recetas leídas de una captura (Instagram, TikTok, una web…): del texto que sale del lector de fotos
// se sacan el nombre, las raciones, el tiempo, los ingredientes y los pasos.
// Todo es aproximado: la app lo deja rellenado y la persona lo revisa antes de guardar.

import { normalizar } from './logica.js';

const CAB_INGREDIENTES = /^(lista de )?ingredientes?\b|^necesitas\b|^que necesitas\b|^vas a necesitar\b/;
const CAB_PASOS = /^(preparacion|elaboracion|pasos|instrucciones|modo de (preparacion|hacerlo|elaboracion)|como (se hace|hacerlo|prepararlo)|procedimiento|receta paso a paso|paso a paso)\b/;

// Restos de la pantalla del móvil o de la red social que no son de la receta.
const RUIDO = [
  /^\d{1,2}[:.]\d{2}\b.{0,12}$/,                        // hora de la barra de arriba
  /^[\d\s%.,:|]+$/,                                       // solo números o porcentajes
  /\b(me gusta|seguir|siguiendo|responder|ver traducci[oó]n|ver m[aá]s|ver respuestas|comentarios?|compartir|enviar mensaje|a[nñ]ade un comentario|audio original|sugerencias para ti|patrocinado|publicidad|guardad[oa]s?)\b/i,
  /^(hace \d+|\d+\s*(h|d|sem|min)$)/i,                    // "hace 3 días", "2 d"
  /^[@#]/,                                                // usuarios y etiquetas sueltas
  /^(www\.|https?:)/i,
];

// Fracciones y viñetas que el lector suele devolver así.
const FRACCIONES = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8' };

function limpiarLinea(l) {
  let t = String(l)
    .replace(/[½¼¾⅓⅔⅛]/g, (c) => ` ${FRACCIONES[c]} `)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')   // emojis
    .replace(/[|¦_~^`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Viñetas: "-", "•", "*", "·", "»", "o " (el lector confunde "•" con "o" o "e")
  t = t.replace(/^([-–—•*·»>✓✔︎]+|[oe](?=\s+\d))\s*/, '- ');
  // Números con espacio raro: "1 / 2" -> "1/2", "1,5kg" se queda
  t = t.replace(/(\d)\s*\/\s*(\d)/g, '$1/$2').replace(/^- (\d+(?:\/\d+)?)\s+(?=\1\b)/, '- ');
  return t.replace(/\s+/g, ' ').trim();
}

const letras = (t) => (t.match(/[a-záéíóúüñ]/gi) ?? []).length;

function esRuido(t) {
  if (!t) return true;
  if (letras(t) < 2) return true;
  // Muchos símbolos y pocas letras: restos de iconos
  if (letras(t) / t.replace(/\s/g, '').length < 0.5 && t.length < 12) return true;
  return RUIDO.some((re) => re.test(t));
}

const quitarVineta = (t) => t.replace(/^- /, '');
const esNumerado = (t) => /^(paso\s*)?\d{1,2}\s*[.)º°:-]\s*\S/i.test(t);
const sinNumero = (t) => t.replace(/^(paso\s*)?\d{1,2}\s*[.)º°:-]\s*/i, '');
const empiezaCantidad = (t) => /^(\d|un[oa]?\s|medi[oa]\s|una\s|dos\s|tres\s|cuatro\s|cinco\s|seis\s|pizca|chorr|pu[nñ]ado|sal\b|pimienta\b|aceite\b|agua\b)/i.test(t);
const pareceIngrediente = (t) => {
  const s = quitarVineta(t);
  return s.length <= 60 && !/[.!?]$/.test(s) && (t.startsWith('- ') || empiezaCantidad(s));
};
const pareceFrase = (t) => t.length >= 55 || /[.!?]$/.test(t) || esNumerado(t);

/** Raciones dichas en el texto ("para 4 personas", "4 raciones", "Raciones: 4"). */
export function leerRaciones(texto) {
  for (const linea of normalizar(texto).split('\n')) {
    const m = linea.match(/(?:raciones|porciones|comensales|personas|pax|sirve)\s*:\s*(\d{1,2})\b/)
      ?? linea.match(/\b(\d{1,2})\s*(?:personas|raciones|porciones|comensales|pax)\b/)
      ?? linea.match(/^para\s*(\d{1,2})\s*$/);
    const v = m ? Number(m[1]) : null;
    if (v && v <= 30) return v;
  }
  return null;
}

function minutosDe(trozo) {
  const h = trozo.match(/(\d+(?:\.\d+)?)\s*(?:h\b|hora|horas)/);
  const mi = trozo.match(/(\d{1,3})\s*(?:min\b|mins\b|minutos|')/);
  const v = Math.round((h ? Number(h[1]) * 60 : 0) + (mi ? Number(mi[1]) : 0));
  return v > 0 && v <= 600 ? v : null;
}

/**
 * Minutos de la receta ("Tiempo: 45 minutos", "⏱ 1 h 15 min"). Solo de una línea con la palabra
 * tiempo o de una línea corta con solo el tiempo, para no confundirlo con "cocer 10 minutos".
 */
export function leerMinutos(texto) {
  const lineas = normalizar(texto).replace(/(\d),(\d)/g, '$1.$2').split('\n');
  for (const l of lineas) {
    const m = l.match(/(?:tiempo(?: total| de preparacion)?|duracion|listo en)\s*:?\s*(.{1,30})/);
    if (m && minutosDe(m[1])) return minutosDe(m[1]);
  }
  for (const l of lineas) if (l.length <= 40 && !/[.!?]$/.test(l) && minutosDe(l)) return minutosDe(l);
  return null;
}

/** Une las líneas que el lector partió a mitad de frase. */
function unirPasos(lineas) {
  const pasos = [];
  for (const l of lineas) {
    const t = quitarVineta(l);
    const nuevo = !pasos.length || esNumerado(t) || l.startsWith('- ')
      || (/[.!?:]$/.test(pasos.at(-1)) && /^[A-ZÁÉÍÓÚÑ¿¡]/.test(t));
    if (nuevo) pasos.push(sinNumero(t));
    else pasos[pasos.length - 1] += ` ${t}`;
  }
  return pasos.map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => letras(p) >= 3);
}

/** Une los ingredientes partidos en dos líneas ("200 g de queso" + "rallado"). */
function unirIngredientes(lineas) {
  const salida = [];
  for (const l of lineas) {
    const t = quitarVineta(l);
    const anterior = salida.at(-1);
    const sigue = anterior && !l.startsWith('- ') && !empiezaCantidad(t) && /^[a-záéíóúñ(]/.test(t)
      && /\b(de|del|y|con|en|a|para|o)$|[,(]$/.test(anterior);
    if (sigue) salida[salida.length - 1] = `${anterior} ${t}`;
    else salida.push(t);
  }
  return salida.filter((t) => letras(t) >= 2);
}

const MAX_NOMBRE = 60;
// Líneas que solo dicen raciones o tiempo ("4 personas", "30 min"): no son ingredientes.
const SOLO_DATOS = /^(para )?\d{1,3}\s*(personas|raciones|porciones|comensales|pax|min|minutos|h|horas?)\b.{0,12}$/;
function nombreDe(lineas) {
  for (const l of lineas) {
    let t = quitarVineta(l).replace(/[:.]+$/, '').trim();
    const n = normalizar(t);
    if (CAB_INGREDIENTES.test(n) || CAB_PASOS.test(n)) break;
    // Nombres de usuario de la red social ("cocinaconmaria", "chef.ana_23"): no son el título
    if (/^[a-z0-9._]+$/.test(t)) continue;
    if (t.length < 3 || t.length > MAX_NOMBRE || empiezaCantidad(t) || leerRaciones(t) || leerMinutos(t)) continue;
    t = t.replace(/^receta( facil| casera)?( de| del)?\s*:?\s*/i, '');
    if (letras(t) < 3) continue;
    // Restos de un emoji al final ("LENTEJAS CON CHORIZO é")
    t = t.replace(/(\s+[^\s]{1,2})+$/u, (resto) => (/^(\s+(a|y|e|o|al|de|en))+$/i.test(resto) ? resto : '')).trim();
    // "POLLO AL CURRY" -> "Pollo al curry"
    const mayus = (t.match(/[A-ZÁÉÍÓÚÑ]/g) ?? []).length;
    if (mayus >= letras(t) * 0.7) t = t.toLowerCase();
    return t[0].toUpperCase() + t.slice(1);
  }
  return '';
}

/**
 * Entiende el texto de una o varias capturas de una receta.
 * @returns {{ nombre:string, raciones:number|null, tiempo_min:number|null, ingredientes:string[], pasos:string[] }}
 */
export function entenderReceta(texto) {
  const lineas = String(texto ?? '').split(/\r?\n/).map(limpiarLinea).filter((t) => !esRuido(t));
  const nombre = nombreDe(lineas);
  const raciones = leerRaciones(lineas.join('\n'));
  const tiempo_min = leerMinutos(lineas.join('\n'));

  const ingredientes = [];
  const pasos = [];
  let seccion = null;     // 'ing' | 'pasos' | null (antes de los títulos)
  const hayTitulos = lineas.some((l) => CAB_INGREDIENTES.test(normalizar(quitarVineta(l))));
  for (const l of lineas) {
    const n = normalizar(quitarVineta(l));
    if (CAB_INGREDIENTES.test(n)) {
      seccion = 'ing';
      // "Ingredientes: 200 g de arroz, 1 cebolla" en la misma línea
      const resto = quitarVineta(l).replace(/^[^:]*:\s*/, '');
      if (resto !== quitarVineta(l) && letras(resto) >= 3 && !leerRaciones(resto)) ingredientes.push(resto);
      continue;
    }
    if (CAB_PASOS.test(n)) {
      seccion = 'pasos';
      const resto = quitarVineta(l).replace(/^[^:]*:\s*/, '');
      if (resto !== quitarVineta(l) && letras(resto) >= 3) pasos.push(resto);
      continue;
    }
    if (seccion === 'ing') {
      // Sin título de pasos: una frase larga o numerada después de los ingredientes ya es un paso
      if (pareceFrase(quitarVineta(l)) && !pareceIngrediente(l) && ingredientes.length) { seccion = 'pasos'; pasos.push(l); }
      else ingredientes.push(l);
    } else if (seccion === 'pasos') {
      pasos.push(l);
    } else if (!hayTitulos) {
      // Sin títulos: se decide línea a línea
      if (pareceIngrediente(l)) ingredientes.push(l);
      else if (pareceFrase(quitarVineta(l)) || pasos.length) pasos.push(l);
    }
  }
  const ings = unirIngredientes(ingredientes)
    .filter((t) => normalizar(t) !== normalizar(nombre) && !SOLO_DATOS.test(normalizar(t)));
  return { nombre, raciones, tiempo_min, ingredientes: ings, pasos: unirPasos(pasos) };
}
