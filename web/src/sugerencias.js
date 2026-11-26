// Ideas para la pantalla de Inicio: la receta del día y filas de sugerencias del recetario de la app.
// Todo sale de la fecha (cambia cada día, igual en los dos móviles) y de lo que hay en la despensa.
import { normalizar, esBasico } from './logica.js';
import { articuloDeIngrediente } from './recetario.js';

/** Tipos que no son un plato para comer o cenar. */
const NO_PRINCIPAL = new Set(['Postres y dulces', 'Salsas y bases', 'Desayunos y meriendas']);
export const esPrincipal = (r) => !NO_PRINCIPAL.has(r.tipo) && !r.oculta;

/** Número fijo para cada día (2026-11-26 -> mismo número en todos los móviles). */
export function semillaDe(fecha) {
  let h = 2166136261;
  for (const c of String(fecha)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Baraja siempre igual para la misma semilla. */
export function barajar(lista, semilla) {
  let s = semilla >>> 0;
  const azar = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Qué apetece según el mes (en Canarias el verano es largo y el invierno suave). */
export function temporada(fecha) {
  const mes = Number(String(fecha).slice(5, 7));
  if (mes >= 11 || mes <= 2) {
    return { titulo: 'Para estos días: de cuchara', subtitulo: 'Potajes, cremas y guisos calentitos',
      vale: (r) => ['Legumbres y cuchara', 'Sopas y cremas'].includes(r.tipo) || (r.etiquetas ?? []).includes('Cuchara') };
  }
  if (mes >= 6 && mes <= 9) {
    return { titulo: 'Para el calor: fresquito', subtitulo: 'Ensaladas y platos ligeros',
      vale: (r) => r.tipo === 'Ensaladas' || (r.etiquetas ?? []).some((e) => e === 'Verano' || e === 'Ligera') };
  }
  return { titulo: 'De temporada', subtitulo: 'Verduras y platos de siempre',
    vale: (r) => ['Verduras y guarniciones', 'Legumbres y cuchara', 'Arroces'].includes(r.tipo) };
}

/** No proponer cosas de verano en invierno ni de cuchara en pleno verano. */
function fueraDeTemporada(r, fecha) {
  const mes = Number(String(fecha).slice(5, 7));
  const et = r.etiquetas ?? [];
  if (mes >= 11 || mes <= 2) return et.includes('Verano');
  if (mes >= 6 && mes <= 9) return r.tipo === 'Legumbres y cuchara' || et.includes('Cuchara');
  return false;
}

/**
 * Devuelve una función que dice si un ingrediente está en casa (con cantidad).
 * Recuerda cada nombre: el recetario repite muchos ingredientes.
 */
export function enCasa(datos) {
  const hay = new Map(datos.despensa.filter((d) => d.cantidad > 0).map((d) => [d.articulo_id, d]));
  const cache = new Map();
  return (nombre) => {
    const k = normalizar(nombre);
    if (!cache.has(k)) {
      const a = articuloDeIngrediente(datos.articulos, nombre);
      cache.set(k, !!(a && hay.has(a.id)));
    }
    return cache.get(k);
  };
}

/** Cuántos ingredientes de la receta hay en casa (sin contar sal, aceite y demás básicos). */
export function cobertura(receta, tiene) {
  const cuentan = receta.ingredientes.filter(([n]) => !esBasico(n));
  return { tengo: cuentan.filter(([n]) => tiene(n)).length, total: cuentan.length };
}

/**
 * La receta del día: un plato principal de temporada, distinto cada día.
 * `vuelta` es cuántas veces se ha pedido «otra idea». Si hay recetas con foto, salen esas primero.
 */
export function recetaDelDia(recetas, fecha, vuelta = 0) {
  let validas = recetas.filter((r) => esPrincipal(r) && !fueraDeTemporada(r, fecha));
  if (!validas.length) return null;
  // Entre semana, platos de hora como mucho; el fin de semana vale cualquiera.
  const dia = new Date(`${fecha}T12:00:00`).getDay();
  const cortas = validas.filter((r) => !r.tiempo_min || r.tiempo_min <= 60);
  if (dia >= 1 && dia <= 5 && cortas.length >= 7) validas = cortas;
  const conFoto = validas.filter((r) => r.foto);
  const bolsa = conFoto.length >= 7 ? conFoto : validas;
  const orden = barajar(bolsa, semillaDe(fecha));
  return orden[vuelta % orden.length];
}

/** Temas que van rotando por días en la última fila. */
const TEMAS = [
  { titulo: 'Cocina canaria', subtitulo: 'Lo de aquí, como en casa', vale: (r) => r.tipo === 'Cocina canaria' },
  { titulo: 'Un día de pasta', subtitulo: 'Para que no falle', vale: (r) => r.tipo === 'Pasta' },
  { titulo: 'Del mar', subtitulo: 'Pescado y marisco', vale: (r) => r.tipo === 'Pescados' || r.tipo === 'Marisco' },
  { titulo: 'Para los niños', subtitulo: 'Fáciles y que gustan', vale: (r) => (r.etiquetas ?? []).includes('Niños') },
  { titulo: 'Arroces', subtitulo: 'Del caldoso al seco', vale: (r) => r.tipo === 'Arroces' },
  { titulo: 'Sin carne', subtitulo: 'Verduras, legumbres y huevos', vale: (r) => (r.etiquetas ?? []).includes('Vegetariana') },
  { titulo: 'Para el domingo', subtitulo: 'Con más calma', vale: (r) => (r.etiquetas ?? []).some((e) => e === 'Domingo' || e === 'Fiesta' || e === 'Horno') },
];

/**
 * Filas de ideas para Inicio: con lo que hay en casa, de temporada, rápidas y un tema del día.
 * Cada receta sale una sola vez (y nunca la del día). `tiene` dice si un ingrediente está en casa.
 */
export function filasDeIdeas(recetas, fecha, tiene, { excluir = [], porFila = 10 } = {}) {
  const usadas = new Set(excluir.filter(Boolean));
  const semilla = semillaDe(fecha);
  const base = barajar(recetas.filter((r) => esPrincipal(r) && !fueraDeTemporada(r, fecha)), semilla);
  const coger = (lista) => {
    const fila = [];
    for (const r of lista) {
      if (fila.length >= porFila) break;
      if (usadas.has(r.id)) continue;
      usadas.add(r.id); fila.push(r);
    }
    return fila;
  };
  const filas = [];

  // Con lo que hay en casa: las que tienen más ingredientes ya en la despensa (al menos la mitad).
  const puntuadas = base.map((r) => ({ r, c: cobertura(r, tiene) }))
    .filter(({ c }) => c.total >= 2 && c.tengo / c.total >= 0.5)
    .sort((a, b) => (b.c.tengo / b.c.total) - (a.c.tengo / a.c.total) || b.c.tengo - a.c.tengo);
  const enCasaFila = coger(puntuadas.map(({ r }) => r));
  if (enCasaFila.length >= 3) filas.push({ id: 'casa', titulo: 'Con lo que tenéis en casa', subtitulo: 'Os falta poco o nada', recetas: enCasaFila, cobertura: true });

  const t = temporada(fecha);
  filas.push({ id: 'temporada', titulo: t.titulo, subtitulo: t.subtitulo, recetas: coger(base.filter(t.vale)) });
  filas.push({ id: 'rapidas', titulo: 'En media hora', subtitulo: 'Para cuando no hay tiempo', recetas: coger(base.filter((r) => r.tiempo_min && r.tiempo_min <= 30)) });
  const tema = TEMAS[semilla % TEMAS.length];
  filas.push({ id: 'tema', titulo: tema.titulo, subtitulo: tema.subtitulo, recetas: coger(base.filter(tema.vale)) });
  return filas.filter((f) => f.recetas.length >= 3);
}
