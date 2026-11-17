// Función "avisos" (Supabase Edge Function): manda el aviso diario a los móviles.
//
//   accion "enviar": la tarea programada (cada hora) manda el aviso a los móviles cuya hora elegida
//                    es la hora de ahora en Canarias, si hay algo que contar y no es lo mismo que el último.
//   accion "probar": la app (con sesión) pide un aviso ahora mismo para su propio móvil.
//
// logica.js y avisos.js son copias de web/src (las mismas cuentas que la pantalla de Inicio).
// Un test comprueba que siguen iguales: si cambian allí, hay que copiarlas aquí y volver a desplegar.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { avisosDeCasa, textoAviso } from './avisos.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const ZONA = 'Atlantic/Canary';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
webpush.setVapidDetails('https://bucalooswaldo-bot.github.io/app-compras/',
  Deno.env.get('VAPID_PUBLICA')!, Deno.env.get('VAPID_PRIVADA')!);

/** Fecha (AAAA-MM-DD) y hora de ahora en Canarias. */
function ahoraEnCanarias() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { hoy: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) };
}

const TABLAS = {
  articulos: 'articulos', despensa: 'despensa', recetas: 'recetas', ingredientes: 'receta_ingredientes',
  plan: 'plan_comidas', lista: 'lista_compra',
};

/** Los datos de una casa, con la misma forma que en la app. */
async function datosDeCasa(hogarId: string) {
  const claves = Object.keys(TABLAS) as (keyof typeof TABLAS)[];
  const res = await Promise.all(claves.map((k) => db.from(TABLAS[k]).select('*').eq('hogar_id', hogarId)));
  // deno-lint-ignore no-explicit-any
  const d: Record<string, any[]> = {};
  res.forEach((r, i) => { if (r.error) throw r.error; d[claves[i]] = r.data ?? []; });
  for (const x of d.despensa) { x.cantidad = Number(x.cantidad); x.minimo = Number(x.minimo); }
  for (const t of ['ingredientes', 'lista']) for (const x of d[t]) if (x.cantidad != null) x.cantidad = Number(x.cantidad);
  for (const p of d.plan) p.raciones = Number(p.raciones);
  return d;
}

// deno-lint-ignore no-explicit-any
async function mandar(sub: any, aviso: { titulo: string; cuerpo: string }) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ ...aviso, pestana: 'inicio' }), { TTL: 6 * 3600 });
    return 'enviado';
  } catch (e) {
    // deno-lint-ignore no-explicit-any
    const estado = (e as any)?.statusCode;
    if (estado === 404 || estado === 410) { // el móvil ya no quiere avisos (o se desinstaló la app)
      await db.from('avisos_moviles').delete().eq('id', sub.id);
      return 'borrado';
    }
    console.error('push', estado, (e as Error).message);
    return 'error';
  }
}

async function enviar() {
  const { hoy, hora } = ahoraEnCanarias();
  const { data: subs, error } = await db.from('avisos_moviles').select('*').eq('hora', hora);
  if (error) throw error;
  const resumen = { hora, moviles: subs!.length, enviados: 0, sinNovedad: 0, errores: 0 };
  const porCasa = new Map<string, ReturnType<typeof textoAviso>>();
  for (const s of subs!) {
    if (s.ultimo_envio === hoy) continue;
    if (!porCasa.has(s.hogar_id)) porCasa.set(s.hogar_id, textoAviso(avisosDeCasa(await datosDeCasa(s.hogar_id), hoy, 2), hoy));
    const aviso = porCasa.get(s.hogar_id);
    const texto = aviso ? `${aviso.titulo}\n${aviso.cuerpo}` : null;
    if (!aviso || texto === s.ultimo_texto) { resumen.sinNovedad++; continue; }
    const r = await mandar(s, aviso);
    if (r === 'enviado') {
      resumen.enviados++;
      await db.from('avisos_moviles').update({ ultimo_envio: hoy, ultimo_texto: texto }).eq('id', s.id);
    } else if (r === 'error') resumen.errores++;
  }
  return resumen;
}

const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const cuerpo = await req.json().catch(() => ({}));
    if (cuerpo.accion === 'enviar') {
      const { data: fila } = await db.from('ajustes_servidor').select('valor').eq('clave', 'cron_clave').maybeSingle();
      if (!fila?.valor || req.headers.get('x-clave') !== fila.valor) return responder({ error: 'No autorizado' }, 401);
      return responder(await enviar());
    }
    if (cuerpo.accion === 'probar') {
      const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user) return responder({ error: 'Hace falta iniciar sesión' }, 401);
      const { data: sub } = await db.from('avisos_moviles').select('*').eq('endpoint', String(cuerpo.endpoint ?? '')).maybeSingle();
      const { data: miembro } = sub
        ? await db.from('hogar_miembros').select('user_id').eq('hogar_id', sub.hogar_id).eq('user_id', data.user.id).maybeSingle()
        : { data: null };
      if (!sub || !miembro) return responder({ error: 'Este móvil no tiene los avisos activados' }, 404);
      const { hoy } = ahoraEnCanarias();
      const aviso = textoAviso(avisosDeCasa(await datosDeCasa(sub.hogar_id), hoy, 2), hoy)
        ?? { titulo: 'Todo en orden', cuerpo: 'No se acaba nada y tenéis todo para el menú de hoy y mañana.' };
      return responder({ resultado: await mandar(sub, aviso), aviso });
    }
    return responder({ error: 'Acción desconocida' }, 400);
  } catch (e) {
    console.error(e);
    return responder({ error: (e as Error).message }, 500);
  }
});
