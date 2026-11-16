// Recetas leídas de una captura (Instagram, TikTok, una web…): del texto que sale del lector de fotos
// se sacan el nombre, las raciones, el tiempo, los ingredientes y los pasos.
// Todo es aproximado: la app lo deja rellenado y la persona lo revisa antes de guardar.

import { normalizar } from './logica.js';
import { raiz } from './comparar.js';

const CAB_INGREDIENTES = /^(\S{1,2}\s+)?(lista de )?ingredientes?\b|^necesitas\b|^que necesitas\b|^vas a necesitar\b/;
const CAB_PASOS = /^(\S{1,2}\s+)?(preparacion|elaboracion|pasos|instrucciones|modo de (preparacion|hacerlo|elaboracion)|como (se hace|hacerlo|prepararlo)|procedimiento|receta paso a paso|paso a paso)\b/;

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
  // Letras que el lector confunde en las cantidades: "320 q de" / "300 9 de" -> g, "100 mi" -> ml,
  // "3 gde sal" -> "3 g de sal", "1,21 de caldo" -> "1,2 l de caldo"
  t = t.replace(/(\d)\s*[q9]\s+(?=de\b)/g, '$1 g ').replace(/(\d)\s*[q9]\)/g, '$1 g)')
    .replace(/(\d)\s*mi\b/g, '$1 ml').replace(/(\d)\s*gde\b/g, '$1 g de')
    .replace(/\b(\d+(?:,\d)?)[1lI]\s+de\s+(?=(caldo|agua|leche|vino|nata|aceite|zumo)\b)/gi, '$1 l de ');
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
const esNumerado = (t) => /^(paso\s*)?[([]?\d{1,2}\s*[.)\]º°:-]+\s*\S/i.test(t);
const sinNumero = (t) => t.replace(/^(paso\s*)?[([]?\d{1,2}\s*[.)\]º°:-]+\s*/i, '');
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
  // Línea corta que es casi solo el tiempo ("⏱ 30 min", "Para 4 personas · 50 min"), no un paso ("2 min. Añade…")
  for (const l of lineas) if (l.length <= 40 && !/[.!?;]/.test(l) && minutosDe(l)) return minutosDe(l);
  return null;
}

/** Une las líneas que el lector partió a mitad de frase. */
function unirPasos(lineas) {
  const pasos = [];
  const numerados = [];
  for (const l of lineas) {
    // Iconos leídos como un signo o número suelto delante del paso ("9 Sellar: …")
    const t = quitarVineta(l).replace(/^(?![0-9]{1,2}\s*[.)º°:-])[^\s]{1,2}\s+(?=[A-ZÁÉÍÓÚÑ][a-záéíóúñ])/, '');
    const nuevo = !pasos.length || esNumerado(t) || l.startsWith('- ')
      || (/[.!?:]$/.test(pasos.at(-1)) && /^[A-ZÁÉÍÓÚÑ¿¡]/.test(t));
    if (nuevo) { if (esNumerado(t)) numerados.push(pasos.length); pasos.push(sinNumero(t)); }
    else pasos[pasos.length - 1] += ` ${t}`;
  }
  let salida = pasos.map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => letras(p) >= 3);
  // Pasos numerados: lo que va suelto detrás (consejos, el texto de la publicación) no es un paso
  if (numerados.length >= 2) salida = salida.slice(0, numerados.at(-1) + 1);
  return salida;
}

/** "100 ml devino blanco" -> "100 ml de vino blanco" (el lector a veces pega el "de"). */
export function separarDe(t) {
  return t.replace(/\bdeal$/, 'de sal').replace(/^(\d[\d.,/]*\s*(?:[a-zñ]+\s+)?)de(?!s|ntro|cora|lgad|lica|rret|bajo)([a-záéíóúñ]{2,})/i, '$1de $2');
}

// Ingredientes cortos que sí existen (el resto de líneas sin ninguna palabra de 4 letras son restos de fotos)
const CORTOS = /\b(sal|ajo|ajos|pan|col|t[eé]|ron|kiwi|ron|miel|lima|nata|agua)\b/i;
const pareceComida = (t) => {
  if (normalizar(t) === '(opcional)' || /^opcional$/i.test(t)) return false;
  // Lo que queda quitando la cantidad y la unidad tiene que ser un nombre ("1 cucharadita" sola no vale)
  const resto = t.replace(/^[\d\s.,/-]+(g|kg|ml|l|cucharadas?|cucharaditas?|cdas?|cdtas?|cditas?|dientes?|pizcas?|pu[nñ]ados?|tazas?|vasos?)?\b\s*(de\s+)?/i, '');
  if (/^(para|unas?|unos?)$/i.test(resto.trim())) return false;
  return resto.split(/\s+/).some((w) => letras(w) >= 4) || CORTOS.test(resto);
};

/** "700 g de papas 1 cebolla 1 pimiento" (tres etiquetas en un renglón) -> tres ingredientes */
export function partirVarios(t) {
  return t.split(/\s+(?=\d+(?:[.,/]\d+)?\s*(?:g|kg|ml|l|cucharadas?|cucharaditas?|dientes?)?\s+(?:de\s+)?[a-záéíóúñ]{3,})(?<![\d/,.]\s*)(?<!\b(?:de|x|con|unos|unas|y|o)\s+)/i)
    .map((x) => x.trim()).filter(Boolean);
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
function nombreDe(lineas, palabrasLargas = 1) {
  for (const l of lineas) {
    let t = quitarVineta(l).replace(/[:.]+$/, '').trim();
    const n = normalizar(t);
    if (CAB_INGREDIENTES.test(n) || CAB_PASOS.test(n)) break;
    // Nombres de usuario de la red social ("cocinaconmaria", "chef.ana_23"): no son el título
    if (/^[a-z0-9._]+$/.test(t) || /\b\d{1,2}:\d{2}\b/.test(t)) continue;
    if (t.length < 3 || t.length > MAX_NOMBRE || empiezaCantidad(t) || leerRaciones(t) || leerMinutos(t)) continue;
    t = t.replace(/^receta( facil| casera)?( de| del)?\s*:?\s*/i, '');
    if (letras(t) < 3 || t.split(/\s+/).filter((w) => letras(w) >= 4).length < palabrasLargas) continue;
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
 * De los títulos posibles (letra grande), el primero que tenga alguna palabra que salga en el resto
 * de la receta ("Atún encebollado" -> "600 g de atún"). Así no se pone de nombre una frase decorativa
 * mal leída: si ninguno encaja, el nombre se deja vacío para escribirlo.
 */
function tituloQueEncaja(titulos, lineas) {
  for (const t of titulos) {
    const nombre = nombreDe([limpiarLinea(t)]);
    // El resto de la receta: sin las líneas del propio título
    const n = normalizar(nombre);
    const resto = new Set(lineas.filter((l) => !normalizar(l).includes(n))
      .flatMap((l) => normalizar(l).split(/[^a-z0-9ñ]+/)).filter((w) => w.length >= 4).map(raiz));
    const palabras = normalizar(nombre).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4);
    if (nombre && palabras.some((w) => resto.has(raiz(w)))) return nombre;
  }
  return '';
}

/**
 * Entiende el texto de una o varias capturas de una receta.
 * @returns {{ nombre:string, raciones:number|null, tiempo_min:number|null, ingredientes:string[], pasos:string[] }}
 */
export function entenderReceta(texto, { titulos = null } = {}) {
  const lineas = String(texto ?? '').split(/\r?\n/).map(limpiarLinea).filter((t) => !esRuido(t));
  // Sin letra grande en la captura: el primer renglón que parezca un nombre
  const nombre = titulos?.length ? tituloQueEncaja(titulos, lineas)
    : titulos ? nombreDe(lineas, 2) : nombreDe(lineas);
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
  const ings = unirIngredientes(ingredientes.map((t) => t.replace(/^(- )?[A-Za-z]\s+(?=\d)/, '$1')))
    .flatMap(partirVarios)
    // "cucharadita de pimentón" (el "½" no se leyó): una
    .map((t) => t.replace(/^(cucharadas?|cucharaditas?|cdas?|cdtas?|cditas?|pizca|pu[nñ]ado|chorrito)\b/i, '1 $1')).map(separarDe).filter(pareceComida)
    .filter((t) => normalizar(t) !== normalizar(nombre) && !SOLO_DATOS.test(normalizar(t)));
  return { nombre, raciones, tiempo_min, ingredientes: ings, pasos: unirPasos(pasos) };
}

// ---------------------------------------------------------------------------
// Capturas con diseño (infografías, tarjetas de recetas): el lector devuelve cada línea con la posición
// de sus palabras. Aquí se quitan las zonas de foto (lo leído con poca seguridad) y se rehacen las
// columnas: "600 g | 600 g" + "de atún | de cebolla" -> "600 g de atún", "600 g de cebolla".
// ---------------------------------------------------------------------------

const tieneTexto = (t) => /[a-z0-9áéíóúñ]/i.test(t);
const CONFIANZA_MINIMA = 55;

/** Parte una línea en celdas donde hay un hueco grande entre palabras. */
function celdasDe(linea) {
  const alto = Math.max(8, linea.y1 - linea.y0);
  const celdas = [];
  let corte = false;
  for (const p of [...linea.palabras].sort((a, b) => a.x0 - b.x0)) {
    // Una raya o signo suelto con hueco a los lados separa columnas ("1 hoja — 1 cucharadita"),
    // pero no un punto entre dos palabras ("cocinaconmaria · Seguir")
    if (!tieneTexto(p.texto)) { corte = true; continue; }
    const c = celdas.at(-1);
    const hueco = c ? p.x0 - c.x1 : 0;
    const junto = c && (corte ? hueco < alto * 1.2 : hueco <= alto * 0.9);
    corte = false;
    if (junto) { c.texto += ` ${p.texto}`; c.x1 = p.x1; c.conf = Math.min(c.conf, p.conf ?? 100); } else celdas.push({ texto: p.texto, x0: p.x0, x1: p.x1, conf: p.conf ?? 100 });
  }
  // Rayas y signos sueltos de adorno ("— de cebolla", "+ de aceite") fuera
  return celdas.map((c) => ({ ...c, texto: c.texto.replace(/^[^\p{L}\p{N}¿¡(]+|[^\p{L}\p{N}).:%!?]+$/gu, '') }))
    .filter((c) => tieneTexto(c.texto));
}

const mediana = (xs) => { const o = [...xs].sort((x, y) => x - y); return o[Math.floor(o.length / 2)] ?? 0; };

// Botones y textos de las apps (TikTok, Instagram) que salen encima de la captura.
const RUIDO_APP = /^(live|comunidad|siguiendo|tienda|para ti|inicio|amigos|mensajes|perfil|bandeja|descubrir|amigos|explorar|reels|buscar)$/i;

/** Línea fiable: el lector está seguro de ella, o al menos de una palabra larga (títulos con letra de adorno). */
const lineaSegura = (l) => l.confianza >= CONFIANZA_MINIMA
  || l.palabras.some((p) => (p.conf ?? 0) >= 90 && letras(p.texto) >= 4);

/** Celdas (trozos de línea) con su caja, sin lo poco seguro, la barra del móvil ni los botones de la app. */
function celdasDeLineas(lineas, altoImagen) {
  const celdas = [];
  for (const l0 of lineas) {
    if (!lineaSegura(l0)) continue;
    // Palabras sueltas leídas a ciegas (restos de una foto pegados a la línea) fuera
    const minimo = l0.confianza >= CONFIANZA_MINIMA ? 20 : 70;
    const l = { ...l0, palabras: l0.palabras.filter((p) => (p.conf ?? 100) >= minimo) };
    if (!l.palabras.length) continue;
    const texto = l.palabras.map((p) => p.texto).join(' ');
    if (altoImagen && l.y0 < altoImagen * 0.06 && /\d{1,2}:\d{2}/.test(texto)) continue;
    for (const c of celdasDe(l)) {
      const limpio = c.texto.split(/\s+/).filter((w) => !RUIDO_APP.test(w.replace(/[^\p{L} ]/gu, ''))).join(' ');
      if (letras(limpio) < 2 && !/\d/.test(limpio)) continue;
      celdas.push({ texto: limpio, x0: c.x0, x1: c.x1, y0: l.y0, y1: l.y1, alto: Math.max(8, l.y1 - l.y0), conf: c.conf });
    }
  }
  return celdas;
}

/** Huecos libres a lo largo de un eje: [{ en, tam }] */
function huecos(celdas, ini, fin) {
  const orden = [...celdas].sort((a, b) => a[ini] - b[ini]);
  const salida = [];
  let hasta = orden[0][fin];
  for (const c of orden.slice(1)) {
    if (c[ini] > hasta) salida.push({ en: (c[ini] + hasta) / 2, tam: c[ini] - hasta });
    hasta = Math.max(hasta, c[fin]);
  }
  return salida;
}

function partirEn(celdas, ini, cortes) {
  const grupos = cortes.map(() => []).concat([[]]);
  for (const c of celdas) grupos[cortes.filter((x) => c[ini] > x).length].push(c);
  return grupos.filter((g) => g.length);
}

/**
 * Orden de lectura por cortes (XY-cut): primero los huecos grandes entre zonas, luego las columnas
 * y por último las líneas. Devuelve renglones [{ texto, x0, y0, y1, alto }] en orden de lectura.
 */
function ordenDeLectura(celdas, alto) {
  if (celdas.length <= 1) return celdas;
  const h = huecos(celdas, 'y0', 'y1');
  const v = huecos(celdas, 'x0', 'x1');
  const maxH = Math.max(0, ...h.map((g) => g.tam));
  const maxV = Math.max(0, ...v.map((g) => g.tam));
  let grupos;
  // El hueco más claro manda: entre zonas (horizontal) o entre columnas (vertical)
  if (maxV >= alto && maxV >= maxH) grupos = partirEn(celdas, 'x0', v.filter((g) => g.tam >= alto).map((g) => g.en));
  else if (maxH >= alto * 0.8) grupos = partirEn(celdas, 'y0', h.filter((g) => g.tam >= alto * 0.8).map((g) => g.en));
  else if (maxV >= alto) grupos = partirEn(celdas, 'x0', v.filter((g) => g.tam >= alto).map((g) => g.en));
  else if (h.length) grupos = partirEn(celdas, 'y0', h.map((g) => g.en));
  else return renglones(celdas);
  return grupos.flatMap((g) => ordenDeLectura(g, alto));
}

/** Celdas que se tocan en vertical: se agrupan por renglón (por su centro) y cada renglón de izquierda a derecha. */
function renglones(celdas) {
  const grupos = [];
  for (const c of [...celdas].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1))) {
    const centro = (c.y0 + c.y1) / 2;
    const g = grupos.at(-1);
    if (g && Math.abs(centro - g.centro) < Math.min(c.alto, g.alto) * 0.5) g.celdas.push(c);
    else grupos.push({ centro, alto: c.alto, celdas: [c] });
  }
  return grupos.map(({ celdas: cs }) => {
    const o = cs.sort((a, b) => a.x0 - b.x0);
    return { texto: o.map((c) => c.texto).join(' '), x0: o[0].x0, x1: o.at(-1).x1, y0: Math.min(...o.map((c) => c.y0)), y1: Math.max(...o.map((c) => c.y1)), alto: Math.max(...o.map((c) => c.alto)) };
  });
}

/**
 * Rehace el texto de una captura a partir de las líneas del lector (con la posición de cada palabra).
 * Une los renglones partidos ("600 g" + "de atún fresco" + "limpio") cuando van pegados y el segundo
 * sigue en minúscula.
 * @param {Array<{y0:number, y1:number, confianza:number, palabras:Array<{texto:string, x0:number, x1:number}>}>} lineas
 * @param {number} [altoImagen] para quitar la barra de arriba del móvil (hora, batería)
 */
export function textoPorColumnas(lineas, altoImagen = 0) {
  const celdas = celdasDeLineas(lineas, altoImagen);
  if (!celdas.length) return '';
  const alto = mediana(celdas.map((c) => c.alto));
  const renglones = ordenDeLectura(celdas, alto);
  const salida = [];
  let prev = null;
  for (const r of renglones) {
    const cabecera = salida.length && (CAB_INGREDIENTES.test(normalizar(salida.at(-1))) || CAB_PASOS.test(normalizar(salida.at(-1))));
    const pegado = prev && !cabecera && r.y0 - prev.y1 < Math.min(r.alto, prev.alto) * 0.6 && r.y0 >= prev.y0
      && Math.abs(r.x0 - prev.x0) < alto * 3 && /^[a-záéíóúüñ(]/.test(r.texto) && !/^[eo•·]\s+\d/.test(r.texto)
      && !empiezaCantidad(r.texto) && !/[.!?]$/.test(salida.at(-1)) && Math.abs(r.alto - prev.alto) < alto * 0.5;
    if (pegado) salida[salida.length - 1] += ` ${r.texto}`;
    else salida.push(r.texto);
    prev = r;
  }
  return salida.join('\n');
}

/**
 * Posibles títulos, de letra más grande a más pequeña. El título es lo escrito con la letra más grande en la parte de arriba (no el subtítulo, ni
 * "Ingredientes", ni la barra del móvil). Si ocupa dos renglones ("Ramen" / "de langostino"), los junta.
 */
export function tituloPorTamano(lineas, altoImagen = 0) {
  const celdas = celdasDeLineas(lineas, altoImagen)
    .filter((c) => !altoImagen || c.y0 < altoImagen * 0.28)
    .filter((c) => !/\b(cucharad\w*|cdta|cdita|gramos|ml|kg|raciones|personas|minutos)\b/i.test(c.texto))
    .filter((c) => letras(c.texto) >= 3 && c.conf >= 80)
    .filter((c) => { const n = normalizar(c.texto); return !CAB_INGREDIENTES.test(n) && !CAB_PASOS.test(n) && !/^(opcion|receta|paso)\b/.test(n); });
  if (!celdas.length) return [];
  const normal = mediana(celdas.map((c) => c.alto));
  const candidatos = [];
  for (const mayor of [...celdas].sort((a, b) => b.alto - a.alto)) {
    if (mayor.alto < normal * 1.4) break;
    const grandes = celdas.filter((c) => c.alto >= mayor.alto * 0.55).sort((a, b) => a.y0 - b.y0);
    // Renglones grandes seguidos al del más grande ("Ramen" / "de langostino")
    const i = grandes.indexOf(mayor);
    let desde = i, hasta = i;
    while (desde > 0 && grandes[desde].y0 - grandes[desde - 1].y1 < mayor.alto * 0.8) desde--;
    while (hasta < grandes.length - 1 && grandes[hasta + 1].y0 - grandes[hasta].y1 < mayor.alto * 0.8) hasta++;
    const t = grandes.slice(desde, hasta + 1).map((c) => c.texto).join(' ').replace(/\s+/g, ' ').trim();
    if (!candidatos.includes(t)) candidatos.push(t);
  }
  return candidatos;
}

/**
 * Junta la lectura normal con una segunda lectura a menor tamaño, que es la que pilla los títulos
 * con letra muy grande. Solo se añaden líneas seguras que no estaban ya.
 */
export function juntarLecturas(lineas, lineasPequenas, escala) {
  const limpia = (t) => normalizar(t).replace(/[^a-z0-9ñ]/g, '');
  const buenas = lineas.filter(lineaSegura);
  // Solo letra grande: más alta que lo normal de la captura
  const normal = mediana(buenas.map((l) => l.y1 - l.y0));
  // Lo ya leído con letra grande (los títulos repiten palabras de los ingredientes: eso no cuenta)
  const ya = new Set(buenas.filter((l) => l.y1 - l.y0 >= normal * 1.3)
    .flatMap((l) => l.palabras.flatMap((p) => p.texto.split(/\s+/).map(limpia))));
  const nuevas = lineasPequenas
    .map((l) => ({ ...l, palabras: l.palabras.filter((p) => (p.conf ?? 100) >= 85) }))
    .filter((l) => l.palabras.some((p) => letras(p.texto) >= 4) && (l.y1 - l.y0) / escala >= normal * 1.6)
    .filter((l) => {
      const ps = l.palabras.map((p) => limpia(p.texto)).filter((t) => t.length > 2);
      return ps.length && ps.filter((t) => !ya.has(t)).length / ps.length >= 0.5;
    })
    .map((l) => ({
      ...l, y0: l.y0 / escala, y1: l.y1 / escala, confianza: Math.max(l.confianza, 90),
      // Una sola celda: es un título, no una fila de tabla
      palabras: [{ texto: l.palabras.map((p) => p.texto).join(' '), x0: l.palabras[0].x0 / escala, x1: l.palabras.at(-1).x1 / escala }],
    }));
  return [...lineas, ...nuevas];
}
