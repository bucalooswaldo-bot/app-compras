// Productos de los súper que la casa ha comprado, con lo que pagó por ellos.
// Todo sale de los tiques: la app no lee las webs de los supermercados.

import { normalizar } from './logica.js';

const num = (x) => (x == null ? null : Number(x));

function normalizarProducto(p) {
  return {
    ...p,
    cantidad: num(p.cantidad),
    precio: num(p.precio),
    precio_anterior: num(p.precio_anterior),
    precio_por_unidad: num(p.precio_por_unidad),
  };
}

/** Palabras de búsqueda: sin tildes, de más de dos letras, recortadas para que "tomates" encuentre "tomate". */
const trozos = (texto) => normalizar(texto).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2).map((w) => w.slice(0, 5));

/**
 * Productos que encajan con `texto` entre los de `lista`: primero los que llevan todas las palabras,
 * luego los que llevan alguna. Solo con precio.
 */
export function buscarEn(lista, texto, max = 12) {
  const ws = trozos(texto);
  if (!ws.length) return [];
  const puntos = (p) => {
    const n = normalizar(p.nombre);
    return ws.filter((w) => n.includes(w)).length;
  };
  return lista
    .filter((p) => Number.isFinite(p.precio))
    .map((p) => ({ p, n: puntos(p) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.p.precio - b.p.precio)
    .slice(0, max)
    .map((x) => x.p);
}

export function crearCatalogo(cliente) {
  const productos = new Map();     // id -> producto con su último precio
  const busquedas = new Map();     // "super|texto" -> [ids] (lo buscado en esta sesión)

  const guardar = (lista) => {
    for (const p of lista) if (p?.id) productos.set(p.id, normalizarProducto(p));
  };
  const deSuper = (s) => [...productos.values()].filter((p) => p.supermercado_id === s);

  return {
    productos,
    busquedas,

    /** Trae del servidor los productos que falten (los enlazados con la casa). */
    async cargar(ids) {
      const faltan = [...new Set(ids)].filter((id) => id && !productos.has(id));
      for (let i = 0; i < faltan.length; i += 80) {
        const trozo = faltan.slice(i, i + 80);
        const [prods, precios] = await Promise.all([
          cliente.from('productos_super').select('*').in('id', trozo),
          cliente.from('precio_actual').select('*').in('producto_id', trozo),
        ]);
        if (prods.error) throw prods.error;
        if (precios.error) throw precios.error;
        const precio = new Map(precios.data.map((x) => [x.producto_id, x]));
        guardar(prods.data.map((p) => {
          const x = precio.get(p.id) ?? {};
          return { ...p, precio: x.precio, precio_anterior: x.precio_anterior,
            precio_por_unidad: x.precio_por_unidad, visto_en: x.visto_en ?? null };
        }));
      }
    },

    /** Productos que han salido en los tiques de la casa (sus precios cambian con cada tique). */
    async cargarDeTiques() {
      const { data, error } = await cliente.from('productos_super').select('id');
      if (error) throw error;
      const ids = data.map((x) => x.id);
      for (const id of ids) productos.delete(id);
      await this.cargar(ids);
    },

    /**
     * Busca entre lo comprado en cada súper (nada de internet).
     * @param {{texto:string, supers:string[]}[]} consultas
     * @returns resultados: [{texto, <super>: [producto]}]
     */
    async buscar(consultas) {
      return consultas.map(({ texto, supers }) => {
        const r = { texto };
        for (const s of supers) {
          r[s] = buscarEn(deSuper(s), texto);
          busquedas.set(`${s}|${texto.toLowerCase()}`, r[s].map((p) => p.id));
        }
        return r;
      });
    },

    /** Precios anteriores de esos productos desde `desde` (para saber si hoy están más baratos de lo normal). */
    async historial(ids, desde) {
      const salida = new Map();
      const unicos = [...new Set(ids)].filter(Boolean);
      for (let i = 0; i < unicos.length; i += 80) {
        const { data, error } = await cliente.from('precios').select('producto_id, precio, visto_en')
          .in('producto_id', unicos.slice(i, i + 80)).gte('visto_en', desde).order('visto_en');
        if (error) throw error;
        for (const x of data) {
          if (!salida.has(x.producto_id)) salida.set(x.producto_id, []);
          salida.get(x.producto_id).push({ precio: Number(x.precio), visto_en: x.visto_en });
        }
      }
      return salida;
    },

    /** Productos de ese súper, de los tiques, cuyo nombre lleva las palabras de `texto`. */
    deTiques(supermercado, texto) {
      return buscarEn(deSuper(supermercado), texto, 30);
    },

    buscado(supermercado, texto) {
      const ids = busquedas.get(`${supermercado}|${texto.toLowerCase()}`);
      return ids ? ids.map((id) => productos.get(id)).filter(Boolean) : null;
    },
  };
}
