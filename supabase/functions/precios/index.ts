// Función "precios" (Supabase Edge Function).
// Es la única parte que habla con las webs de los súper; la app nunca lo hace directamente.
//
//   accion "buscar":     la app (con sesión) busca productos, p. ej. "leche entera".
//                        Devuelve lo que vende cada súper con su precio y lo guarda en el catálogo.
//   accion "actualizar": la tarea programada (pg_cron, una vez al día) refresca el precio de los
//                        productos que alguna casa tiene enlazados y cuyo precio tiene más de 6 días.
//                        Así cada producto se consulta como mucho una vez por semana.
//
// Cada súper va en su propio bloque (Mercadona / HiperDino): si cambia su web, se arregla ese bloque.
// Precios de Gran Canaria: Mercadona almacén 4701 (código postal 35001); HiperDino tienda c9504.

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  Rechazo, type Producto, porUnidad, buscarMercadona, buscarHiperDino, fichaMercadona, fichaHiperDino,
} from './lectores.ts';

const DIAS_PARA_REFRESCAR = 6;
const MAX_POR_ACTUALIZACION = 40;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Catálogo en la base de datos
// ---------------------------------------------------------------------------
/** Guarda los productos y su precio de hoy (solo si cambió o el último tiene más de 20 h). */
async function guardar(productos: Producto[]) {
  if (!productos.length) return [];
  const unicos = [...new Map(productos.map((p) => [`${p.supermercado_id}|${p.id_externo}`, p])).values()];
  const ahora = new Date().toISOString();
  const { data: filas, error } = await db.from('productos_super')
    .upsert(unicos.map(({ precio: _p, precio_anterior: _a, ...p }) => ({ ...p, activo: true, actualizado_en: ahora })),
      { onConflict: 'supermercado_id,id_externo' })
    .select('id, supermercado_id, id_externo');
  if (error) throw error;
  const idDe = new Map(filas!.map((f) => [`${f.supermercado_id}|${f.id_externo}`, f.id]));
  const ids = [...idDe.values()];
  const { data: ultimos, error: e2 } = await db.from('precio_actual').select('producto_id, precio, visto_en').in('producto_id', ids);
  if (e2) throw e2;
  const ultimo = new Map(ultimos!.map((u) => [u.producto_id, u]));
  const nuevos = [];
  for (const p of unicos) {
    const id = idDe.get(`${p.supermercado_id}|${p.id_externo}`);
    const u = ultimo.get(id);
    const viejo = !u || Date.now() - new Date(u.visto_en).getTime() > 20 * 3600_000;
    if (viejo || Number(u.precio) !== p.precio) {
      nuevos.push({ producto_id: id, precio: p.precio, precio_anterior: p.precio_anterior,
        precio_por_unidad: porUnidad(p.precio, p.cantidad, p.unidad), origen: 'web', visto_en: ahora });
    }
  }
  if (nuevos.length) {
    const { error: e3 } = await db.from('precios').insert(nuevos);
    if (e3) throw e3;
  }
  return unicos.map((p) => ({
    ...p,
    id: idDe.get(`${p.supermercado_id}|${p.id_externo}`),
    precio_por_unidad: porUnidad(p.precio, p.cantidad, p.unidad),
    visto_en: ahora,
  }));
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------
const BUSCADORES = { mercadona: buscarMercadona, hiperdino: buscarHiperDino };

async function buscar(consultas: { texto: string; supers?: string[] }[]) {
  const resultados = [];
  let parado: string | null = null;
  for (const c of consultas.slice(0, 25)) {
    const texto = String(c.texto ?? '').trim().slice(0, 80);
    const fila: Record<string, unknown> = { texto };
    if (!texto) { resultados.push(fila); continue; }
    for (const s of (c.supers ?? Object.keys(BUSCADORES)) as (keyof typeof BUSCADORES)[]) {
      if (!BUSCADORES[s]) continue;
      if (parado) { fila[s] = { error: parado }; continue; }
      try {
        fila[s] = await guardar(await BUSCADORES[s](texto));
      } catch (e) {
        if (e instanceof Rechazo) parado = `${e.message}: paro para no insistir`;
        fila[s] = { error: e instanceof Error ? e.message : String(e) };
      }
    }
    resultados.push(fila);
  }
  return { resultados };
}

async function actualizar() {
  // Productos enlazados por alguna casa, con el precio más viejo primero.
  const { data: enlazados, error } = await db.from('equivalencias').select('producto_id');
  if (error) throw error;
  const ids = [...new Set(enlazados!.map((e) => e.producto_id))];
  if (!ids.length) return { revisados: 0 };
  const { data: prods, error: e2 } = await db.from('productos_super')
    .select('id, supermercado_id, id_externo, nombre, url, imagen_url').in('id', ids).eq('activo', true);
  if (e2) throw e2;
  const { data: precios } = await db.from('precio_actual').select('producto_id, visto_en').in('producto_id', ids);
  const visto = new Map((precios ?? []).map((p) => [p.producto_id, new Date(p.visto_en).getTime()]));
  const limite = Date.now() - DIAS_PARA_REFRESCAR * 86_400_000;
  const toca = prods!
    .filter((p) => (visto.get(p.id) ?? 0) < limite)
    .sort((a, b) => (visto.get(a.id) ?? 0) - (visto.get(b.id) ?? 0))
    .slice(0, MAX_POR_ACTUALIZACION);

  const resumen = { revisados: 0, desaparecidos: 0, errores: [] as string[] };
  const listos: Producto[] = [];
  for (const p of toca) {
    try {
      const r = p.supermercado_id === 'mercadona'
        ? await fichaMercadona(p.id_externo)
        : p.supermercado_id === 'hiperdino' ? await fichaHiperDino(p.id_externo, p.url, p) : null;
      if (r === 'no_existe') {
        await db.from('productos_super').update({ activo: false }).eq('id', p.id);
        resumen.desaparecidos++;
      } else if (r) {
        listos.push(r);
        resumen.revisados++;
      }
    } catch (e) {
      resumen.errores.push(`${p.nombre}: ${e instanceof Error ? e.message : e}`);
      if (e instanceof Rechazo) break;
    }
  }
  await guardar(listos);
  return { ...resumen, pendientes: Math.max(0, prods!.filter((p) => (visto.get(p.id) ?? 0) < limite).length - toca.length) };
}

const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const cuerpo = await req.json().catch(() => ({}));
    // La tarea programada se identifica con su clave; la app, con la sesión de la persona.
    const { data: fila } = await db.from('ajustes_servidor').select('valor').eq('clave', 'cron_clave').maybeSingle();
    const esTarea = !!fila?.valor && req.headers.get('x-clave') === fila.valor;
    if (cuerpo.accion === 'actualizar') {
      if (!esTarea) return responder({ error: 'No autorizado' }, 401);
      return responder(await actualizar());
    }
    if (cuerpo.accion === 'buscar') {
      if (!esTarea) {
        const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
        const { data, error } = await db.auth.getUser(token);
        if (error || !data.user) return responder({ error: 'Hace falta iniciar sesión' }, 401);
      }
      return responder(await buscar(Array.isArray(cuerpo.consultas) ? cuerpo.consultas : []));
    }
    return responder({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    console.error(e);
    return responder({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
