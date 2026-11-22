// Compartir recetas y listas por WhatsApp, modo cocina (temporizadores) y descontar lo cocinado.
// Solo cálculos: las pantallas están en app.js.

import { escalar, formatoCantidad, redondear, variantesDe, agruparPorCategoria } from './logica.js';

/** 3, 'ud' -> "3"; 250, 'g' -> "250 g" (en un mensaje "3 ud" queda raro). */
function cantidadTexto(c, unidad) {
  if (c == null) return '';
  return unidad === 'ud' ? String(redondear(c, 2)).replace('.', ',') : formatoCantidad(c, unidad);
}

/** Pasos de una receta, uno por línea y sin números delante ("1. ", "2) "). */
export function pasosDe(receta) {
  return String(receta?.pasos ?? '').split('\n')
    .map((p) => p.trim().replace(/^\d+\s*[.)-]\s*/, ''))
    .filter(Boolean);
}

// Encabezados dentro de la preparación: "Truco o recomendación:", "Consejo: …", "Para servir:".
const ENCABEZADO = /^((?:mi |un |el )?(?:trucos?|consejos?|recomendaci[oó]n(?:es)?|notas?|tips?|sugerenci[ae]s?|importante|ojo|emplatado|presentaci[oó]n|conservaci[oó]n|para servir|variantes?|acompañamiento)\b[^:]{0,40}:)\s*(.*)$/i;

/**
 * Separa el encabezado de una línea de la preparación para verlo en negrita:
 * "Truco o recomendación:" -> { titulo: 'Truco o recomendación:', resto: '' };
 * "Consejo: sirve frío" -> { titulo: 'Consejo:', resto: 'sirve frío' }. Si no hay, null.
 * También cuenta una línea corta que acaba en dos puntos ("Para la salsa:").
 */
export function encabezadoPaso(linea) {
  const t = String(linea ?? '').trim();
  const m = t.match(ENCABEZADO);
  if (m) return { titulo: m[1], resto: m[2] };
  if (/^[^\d:][^:]{1,44}:$/.test(t)) return { titulo: t, resto: '' };
  return null;
}

/** Texto de una receta para mandarlo por WhatsApp (con *negritas* de WhatsApp). */
export function textoReceta(receta, ingredientes, articulos, raciones = receta.raciones) {
  const art = new Map(articulos.map((a) => [a.id, a]));
  const lineas = [`*${receta.nombre}*`];
  const datos = [raciones && `${raciones} ${raciones === 1 ? 'ración' : 'raciones'}`, receta.tiempo_min && `${receta.tiempo_min} min`]
    .filter(Boolean).join(' · ');
  if (datos) lineas.push(datos);
  const ings = [...ingredientes].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  if (ings.length) {
    lineas.push('', '*Ingredientes*');
    for (const i of ings) {
      if (i.texto && raciones === receta.raciones) { lineas.push(`• ${i.texto}`); continue; }
      const a = art.get(i.articulo_id);
      const c = escalar(i.cantidad, receta.raciones, raciones);
      const cuanto = c == null ? (i.nota || '') : `${cantidadTexto(c, a?.unidad)}${i.nota ? ` (${i.nota})` : ''}`;
      lineas.push(`• ${a?.nombre ?? '¿?'}${cuanto ? `: ${cuanto}` : ''}`);
    }
  }
  const pasos = pasosDe(receta);
  if (pasos.length) {
    lineas.push('', '*Preparación*');
    let n = 0;
    for (const p of pasos) {
      const e = encabezadoPaso(p);
      if (e) lineas.push('', `*${e.titulo}*${e.resto ? ` ${e.resto}` : ''}`);
      else lineas.push(`${++n}. ${p}`);
    }
  }
  return lineas.join('\n');
}

/** Texto de una lista de la compra ({articulo_id, cantidad, marca}), por secciones del súper. */
export function textoLista(titulo, filas, articulos) {
  const art = new Map(articulos.map((a) => [a.id, a]));
  const lineas = [`🛒 *${titulo}*`];
  for (const [cat, grupo] of agruparPorCategoria(filas, articulos)) {
    lineas.push('', `*${cat}*`);
    for (const f of grupo) {
      const a = art.get(f.articulo_id);
      const extra = [f.marca, cantidadTexto(f.cantidad, a?.unidad)].filter(Boolean).join(', ');
      lineas.push(`▢ ${a?.nombre ?? '¿?'}${extra ? ` (${extra})` : ''}`);
    }
  }
  return lineas.join('\n');
}

// ---------------------------------------------------------------------------
// Temporizadores: "hornea 25 minutos", "cuece 1 hora y media", "1 h 15 min", "20-25 min"
// ---------------------------------------------------------------------------
const NUM = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, media: 0.5, medio: 0.5 };
const N = '(\\d+(?:[.,]\\d+)?|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce|quince|veinte|treinta|cuarenta|cincuenta|media|medio)';
const UNIDAD = '(horas?|h|minutos?|mins?|m|segundos?|segs?|s)\\b';
const TIEMPO = new RegExp(`${N}(?:\\s*(?:-|a|o)\\s*${N})?\\s*${UNIDAD}(?:\\s*(?:y\\s*)?(media|cuarto)\\b|\\s*(?:y\\s*)?${N}\\s*(minutos?|mins?|m)\\b)?`, 'gi');

const num = (t) => (t == null ? null : NUM[t.toLowerCase()] ?? Number(t.replace(',', '.')));
const factor = (u) => (/^h/i.test(u) ? 3600 : /^m/i.test(u) ? 60 : 1);

/**
 * Tiempos que aparecen en un paso.
 * @returns {Array<{ segundos:number, texto:string }>} sin repetir; en "20-25 min" se toma el mayor.
 */
export function tiemposDePaso(texto) {
  const salida = [];
  for (const m of String(texto ?? '').matchAll(TIEMPO)) {
    const [entero, a, b, u, mediaCuarto, extra] = m;
    const antes = texto[m.index - 1];
    if (antes && /[a-záéíóúñ0-9]/i.test(antes)) continue;            // "100 g" no; "pan 2 m…" tampoco
    if (/^m$/i.test(u) && !/\d/.test(a)) continue;                   // "una m" no es un tiempo
    const n = Math.max(num(a), num(b) ?? 0);
    if (!(n > 0)) continue;
    let s = n * factor(u);
    if (mediaCuarto) s += (mediaCuarto.toLowerCase() === 'media' ? 0.5 : 0.25) * factor(u);
    if (extra) s += num(extra) * 60;
    s = Math.round(s);
    if (s < 5 || s > 24 * 3600) continue;
    if (!salida.some((x) => x.segundos === s)) salida.push({ segundos: s, texto: entero.trim() });
  }
  return salida;
}

/** 90 -> "1:30"; 3725 -> "1:02:05" */
export function reloj(segundos) {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const dos = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${dos(m)}:${dos(r)}` : `${m}:${dos(r)}`;
}

/** 1500 -> "25 min"; 5400 -> "1 h 30 min"; 30 -> "30 s" */
export function duracion(segundos) {
  if (segundos < 60) return `${segundos} s`;
  const h = Math.floor(segundos / 3600), m = Math.round((segundos % 3600) / 60);
  return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Descontar lo cocinado
// ---------------------------------------------------------------------------
/**
 * Qué restar de la despensa al cocinar una receta para `raciones`.
 * Si el artículo de la receta no está en casa pero sí una variante con la misma unidad
 * ("Tomate" -> "Tomate pera"), se resta de la variante.
 * @returns {Array<{ clave, articulo_id, nombre, unidad, cantidad, hay, enDespensa:boolean, receta_articulo_id }>}
 *   solo ingredientes con cantidad; `enDespensa` false = no está apuntado en casa (se propone saltarlo).
 */
export function aDescontar(datos, recetaId, raciones) {
  const receta = datos.recetas.find((r) => r.id === recetaId);
  if (!receta) return [];
  const art = new Map(datos.articulos.map((a) => [a.id, a]));
  const fila = (id) => datos.despensa.find((d) => d.articulo_id === id);
  const salida = [];
  const ings = datos.ingredientes.filter((i) => i.receta_id === recetaId && i.cantidad != null)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  for (const i of ings) {
    const a = art.get(i.articulo_id);
    if (!a) continue;
    const cantidad = escalar(i.cantidad, receta.raciones, raciones);
    let elegido = a;
    if (!(fila(a.id)?.cantidad > 0)) {
      const otra = variantesDe(datos.articulos, a.id)
        .find((v) => v.id !== a.id && v.unidad === a.unidad && fila(v.id)?.cantidad > 0);
      if (otra) elegido = otra;
    }
    const d = fila(elegido.id);
    const previa = salida.find((x) => x.articulo_id === elegido.id);
    if (previa) { previa.cantidad = redondear(previa.cantidad + cantidad, 3); continue; }
    salida.push({
      clave: i.id ?? `${i.articulo_id}-${salida.length}`,
      articulo_id: elegido.id, receta_articulo_id: a.id, nombre: elegido.nombre, unidad: elegido.unidad,
      cantidad, hay: d?.cantidad ?? 0, enDespensa: !!d,
    });
  }
  return salida;
}
