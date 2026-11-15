// Proponer el menú de la semana con lo que hay en casa y lo que está de oferta.
// Funciones puras: se prueban con `node --test`.

import { sumarDias, normalizar } from './logica.js';

const tiene = (r, etiqueta) => (r.etiquetas ?? []).some((e) => normalizar(e) === normalizar(etiqueta));
/** Las etiquetas de "tipo de plato" (carne, pescado, pasta, cuchara…) para no repetir seguido lo mismo. */
const tipos = (r) => {
  const t = (r.etiquetas ?? []).map(normalizar).filter((e) => !/rapida|ligera|cena|ninos|clasica|canaria|horno|fria|aprovechamiento/.test(e))
    .map((e) => (e === 'legumbres' ? 'cuchara' : e));
  return t.length ? t : [normalizar(r.nombre)];
};
const parecidas = (a, b) => tipos(a).some((t) => tipos(b).includes(t));

/**
 * @param {object} datos  { recetas, ingredientes, despensa, plan }
 * @param {{desde:string, dias?:number, momentos?:string[], raciones?:number,
 *          ofertas?:Set<string>, azar?:()=>number}} op
 *   ofertas: artículos que están de oferta en algún súper; azar: para "otra propuesta"
 * @returns {{fecha, momento, receta_id, raciones, motivo:string}[]}  solo los huecos libres del plan
 */
export function proponerMenu(datos, { desde, dias = 7, momentos = ['comida', 'cena'], raciones = 2, ofertas = new Set(), azar = () => 0.5 }) {
  const hay = new Map(datos.despensa.filter((d) => d.cantidad > 0).map((d) => [d.articulo_id, d.cantidad]));
  const ingredientes = new Map();
  for (const i of datos.ingredientes) {
    if (i.cantidad == null) continue; // "al gusto": no cuenta
    if (!ingredientes.has(i.receta_id)) ingredientes.set(i.receta_id, []);
    ingredientes.get(i.receta_id).push(i);
  }
  // Lo comido hace poco no se repite
  const recientes = new Map();
  for (const p of datos.plan) {
    if (p.fecha >= sumarDias(desde, -14) && p.fecha < sumarDias(desde, dias)) {
      recientes.set(p.receta_id, (recientes.get(p.receta_id) ?? 0) + 1);
    }
  }
  const usadas = new Map();
  const propuesta = [];
  const ultimas = []; // las dos últimas comidas
  const anotar = (r) => { if (r) { ultimas.unshift(r); ultimas.length = Math.min(ultimas.length, 2); } };

  for (let d = 0; d < dias; d++) {
    const fecha = sumarDias(desde, d);
    for (const momento of momentos) {
      if (datos.plan.some((p) => p.fecha === fecha && p.momento === momento)) {
        anotar(datos.recetas.find((r) => r.id === datos.plan.find((p) => p.fecha === fecha && p.momento === momento).receta_id));
        continue;
      }
      let mejor = null, nota = -Infinity, motivo = '';
      for (const r of datos.recetas) {
        const ings = ingredientes.get(r.id) ?? [];
        const enCasa = ings.filter((i) => hay.has(i.articulo_id)).length;
        const deOferta = ings.filter((i) => ofertas.has(i.articulo_id)).length;
        let n = (ings.length ? (enCasa / ings.length) * 4 : 0) + deOferta * 0.75;
        if (r.favorita) n += 1;
        if (momento === 'cena' && (tiene(r, 'Cena') || tiene(r, 'Ligera') || tiene(r, 'Rápida'))) n += 1;
        if (momento === 'comida' && tiene(r, 'Cuchara')) n += 0.5;
        if (momento === 'cena' && (tiene(r, 'Cuchara') || tiene(r, 'Legumbres'))) n -= 1;
        n -= (recientes.get(r.id) ?? 0) * 3 + (usadas.get(r.id) ?? 0) * 8;
        ultimas.forEach((u, i) => { if (parecidas(u, r)) n -= i === 0 ? 2 : 1; });
        n += azar() * 1.5;
        if (n > nota) {
          nota = n; mejor = r;
          motivo = [enCasa && `${enCasa} de ${ings.length} ingredientes en casa`, deOferta && `${deOferta} de oferta`,
            r.favorita && 'favorita'].filter(Boolean).join(' · ');
        }
      }
      if (!mejor) continue;
      usadas.set(mejor.id, (usadas.get(mejor.id) ?? 0) + 1);
      propuesta.push({ fecha, momento, receta_id: mejor.id, raciones, motivo });
      anotar(mejor);
    }
  }
  return propuesta;
}
