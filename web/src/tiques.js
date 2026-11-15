// Tiques: leer el texto de un tique (sacado de una foto o captura) y resumir gastos y ahorro.
// Funciones puras: se prueban con `node --test`.

import { normalizar, redondear, fechaISO } from './logica.js';

// ---------------------------------------------------------------------------
// Leer el texto
// ---------------------------------------------------------------------------
const NO_SON_PRODUCTOS = /\b(total|subtotal|sub-total|tarjeta|efectivo|cambio|entregado|igic|i\.g\.i\.c|iva|base|cuota|importe|visa|mastercard|maestro|n\.?i\.?f|c\.?i\.?f|factura|puntos|saldo|pago|pagado|devoluci|contactless|autoriz|operaci|ahorro total|has ahorrado|cupones? acumulad|redondeo|n[ºo°] art|art[ií]culos)\b/i;

/** "1,99" "1.99" "-0,30" (con los errores típicos del reconocimiento: O por 0) -> número */
export function leerImporte(s) {
  const t = String(s).replace(/[Oo]/g, '0').replace(/\s/g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const PRECIO_FINAL = /(-?\s?\d{1,4}[.,]\s?\d{2})\s*(?:€|eur)?\s*[a-e]?\s*\*?$/i;
const PESO = /(\d+[.,]\d{1,3})\s*kg\b/i;
const VECES = /^\s*(\d{1,3})\s*[x×*]\s*(\d{1,4}[.,]\d{2})\b/i;

export function detectarSuper(texto) {
  const t = normalizar(texto);
  if (/\blidl\b/.test(t)) return 'lidl';
  if (/mercadona/.test(t)) return 'mercadona';
  if (/hiper\s?dino|dinosol|superdino/.test(t)) return 'hiperdino';
  return null;
}

/** Fecha del tique ("15/11/2026", "15.11.26", "15-11-2026 18:32") como AAAA-MM-DD. */
export function detectarFecha(texto) {
  const m = String(texto).match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
  if (!m) return null;
  let [, d, mes, a] = m.map(Number);
  if (a < 100) a += 2000;
  if (mes < 1 || mes > 12 || d < 1 || d > 31 || a < 2020 || a > 2100) return null;
  return fechaISO(new Date(a, mes - 1, d));
}

/**
 * Lee el texto de un tique y saca sus líneas.
 * @returns {{supermercado:string|null, fecha:string|null, total:number|null,
 *            lineas:{texto:string, cantidad:number|null, precio_unidad:number|null, importe:number, descuento:number}[]}}
 */
export function leerTique(texto) {
  const filas = String(texto).split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').replace(/(?<=\d[.,]?)[Oo]|[Oo](?=[.,]\d)/g, '0').trim())
    .filter(Boolean);
  const lineas = [];
  let total = null;
  let nombreSuelto = null; // nombre sin precio (el precio viene en la línea siguiente: peso o "2 x 0,59")
  let vecesPendiente = null;

  for (const fila of filas) {
    // "2 x 0,59" sola: cantidad de la línea anterior (o de la siguiente)
    const soloVeces = fila.match(/^\s*(\d{1,3})\s*[x×*]\s*(\d{1,4}[.,]\d{2})\s*(?:€|eur)?\s*$/i);
    if (soloVeces) {
      const n = Number(soloVeces[1]), pu = leerImporte(soloVeces[2]);
      const ultima = lineas.at(-1);
      if (ultima && ultima.cantidad == null && Math.abs(ultima.importe - n * pu) < 0.02) {
        ultima.cantidad = n; ultima.precio_unidad = pu;
      } else {
        vecesPendiente = { n, pu };
      }
      continue;
    }
    let precio = fila.match(PRECIO_FINAL);
    // "2,19 B" leído como "219B": con la letra del impuesto detrás, las dos últimas cifras son céntimos
    if (!precio) {
      const sinComa = fila.match(/\s(\d)(\d{2})\s?[A-E]$/);
      if (sinComa) precio = Object.assign([sinComa[0], `${sinComa[1]},${sinComa[2]}`], { index: sinComa.index });
    }
    if (/\btotal\b/i.test(fila) && !/sub-?total|ahorro/i.test(fila) && precio) {
      total = Math.abs(leerImporte(precio[1]));
      nombreSuelto = null;
      continue;
    }
    if (NO_SON_PRODUCTOS.test(fila)) { nombreSuelto = null; continue; }
    const veces = fila.match(VECES);
    const peso = fila.match(PESO);
    if (!precio) {
      // "2 x 0,59" sin importe al final: cantidad de la línea anterior o de la siguiente
      if (veces) {
        const ultima = lineas.at(-1);
        const n = Number(veces[1]), pu = leerImporte(veces[2]);
        if (ultima && Math.abs(ultima.importe - n * pu) < 0.02) { ultima.cantidad = n; ultima.precio_unidad = pu; }
        continue;
      }
      if (/[a-záéíóúñ]{3}/i.test(fila) && !/^\d+$/.test(fila)) nombreSuelto = fila.replace(/^\d{1,2}\s+(?=\D)/, '');
      continue;
    }
    const importe = leerImporte(precio[1]);
    if (importe == null) continue;
    let resto = fila.slice(0, precio.index).trim();

    // Descuento: importe negativo, se resta de la línea anterior
    if (importe < 0) {
      const ultima = lineas.at(-1);
      if (ultima) ultima.descuento = redondear(ultima.descuento + -importe);
      continue;
    }
    // Línea de peso o de "2 x 0,59 1,18" cuyo nombre iba en la línea anterior
    if ((peso || veces) && nombreSuelto && !/[a-záéíóúñ]{4}/i.test(resto.replace(/kg|eur|x/gi, ''))) {
      lineas.push({
        texto: nombreSuelto,
        cantidad: peso ? leerImporte(peso[1]) : Number(veces[1]),
        precio_unidad: veces ? leerImporte(veces[2]) : null,
        importe, descuento: 0, kg: !!peso,
      });
      nombreSuelto = null;
      continue;
    }
    nombreSuelto = null;
    // "2 TOMATE TRITURADO 0,55 1,10" (Mercadona): cantidad delante y precio unitario antes del importe
    let cantidad = null, precioUnidad = null;
    const delante = resto.match(/^(\d{1,2})\s+(?=\D)/);
    if (delante) { cantidad = Number(delante[1]); resto = resto.slice(delante[0].length); }
    const unitario = resto.match(/\s[(\[|]?(\d{1,4}[.,]\d{2})[)\]|]?$/);
    if (unitario) { precioUnidad = leerImporte(unitario[1]); resto = resto.slice(0, unitario.index).trim(); }
    // "LECHE ASTURIANA 1L 2 1,15 2,30" (HiperDino): cantidad detrás del nombre
    const detras = precioUnidad != null && cantidad == null && resto.match(/\s(\d{1,2})$/);
    if (detras && Math.abs(Number(detras[1]) * precioUnidad - importe) < 0.02) {
      cantidad = Number(detras[1]); resto = resto.slice(0, detras.index).trim();
    }
    // Peso en la misma línea: "PLATANO 0,870 kg 1,56" o "PLATANO 0,870 kg x 1,79 €/kg 1,56"
    let kg = false;
    const pesoAqui = cantidad == null && resto.match(/\s(\d+[.,]\d{1,3})\s*kg\b.*$/i);
    if (pesoAqui && /[a-záéíóúñ]{3}/i.test(resto.slice(0, pesoAqui.index))) {
      cantidad = leerImporte(pesoAqui[1]); kg = true; precioUnidad = null; resto = resto.slice(0, pesoAqui.index).trim();
    }
    if (cantidad && !precioUnidad && cantidad > 1 && !kg) precioUnidad = redondear(importe / cantidad);
    resto = resto.replace(/^[^a-záéíóúñ0-9]+/i, '').trim();
    if (!/[a-záéíóúñ]{2}/i.test(resto)) continue;
    if (vecesPendiente && cantidad == null && Math.abs(importe - vecesPendiente.n * vecesPendiente.pu) < 0.02) {
      cantidad = vecesPendiente.n; precioUnidad = vecesPendiente.pu;
    }
    vecesPendiente = null;
    lineas.push({ texto: resto, cantidad, precio_unidad: precioUnidad, importe, descuento: 0, ...(kg ? { kg } : {}) });
  }
  return { supermercado: detectarSuper(texto), fecha: detectarFecha(texto), total, lineas };
}

/** Lo que de verdad se pagó por una línea. */
export const pagado = (l) => redondear(Number(l.importe) - Number(l.descuento ?? 0));

// ---------------------------------------------------------------------------
// Emparejar líneas del tique con los artículos de la casa ("LECHE SEMI DESN" -> Leche)
// ---------------------------------------------------------------------------
const VACIAS = new Set(['de', 'del', 'la', 'el', 'en', 'con', 'y', 'al', 'a', 'para', 'o']);
const pals = (t) => normalizar(t).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !VACIAS.has(w) && !/^\d/.test(w));
const sing = (w) => (w.length > 4 && /[^aeiou]es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
/** Abreviaturas de tique: "TRITUR" vale por "triturado"; "SAL" no vale por "salmón". */
const abrevia = (corta, larga) => corta.length >= 3 && larga.startsWith(corta) && (corta.length >= 4 || corta === larga);
const casan = (a, b) => { a = sing(a); b = sing(b); return a === b || abrevia(a, b) || abrevia(b, a); };

/** El artículo de la casa que mejor encaja con el texto de una línea (o null). */
export function emparejarArticulo(texto, articulos) {
  const wt = pals(texto);
  let mejor = null, nota = 0;
  for (const a of articulos) {
    const wa = pals(a.nombre.replace(/\([^)]*\)/g, ' '));
    if (!wa.length) continue;
    const dentro = wa.filter((w) => wt.some((t) => casan(t, w))).length;
    // Todas las palabras del artículo tienen que estar; gana el que más palabras tiene (más concreto)
    if (dentro < wa.length) continue;
    const n = wa.length + (casan(wt[0] ?? '', wa[0]) ? 0.5 : 0);
    if (n > nota) { mejor = a; nota = n; }
  }
  return mejor;
}

// ---------------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------------
/** Primer día del periodo que contiene la fecha: semana (lunes), mes o año. */
export function inicioPeriodo(iso, periodo) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (periodo === 'anio') return `${a}-01-01`;
  if (periodo === 'mes') return `${a}-${String(m).padStart(2, '0')}-01`;
  const f = new Date(a, m - 1, d);
  f.setDate(f.getDate() - ((f.getDay() + 6) % 7));
  return fechaISO(f);
}

/**
 * Gasto agrupado por periodo y por súper.
 * @returns {{inicio:string, total:number, porSuper:Record<string,number>, tiques:number}[]} del más reciente al más antiguo
 */
export function gastosPorPeriodo(tiques, periodo) {
  const grupos = new Map();
  for (const t of tiques) {
    const k = inicioPeriodo(t.fecha, periodo);
    if (!grupos.has(k)) grupos.set(k, { inicio: k, total: 0, porSuper: {}, tiques: 0 });
    const g = grupos.get(k);
    const total = Number(t.total ?? 0);
    g.total = redondear(g.total + total);
    g.tiques++;
    const s = t.supermercado_id ?? 'otro';
    g.porSuper[s] = redondear((g.porSuper[s] ?? 0) + total);
  }
  return [...grupos.values()].sort((a, b) => b.inicio.localeCompare(a.inicio));
}

/**
 * Cuánto se podría haber ahorrado: para cada línea con artículo, el precio de hoy en los otros súper.
 * @param {object[]} lineas  líneas de tique (con articulo_id), con el súper del tique en `supermercado_id`
 * @param {(articuloId:string, supermercado:string)=>number|null} precioEn  precio de un envase en ese súper
 */
export function ahorroPosible(lineas, precioEn, supers) {
  const detalle = [];
  let pagadoTotal = 0, mejorTotal = 0;
  for (const l of lineas) {
    if (!l.articulo_id) continue;
    const unidades = l.kg ? 1 : Math.max(1, Number(l.cantidad) || 1);
    const pago = pagado(l);
    let mejor = { s: l.supermercado_id, precio: pago };
    for (const s of supers) {
      if (s === l.supermercado_id) continue;
      const p = precioEn(l.articulo_id, s);
      if (p != null && !l.kg && p * unidades < mejor.precio - 0.005) mejor = { s, precio: redondear(p * unidades) };
    }
    pagadoTotal += pago;
    mejorTotal += mejor.precio;
    if (mejor.s !== l.supermercado_id) {
      detalle.push({ texto: l.texto, articulo_id: l.articulo_id, pagado: pago, en: mejor.s, precio: mejor.precio,
        diferencia: redondear(pago - mejor.precio) });
    }
  }
  detalle.sort((a, b) => b.diferencia - a.diferencia);
  return { pagado: redondear(pagadoTotal), minimo: redondear(mejorTotal), ahorro: redondear(pagadoTotal - mejorTotal), detalle };
}

/** Gasto por sección de la casa (Frutería, Lácteos…), de más a menos. Lo no enlazado va a "Sin clasificar". */
export function gastoPorCategoria(lineas, articulos) {
  const cat = new Map(articulos.map((a) => [a.id, a.categoria || 'Otros']));
  const suma = new Map();
  for (const l of lineas) {
    const c = (l.articulo_id && cat.get(l.articulo_id)) || 'Sin clasificar';
    suma.set(c, redondear((suma.get(c) ?? 0) + pagado(l)));
  }
  return [...suma.entries()].sort((a, b) => b[1] - a[1]);
}

/** CSV con punto y coma y coma decimal (lo que espera Excel en España). */
export function textoCSV(filas) {
  const celda = (v) => {
    const t = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return filas.map((f) => f.map(celda).join(';')).join('\r\n');
}
