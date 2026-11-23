// Recetario de la app: recetas escritas para la app (recetario/tanda-*.json -> web/recetario.json), iguales para
// todas las casas y separadas de las recetas de cada casa.
// Una receta del recetario solo se copia a la casa (recetas.origen = 'app', recetas.catalogo_id) cuando se usa:
// al guardarla, ponerla en el plan o cocinarla. Así la lista de la compra, la despensa y el plan funcionan igual
// que con las recetas propias, y en «Mis recetas» no aparecen.
import { normalizar } from './logica.js';
import { emparejarIngrediente, adivinarCategoria } from './ingredientes.js';

let promesa = null;
/** Carga el recetario una vez (se guarda en el móvil con el resto de la app). */
export function cargarRecetario() {
  promesa ??= fetch(new URL('../recetario.json', import.meta.url))
    .then((r) => { if (!r.ok) throw new Error(`recetario ${r.status}`); return r.json(); })
    .then((d) => d.recetas)
    .catch((e) => { promesa = null; throw e; });
  return promesa;
}

/** Los mismos alimentos con otro nombre (en Canarias "papas" y "millo"). */
const OTROS_NOMBRES = {
  patata: ['papa', 'papas'], patatas: ['papas', 'papa'], 'patatas nuevas': ['papas nuevas', 'papas'],
  maiz: ['millo'], 'maiz dulce': ['millo dulce', 'millo'], judias: ['habichuelas'], 'judias verdes': ['habichuelas', 'judias verdes'],
  alubias: ['judias blancas', 'habichuelas blancas'],
};

/** El artículo de la casa que es ese ingrediente (por nombre, plural, o su otro nombre). */
export function articuloDeIngrediente(articulos, nombre) {
  const a = emparejarIngrediente(articulos, nombre);
  if (a) return a;
  for (const otro of OTROS_NOMBRES[normalizar(nombre)] ?? []) {
    const b = emparejarIngrediente(articulos, otro);
    if (b) return b;
  }
  return null;
}

/** Texto de la preparación tal como la guarda la app (un paso por línea y el truco al final). */
export const pasosDeTexto = (r) => [...r.pasos, ...(r.truco ? [`Truco: ${r.truco}`] : [])].join('\n');

export const recetaGuardada = (datos, catalogoId) => datos.recetas.find((r) => r.catalogo_id === catalogoId) ?? null;

/** Lo que es «Mis recetas» (lo que ha hecho o traído la casa), sin las copiadas del recetario. */
export const esDeLaCasa = (r) => r.origen !== 'app';

/**
 * Qué hay que guardar en la casa para usar una receta del recetario: los artículos que faltan y las filas de la receta.
 * Si la casa tiene el artículo en otra unidad (p. ej. «Ajo» en gramos y la receta lo pide en unidades),
 * no se inventa la conversión: la cantidad va como nota y no suma en la lista.
 */
export function prepararGuardado(articulos, receta, id = crypto.randomUUID()) {
  const nuevos = [];
  const todos = [...articulos];
  const ingredientes = receta.ingredientes.map(([nombre, cantidad, unidad], orden) => {
    let a = articuloDeIngrediente(todos, nombre);
    if (!a) {
      a = { id: crypto.randomUUID(), nombre, unidad, categoria: adivinarCategoria(nombre) };
      nuevos.push(a); todos.push(a);
    }
    const misma = a.unidad === unidad;
    return {
      receta_id: id, articulo_id: a.id, orden,
      cantidad: misma ? cantidad : null,
      nota: !misma && cantidad != null ? `${cantidad} ${unidad === 'ud' ? (cantidad === 1 ? 'unidad' : 'unidades') : unidad}` : null,
    };
  });
  const fila = {
    id, nombre: receta.nombre, raciones: receta.raciones, tiempo_min: receta.tiempo_min ?? null,
    pasos: pasosDeTexto(receta), etiquetas: receta.etiquetas ?? [], favorita: false, origen: 'app', catalogo_id: receta.id,
  };
  return { articulos: nuevos, receta: fila, ingredientes };
}

/** Copia la receta del recetario a la casa (si no estaba ya) y devuelve la receta de la casa. */
export async function guardarDelRecetario(almacen, receta, cambios = {}) {
  const ya = recetaGuardada(almacen.datos, receta.id);
  if (ya) {
    if (Object.keys(cambios).length) await almacen.actualizar('recetas', ya.id, cambios);
    return ya;
  }
  const g = prepararGuardado(almacen.datos.articulos, receta);
  if (g.articulos.length) await almacen.insertar('articulos', g.articulos);
  const fila = { ...g.receta, ...cambios };
  await almacen.insertar('recetas', fila);
  await almacen.insertar('ingredientes', g.ingredientes);
  return fila;
}

/** Busca en el recetario por nombre, ingrediente o etiqueta; los que empiezan por lo buscado, primero. */
export function buscarEnRecetario(recetas, texto, tipo = null) {
  const q = normalizar(texto ?? '').trim();
  const puntos = (r) => {
    if (!q) return 1;
    const n = normalizar(r.nombre);
    if (n.startsWith(q)) return 4;
    if (n.includes(q)) return 3;
    if ((r.etiquetas ?? []).some((e) => normalizar(e).includes(q))) return 2;
    if (r.ingredientes.some(([i]) => normalizar(i).includes(q))) return 1;
    return 0;
  };
  return recetas
    .filter((r) => !tipo || r.tipo === tipo)
    .map((r) => [r, puntos(r)]).filter(([, p]) => p > 0)
    .sort((a, b) => (b[1] - a[1]) || a[0].nombre.localeCompare(b[0].nombre, 'es'))
    .map(([r]) => r);
}

/** Los tipos del recetario en el orden en que suele mirarse (cuchara, arroces, pasta…). */
export function tiposDe(recetas) {
  const cuenta = new Map();
  for (const r of recetas) cuenta.set(r.tipo, (cuenta.get(r.tipo) ?? 0) + 1);
  return [...cuenta].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).map(([t, n]) => ({ tipo: t, n }));
}
