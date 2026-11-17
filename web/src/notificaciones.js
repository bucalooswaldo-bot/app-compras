// Avisos en el móvil (notificaciones). Cada móvil se apunta una vez; luego, cada mañana,
// la función "avisos" de Supabase manda el aviso aunque la app esté cerrada.
import * as config from '../config.js';

const deBase64 = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export const puedeAvisar = () => typeof window !== 'undefined' && 'Notification' in window
  && 'serviceWorker' in navigator && 'PushManager' in window;

async function registro() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error('Abre la app desde la pantalla de inicio del móvil para poder recibir avisos.');
  return reg;
}

/** { soportado, permiso, activos, hora } */
export async function estadoAvisos(sesion) {
  if (!puedeAvisar()) return { soportado: false };
  const permiso = Notification.permission;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  let hora = 9;
  if (sub && sesion) {
    const { data } = await sesion.cliente.from('avisos_moviles').select('hora').eq('endpoint', sub.endpoint).maybeSingle();
    if (!data) return { soportado: true, permiso, activos: false, hora };
    hora = data.hora;
  }
  // En modo prueba no hay servidor: basta con el permiso (para ver el aviso de prueba).
  return { soportado: true, permiso, activos: permiso === 'granted' && (!!sub || !sesion), hora };
}

export async function activarAvisos(sesion, hora = 9) {
  if (!puedeAvisar()) throw new Error('Este navegador no permite avisos.');
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('Sin permiso para avisar. Se puede dar en los ajustes del móvil → Aplicaciones → Chrome → Notificaciones.');
  const reg = await registro();
  if (!sesion) return; // modo prueba: solo el permiso, para el aviso de prueba
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deBase64(config.VAPID_PUBLICA) });
  const j = sub.toJSON();
  const { error } = await sesion.cliente.from('avisos_moviles').upsert({
    hogar_id: sesion.hogarId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, hora,
  }, { onConflict: 'endpoint' });
  if (error) throw error;
}

export async function cambiarHora(sesion, hora) {
  const reg = await registro();
  const sub = await reg.pushManager.getSubscription();
  if (!sub || !sesion) return;
  const { error } = await sesion.cliente.from('avisos_moviles').update({ hora }).eq('endpoint', sub.endpoint);
  if (error) throw error;
}

export async function desactivarAvisos(sesion) {
  const reg = await registro();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  if (sesion) await sesion.cliente.from('avisos_moviles').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/**
 * Aviso de prueba ahora mismo en este móvil. Con cuenta, lo manda el servidor (como el aviso de cada día),
 * así se comprueba que llega; en modo prueba, lo enseña el propio móvil.
 */
export async function avisoDePrueba(titulo, cuerpo, sesion) {
  const reg = await registro();
  const sub = sesion && await reg.pushManager.getSubscription();
  if (sub) {
    const { data, error } = await sesion.cliente.functions.invoke('avisos', { body: { accion: 'probar', endpoint: sub.endpoint } });
    if (error || data?.error) throw new Error(data?.error ?? error.message);
    if (data.resultado !== 'enviado') throw new Error('El aviso no ha llegado al móvil. Prueba a quitar los avisos y activarlos otra vez.');
    return;
  }
  await reg.showNotification(titulo, { body: cuerpo, icon: 'icono-192.png', badge: 'icono-192.png', tag: 'prueba', data: { pestana: 'inicio' } });
}
