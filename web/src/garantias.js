// Otros gastos de casa (lo que no es del súper) y garantías. Cálculos sin pantalla ni base de datos.
// Un tique "de otra tienda" es un tique con `tipo` (droguería, farmacia…) y `tienda` escrita a mano.
// Los tiques sin `tipo` son los del súper, como siempre.
import { fechaISO, redondear, diasHasta } from './logica.js';
export { diasHasta };
import { inicioPeriodo } from './tiques.js';

/** Tipos de gasto fuera del súper: [clave, nombre, icono]. */
export const TIPOS_GASTO = [
  ['drogueria', 'Droguería y limpieza', '🧴'],
  ['farmacia', 'Farmacia', '💊'],
  ['ropa', 'Ropa y calzado', '👕'],
  ['casa', 'Casa y electrónica', '🔌'],
  ['otros', 'Otros', '🎁'],
];
const NOMBRES = Object.fromEntries(TIPOS_GASTO.map(([k, n]) => [k, n]));
const ICONOS = Object.fromEntries(TIPOS_GASTO.map(([k, , i]) => [k, i]));
export const nombreTipo = (t) => NOMBRES[t] ?? 'Otros';
export const iconoTipo = (t) => ICONOS[t] ?? '🎁';

/** ¿Es un tique de otra tienda (no del súper)? */
export const esOtroGasto = (t) => !!t?.tipo;

/** Años de garantía que se pueden elegir. En España, lo nuevo comprado desde 2022 tiene 3 años. */
export const ANIOS_GARANTIA = [1, 2, 3, 5];

/** Suma años a una fecha AAAA-MM-DD (un 29 de febrero pasa al 28 si el año no es bisiesto). */
export function sumarAnios(iso, n) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const ultimo = new Date(a + n, m, 0).getDate();
  return `${a + n}-${String(m).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

/** Cuánto antes se considera que una garantía "acaba pronto". */
export const DIAS_PRONTO = 60;

/**
 * Garantías ordenadas en tres grupos: las que acaban pronto, las vigentes y las ya caducadas.
 * Cada una lleva `dias` (los que le quedan).
 */
export function agruparGarantias(garantias, hoy = fechaISO()) {
  const con = (garantias ?? []).map((g) => ({ ...g, dias: diasHasta(g.hasta, hoy) }));
  const pronto = con.filter((g) => g.dias >= 0 && g.dias <= DIAS_PRONTO).sort((a, b) => a.dias - b.dias);
  const vigentes = con.filter((g) => g.dias > DIAS_PRONTO).sort((a, b) => a.dias - b.dias);
  const caducadas = con.filter((g) => g.dias < 0).sort((a, b) => b.dias - a.dias);
  return { pronto, vigentes, caducadas };
}

/**
 * Lo gastado fuera del súper en el periodo que empieza en `inicio`, por tipo (de más a menos).
 * @returns {{ total:number, tiques:number, porTipo: Array<[tipo:string, euros:number]> }}
 */
export function otrosGastosDelPeriodo(tiques, periodo, inicio) {
  const porTipo = {};
  let total = 0, n = 0;
  for (const t of tiques) {
    if (!esOtroGasto(t) || inicioPeriodo(t.fecha, periodo) !== inicio) continue;
    const v = Number(t.total ?? 0);
    porTipo[t.tipo] = redondear((porTipo[t.tipo] ?? 0) + v);
    total = redondear(total + v);
    n++;
  }
  return { total, tiques: n, porTipo: Object.entries(porTipo).sort((a, b) => b[1] - a[1]) };
}

const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Tiendas ya usadas (para el desplegable), de la más reciente a la más antigua, sin repetir. */
export function tiendasUsadas(tiques) {
  const vistas = new Map();
  for (const t of [...tiques].filter(esOtroGasto).sort((a, b) => b.fecha.localeCompare(a.fecha))) {
    const k = normal(t.tienda);
    if (k && !vistas.has(k)) vistas.set(k, t.tienda.trim());
  }
  return [...vistas.values()];
}

/** El tipo de gasto que se usó la última vez en esa tienda (para proponerlo), o null. */
export function tipoDeTienda(tiques, tienda) {
  const k = normal(tienda);
  if (!k) return null;
  const ultimo = [...tiques].filter((t) => esOtroGasto(t) && normal(t.tienda) === k)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  return ultimo?.tipo ?? null;
}

/** Busca en el texto del tique el nombre de algunas tiendas conocidas (si no, lo escribe quien lo guarda). */
const TIENDAS = [
  ['mediamarkt', 'MediaMarkt', 'casa'], ['media markt', 'MediaMarkt', 'casa'], ['worten', 'Worten', 'casa'],
  ['leroy merlin', 'Leroy Merlin', 'casa'], ['ikea', 'IKEA', 'casa'], ['bricomart', 'Bricomart', 'casa'],
  ['primark', 'Primark', 'ropa'], ['zara', 'Zara', 'ropa'], ['decathlon', 'Decathlon', 'ropa'],
  ['farmacia', 'Farmacia', 'farmacia'], ['druni', 'Druni', 'drogueria'], ['primor', 'Primor', 'drogueria'],
  ['el corte ingles', 'El Corte Inglés', null], ['amazon', 'Amazon', null],
];
export function tiendaDelTexto(texto) {
  const t = normal(texto);
  const x = TIENDAS.find(([clave]) => t.includes(clave));
  return x ? { tienda: x[1], tipo: x[2] } : null;
}
