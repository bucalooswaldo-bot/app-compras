// Datos de la app. Guarda una copia en memoria (para que las pantallas respondan al momento)
// y manda cada cambio a uno de estos dos sitios:
//   - "prueba": el propio móvil (localStorage). Sin cuentas ni conexión.
//   - "supabase": la base de datos compartida de la casa.

export const TABLAS = {
  articulos: 'articulos',
  despensa: 'despensa',
  recetas: 'recetas',
  ingredientes: 'receta_ingredientes',
  plan: 'plan_comidas',
  lista: 'lista_compra',
  equivalencias: 'equivalencias',
  preferencias: 'preferencias',
  tiques: 'tiques',
  tique_lineas: 'tique_lineas',
};

export const nuevoId = () =>
  (globalThis.crypto?.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }));

const vacio = () => Object.fromEntries(Object.keys(TABLAS).map((k) => [k, []]));

class Almacen {
  constructor(motor) {
    this.motor = motor;
    this.datos = vacio();
    this.oyentes = new Set();
    this.cargado = false;
  }

  escuchar(fn) {
    this.oyentes.add(fn);
    return () => this.oyentes.delete(fn);
  }

  avisar() {
    this.datos = { ...this.datos };
    for (const fn of this.oyentes) fn(this.datos);
  }

  async cargar() {
    this.datos = await this.motor.cargar();
    this.cargado = true;
    this.avisar();
  }

  /** Ejecuta un cambio en memoria y luego en el motor; si falla, recarga y avisa. */
  async cambio(local, remoto) {
    local(this.datos);
    this.avisar();
    try {
      await remoto();
    } catch (e) {
      console.error(e);
      this.onError?.(e);
      await this.cargar().catch(() => {});
    }
  }

  insertar(clave, filas) {
    filas = (Array.isArray(filas) ? filas : [filas]).map((f) => ({ id: nuevoId(), ...f }));
    return this.cambio(
      (d) => { d[clave] = [...d[clave], ...filas]; },
      () => this.motor.insertar(TABLAS[clave], filas),
    ).then(() => filas);
  }

  actualizar(clave, id, cambios) {
    return this.cambio(
      (d) => { d[clave] = d[clave].map((f) => (f.id === id ? { ...f, ...cambios } : f)); },
      () => this.motor.actualizar(TABLAS[clave], id, cambios),
    );
  }

  borrar(clave, ids) {
    ids = Array.isArray(ids) ? ids : [ids];
    if (!ids.length) return Promise.resolve();
    const s = new Set(ids);
    return this.cambio(
      (d) => { d[clave] = d[clave].filter((f) => !s.has(f.id)); },
      () => this.motor.borrar(TABLAS[clave], ids),
    );
  }

  /** Suma (o resta) a lo que hay en casa, sin bajar de cero. */
  sumarDespensa(articulo_id, delta) {
    return this.cambio(
      (d) => {
        const fila = d.despensa.find((x) => x.articulo_id === articulo_id);
        if (fila) {
          d.despensa = d.despensa.map((x) =>
            x === fila ? { ...x, cantidad: Math.max(0, Math.round((x.cantidad + delta) * 1000) / 1000) } : x);
        } else {
          d.despensa = [...d.despensa, { id: nuevoId(), articulo_id, cantidad: Math.max(0, delta), minimo: 0 }];
        }
      },
      () => this.motor.sumarDespensa(articulo_id, delta, this.datos),
    );
  }

  /** Crea o cambia la fila de despensa de un artículo. */
  async fijarDespensa(articulo_id, cambios) {
    const fila = this.datos.despensa.find((x) => x.articulo_id === articulo_id);
    if (fila) return this.actualizar('despensa', fila.id, cambios);
    return this.insertar('despensa', { articulo_id, cantidad: 0, minimo: 0, ...cambios });
  }
}

// ---------------------------------------------------------------------------
// Motor de prueba: todo en este móvil
// ---------------------------------------------------------------------------
const CLAVE = 'app-compras-prueba-v1';

function leerLocal() {
  try {
    const s = localStorage.getItem(CLAVE);
    return s ? { ...vacio(), ...JSON.parse(s) } : vacio();
  } catch {
    return vacio();
  }
}

export function motorPrueba() {
  let copia = leerLocal();
  const guardar = () => {
    try { localStorage.setItem(CLAVE, JSON.stringify(copia)); } catch { /* sin almacenamiento: solo en memoria */ }
  };
  const clave = (tabla) => Object.keys(TABLAS).find((k) => TABLAS[k] === tabla);
  return {
    modo: 'prueba',
    async cargar() { return structuredClone(copia); },
    async insertar(tabla, filas) { copia[clave(tabla)].push(...structuredClone(filas)); guardar(); },
    async actualizar(tabla, id, cambios) {
      const k = clave(tabla);
      copia[k] = copia[k].map((f) => (f.id === id ? { ...f, ...cambios } : f));
      guardar();
    },
    async borrar(tabla, ids) {
      const k = clave(tabla), s = new Set(ids);
      copia[k] = copia[k].filter((f) => !s.has(f.id));
      // Borrados en cascada como en la base de datos
      if (k === 'recetas') {
        copia.ingredientes = copia.ingredientes.filter((i) => !s.has(i.receta_id));
        copia.plan = copia.plan.filter((p) => !s.has(p.receta_id));
      }
      if (k === 'tiques') copia.tique_lineas = copia.tique_lineas.filter((l) => !s.has(l.tique_id));
      if (k === 'articulos') {
        for (const t of ['despensa', 'ingredientes', 'lista', 'equivalencias', 'preferencias']) {
          copia[t] = copia[t].filter((f) => !s.has(f.articulo_id));
        }
      }
      guardar();
    },
    async sumarDespensa(articulo_id, _delta, datos) {
      copia.despensa = structuredClone(datos.despensa);
      guardar();
    },
    borrarTodo() { copia = vacio(); guardar(); },
  };
}

// ---------------------------------------------------------------------------
// Motor Supabase: la casa compartida
// ---------------------------------------------------------------------------
export function motorSupabase(cliente, hogarId) {
  const comprobar = ({ error }) => { if (error) throw error; };
  const conHogar = (filas) => filas.map((f) => ({ ...f, hogar_id: hogarId }));
  const sinHogar = (filas) => filas.map(({ hogar_id, ...f }) => f);

  return {
    modo: 'supabase',
    async cargar() {
      const claves = Object.keys(TABLAS);
      const res = await Promise.all(claves.map((k) => cliente.from(TABLAS[k]).select('*').eq('hogar_id', hogarId)));
      const datos = {};
      res.forEach((r, i) => { comprobar(r); datos[claves[i]] = sinHogar(r.data); });
      for (const d of datos.despensa) { d.cantidad = Number(d.cantidad); d.minimo = Number(d.minimo); }
      for (const t of ['ingredientes', 'lista']) {
        for (const f of datos[t]) if (f.cantidad != null) f.cantidad = Number(f.cantidad);
      }
      for (const p of datos.plan) p.raciones = Number(p.raciones);
      for (const t of datos.tiques) if (t.total != null) t.total = Number(t.total);
      for (const l of datos.tique_lineas) {
        for (const c of ['cantidad', 'precio_unidad', 'importe', 'descuento']) if (l[c] != null) l[c] = Number(l[c]);
      }
      return datos;
    },
    async insertar(tabla, filas) {
      // Por tandas, para que cargar muchas recetas de golpe no choque con límites
      for (let i = 0; i < filas.length; i += 200) {
        comprobar(await cliente.from(tabla).insert(conHogar(filas.slice(i, i + 200))));
      }
    },
    async actualizar(tabla, id, cambios) {
      comprobar(await cliente.from(tabla).update(cambios).eq('id', id));
    },
    async borrar(tabla, ids) {
      comprobar(await cliente.from(tabla).delete().in('id', ids));
    },
    async sumarDespensa(articulo_id, delta) {
      comprobar(await cliente.rpc('sumar_despensa', { p_articulo: articulo_id, p_delta: delta }));
    },
    /** Avisa cuando el otro móvil cambia algo. */
    escucharCambios(fn) {
      let espera;
      const canal = cliente.channel(`casa-${hogarId}`);
      for (const tabla of Object.values(TABLAS)) {
        canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla, filter: `hogar_id=eq.${hogarId}` },
          () => { clearTimeout(espera); espera = setTimeout(fn, 600); });
      }
      canal.subscribe();
      return () => cliente.removeChannel(canal);
    },
  };
}

export function crearAlmacen(motor) {
  return new Almacen(motor);
}
