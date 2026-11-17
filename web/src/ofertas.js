// Ofertas de lo que se compra a menudo, y gasto por periodo y súper para la gráfica de Gastos.
// Solo cuentas: nada de pantalla ni de red, para poder probarlo.

import { fechaISO, sumarDias, redondear } from './logica.js';

/**
 * Artículos que la casa compra a menudo: los que salen en al menos `minimo` días distintos de compra
 * en los últimos `dias` días (por los tiques y por lo marcado como comprado en la lista).
 * @returns {Map<string, number>} articulo_id -> número de días en que se compró
 */
export function compradoAMenudo(datos, hoy = fechaISO(), { dias = 120, minimo = 2 } = {}) {
  const desde = sumarDias(hoy, -dias);
  const diasDe = new Map();
  const apuntar = (articulo, dia) => {
    if (!articulo || !dia || dia < desde || dia > hoy) return;
    if (!diasDe.has(articulo)) diasDe.set(articulo, new Set());
    diasDe.get(articulo).add(dia);
  };
  const fechaTique = new Map((datos.tiques ?? []).map((t) => [t.id, String(t.fecha).slice(0, 10)]));
  for (const l of datos.tique_lineas ?? []) apuntar(l.articulo_id, fechaTique.get(l.tique_id));
  for (const l of datos.lista ?? []) if (l.comprado && l.comprado_en) apuntar(l.articulo_id, String(l.comprado_en).slice(0, 10));
  const salida = new Map();
  for (const [a, s] of diasDe) if (s.size >= minimo) salida.set(a, s.size);
  return salida;
}

const mediana = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * Qué está hoy más barato de lo normal entre lo que se compra a menudo.
 * Cuenta como oferta: el súper lo marca rebajado (precio de antes), o el precio de hoy es al menos un
 * `bajada` (10 %) más bajo que el que solía tener en las últimas semanas.
 * Solo productos con precio mirado hace poco (`frescura` días): una oferta vieja puede haber terminado.
 *
 * @param {Map<string,number>} frecuentes  de compradoAMenudo
 * @param {object[]} equivalencias  enlaces artículo de la casa -> producto del súper
 * @param {Map<string,object>} productos  catálogo: id -> producto con precio, precio_anterior, visto_en
 * @param {Map<string,{precio:number, visto_en:string}[]>} historial  precios anteriores de cada producto
 * @param {(p:object)=>boolean} vale  quita lo que no le gusta
 * @returns {{articulo_id, producto, precio, antes, ahorro, pct, veces, motivo:'rebajado'|'bajada'}[]}
 *          una por artículo (la mejor), de más interesante a menos
 */
export function ofertasDe(frecuentes, equivalencias, productos, historial = new Map(), {
  hoy = fechaISO(), vale = () => true, bajada = 0.1, frescura = 10, semanas = 12,
} = {}) {
  const desde = sumarDias(hoy, -semanas * 7);
  const reciente = sumarDias(hoy, -frescura);
  const mejor = new Map();
  for (const e of equivalencias) {
    const veces = frecuentes.get(e.articulo_id);
    if (!veces) continue;
    const p = productos.get(e.producto_id);
    if (!p || p.activo === false || !Number.isFinite(p.precio) || p.precio <= 0 || !vale(p)) continue;
    if (!p.visto_en || String(p.visto_en).slice(0, 10) < reciente) continue;
    let antes = null, motivo = null;
    if (Number.isFinite(p.precio_anterior) && p.precio_anterior > p.precio) {
      antes = p.precio_anterior; motivo = 'rebajado';
    } else {
      // Precios de antes de este producto (sin contar el de hoy), en las últimas semanas
      const previos = (historial.get(p.id) ?? [])
        .filter((h) => String(h.visto_en).slice(0, 10) >= desde && String(h.visto_en) < String(p.visto_en))
        .map((h) => Number(h.precio)).filter((x) => Number.isFinite(x) && x > 0);
      if (previos.length) {
        const habitual = mediana(previos);
        if (p.precio <= habitual * (1 - bajada)) { antes = redondear(habitual); motivo = 'bajada'; }
      }
    }
    if (!antes) continue;
    const ahorro = redondear(antes - p.precio);
    if (ahorro < 0.05) continue;
    const o = { articulo_id: e.articulo_id, producto: p, precio: p.precio, antes, ahorro,
      pct: Math.round((ahorro / antes) * 100), veces, motivo };
    const ya = mejor.get(e.articulo_id);
    if (!ya || o.pct > ya.pct) mejor.set(e.articulo_id, o);
  }
  return [...mejor.values()].sort((a, b) => b.veces * b.ahorro - a.veces * a.ahorro || b.pct - a.pct);
}

/**
 * Para la gráfica: los últimos `n` periodos (de gastosPorPeriodo), con cada súper como un trozo de la barra.
 * @returns {{inicio, total, trozos:{s:string, valor:number, ancho:number}[]}[]}  ancho en % del mayor total
 */
export function barrasPorSuper(grupos, n = 6, orden = ['mercadona', 'hiperdino', 'lidl']) {
  const ultimos = grupos.slice(0, n);
  const max = Math.max(0, ...ultimos.map((g) => g.total));
  const pos = (s) => { const i = orden.indexOf(s); return i < 0 ? orden.length : i; };
  return ultimos.map((g) => ({
    inicio: g.inicio,
    total: g.total,
    trozos: Object.entries(g.porSuper).filter(([, v]) => v > 0)
      .sort((a, b) => pos(a[0]) - pos(b[0]))
      .map(([s, v]) => ({ s, valor: v, ancho: max > 0 ? Math.round((v / max) * 1000) / 10 : 0 })),
  }));
}

/**
 * Comparación con el periodo anterior, a la misma altura: si hoy es día 17 del mes, se compara con lo
 * gastado del 1 al 17 del mes pasado (si no, siempre parecería que este mes se gasta menos).
 * @returns {{antes:number, diferencia:number}|null}
 */
export function comparaConAnterior(tiques, periodo, hoy = fechaISO(), inicioPeriodo) {
  const inicio = inicioPeriodo(hoy, periodo);
  const transcurridos = Math.round((new Date(`${hoy}T12:00`) - new Date(`${inicio}T12:00`)) / 864e5);
  const [a, m] = inicio.split('-').map(Number);
  const anterior = periodo === 'anio' ? `${a - 1}-01-01`
    : periodo === 'mes' ? fechaISO(new Date(a, m - 2, 1)) : sumarDias(inicio, -7);
  const hasta = sumarDias(anterior, transcurridos);
  const fin = sumarDias(inicio, -1);
  const suma = (de, a2) => redondear(tiques.filter((t) => { const f = String(t.fecha).slice(0, 10); return f >= de && f <= a2; })
    .reduce((s, t) => s + Number(t.total ?? 0), 0));
  const antes = suma(anterior, hasta < fin ? hasta : fin);
  if (!tiques.some((t) => String(t.fecha).slice(0, 10) < inicio)) return null;
  const ahora = suma(inicio, hoy);
  return { antes, ahora, diferencia: redondear(ahora - antes) };
}
