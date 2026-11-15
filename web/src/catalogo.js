// Catálogo de productos de los súper (común a todas las casas) y búsqueda en sus webs.
// La búsqueda la hace la función "precios" de Supabase: la app nunca habla con los súper directamente.

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

export function crearCatalogo(cliente) {
  const productos = new Map();     // id -> producto con su último precio
  const busquedas = new Map();     // "super|texto" -> [ids] (lo buscado en esta sesión)

  const guardar = (lista) => {
    for (const p of lista) if (p?.id) productos.set(p.id, normalizarProducto(p));
  };

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

    /**
     * Busca en las webs de los súper.
     * @param {{texto:string, supers:string[]}[]} consultas
     * @returns resultados: [{texto, mercadona:[producto]|{error}, hiperdino:[...]}]
     */
    async buscar(consultas) {
      const { data, error } = await cliente.functions.invoke('precios', { body: { accion: 'buscar', consultas } });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context?.json())?.error ?? msg; } catch { /* nada */ }
        throw new Error(msg);
      }
      for (const r of data.resultados ?? []) {
        for (const [s, lista] of Object.entries(r)) {
          if (!Array.isArray(lista)) continue;
          guardar(lista);
          busquedas.set(`${s}|${r.texto.toLowerCase()}`, lista.map((p) => p.id));
        }
      }
      return data.resultados ?? [];
    },

    buscado(supermercado, texto) {
      const ids = busquedas.get(`${supermercado}|${texto.toLowerCase()}`);
      return ids ? ids.map((id) => productos.get(id)).filter(Boolean) : null;
    },
  };
}
