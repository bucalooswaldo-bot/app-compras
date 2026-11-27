// Avisos de la casa: lo que se acaba y lo que falta para el menú de los próximos días.
// También las garantías que se acaban (si la casa las guarda).
// Lo usan la pantalla de Inicio y el aviso diario en el móvil (la función "avisos" de Supabase usa una copia).
import { estaBajo, tengoTodo, sumarDias, diasHasta, MOMENTOS } from './logica.js';

const ORDEN_MOMENTO = Object.fromEntries(MOMENTOS.map(([m], i) => [m, i]));

/**
 * @returns {{ seAcaba: Array<{articulo_id, nombre, unidad, cantidad, agotado}>,
 *             menu: Array<{comida, receta, fecha, momento, faltan: Array<{articulo_id, nombre, falta, unidad}>}> }}
 */
export function avisosDeCasa(datos, hoy, dias = 3) {
  const art = new Map(datos.articulos.map((a) => [a.id, a]));
  const seAcaba = datos.despensa
    .filter((d) => estaBajo(d) && art.has(d.articulo_id))
    .map((d) => {
      const a = art.get(d.articulo_id);
      return { articulo_id: a.id, nombre: a.nombre, unidad: a.unidad, cantidad: d.cantidad, agotado: d.cantidad <= 0 };
    })
    .sort((x, y) => (y.agotado - x.agotado) || x.nombre.localeCompare(y.nombre, 'es'));

  const hasta = sumarDias(hoy, dias - 1);
  const menu = datos.plan
    .filter((c) => !c.cocinado && c.fecha >= hoy && c.fecha <= hasta)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (ORDEN_MOMENTO[a.momento] ?? 9) - (ORDEN_MOMENTO[b.momento] ?? 9))
    .map((c) => {
      const receta = datos.recetas.find((r) => r.id === c.receta_id);
      const faltan = receta ? tengoTodo(datos, c.receta_id, c.raciones).filter((f) => f.estado === 'falta') : [];
      return { comida: c, receta, fecha: c.fecha, momento: c.momento, faltan };
    })
    .filter((x) => x.receta);
  // Garantías: se avisa un mes y una semana antes de que acaben
  const garantias = (datos.garantias ?? [])
    .map((g) => ({ ...g, dias: diasHasta(g.hasta, hoy) }))
    .filter((g) => DIAS_AVISO_GARANTIA.includes(g.dias))
    .sort((a, b) => a.dias - b.dias);
  return { seAcaba, menu, garantias };
}

/** Días antes del final de una garantía en que se avisa en el móvil. */
export const DIAS_AVISO_GARANTIA = [30, 7];

/** "a", "a y b", "a, b y c" (y "y 2 más" si son muchas). */
export function enumerar(nombres, max = 3) {
  const n = nombres.map((x) => x.toLowerCase());
  if (n.length > max) return `${n.slice(0, max).join(', ')} y ${n.length - max} más`;
  if (n.length <= 1) return n[0] ?? '';
  return `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
}

/**
 * Texto del aviso diario en el móvil, o null si no hay nada que contar.
 * Solo cuenta el menú de hoy y mañana (lo de más adelante aún se puede comprar con calma).
 */
export function textoAviso(avisos, hoy) {
  const manana = sumarDias(hoy, 1);
  const lineas = [];
  for (const m of avisos.menu) {
    if (m.fecha > manana || !m.faltan.length) continue;
    const cuando = m.fecha === hoy ? 'Hoy' : 'Mañana';
    const momento = { comida: ' para comer', cena: ' para cenar' }[m.momento] ?? '';
    lineas.push(`${cuando}${momento} toca ${m.receta.nombre} y falta ${enumerar(m.faltan.map((f) => f.nombre))}.`);
  }
  if (avisos.seAcaba.length) {
    const nombres = avisos.seAcaba.map((s) => s.nombre);
    lineas.push(`Se ${nombres.length > 1 ? 'acaban' : 'acaba'}: ${enumerar(nombres, 4)}.`);
  }
  for (const g of avisos.garantias ?? []) {
    lineas.push(`La garantía de ${g.que.toLowerCase()} acaba ${g.dias === 7 ? 'en una semana' : 'en un mes'}. Si falla algo, aún entra en garantía.`);
  }
  if (!lineas.length) return null;
  const porMenu = avisos.menu.some((m) => m.faltan.length && m.fecha <= manana);
  const titulo = porMenu ? 'Falta algo para el menú'
    : avisos.seAcaba.length ? 'Se acaba algo en casa' : 'Una garantía se acaba';
  return { titulo, cuerpo: lineas.join('\n') };
}
