// Página que se abre desde el enlace de WhatsApp: solo esa lista, para ir marcando lo que se coge.
// No inicia sesión ni ve nada más de la casa: todo pasa por dos funciones de la base de datos que piden el token.
import * as config from '../config.js';

const raiz = document.getElementById('lista');
const token = location.hash.replace(/^#/, '').trim();
const cliente = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });

let lista = null;
let error = '';
let enCurso = 0;   // cambios enviándose: mientras, no se repinta con datos viejos

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function caducidad(iso) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const dia = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
  return hora === '00:00' ? `hasta el final del ${new Date(d - 1).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}` : `hasta el ${dia} a las ${hora}`;
}

function pintar() {
  if (!lista) {
    raiz.innerHTML = `<div class="aviso"><img src="olla.svg" alt="" width="96" height="80" />
      <h1>Este enlace ya no vale</h1>
      <p class="meta">La lista ha caducado o ya se terminó la compra. Pide que te la vuelvan a mandar.</p></div>`;
    document.title = 'Lista caducada · Menuda';
    return;
  }
  const total = lista.cosas.length;
  const hechas = lista.cosas.filter((c) => c.cogido).length;
  let html = `<header><img src="icono.svg" alt="" /><div><h1>${esc(lista.titulo)}</h1>
    <p class="meta">${hechas} de ${total} cogido · vale ${esc(caducidad(lista.caduca_en))}</p></div></header>
    <div class="progreso" aria-hidden="true"><span style="width:${total ? (100 * hechas) / total : 0}%"></span></div>
    <p class="error" role="status">${esc(error)}</p>`;
  let cat = null;
  for (const c of lista.cosas) {
    if (c.categoria !== cat) {
      if (cat !== null) html += '</ul>';
      cat = c.categoria;
      html += `<h3 class="categoria">${esc(cat)}</h3><ul>`;
    }
    html += `<li class="${c.cogido ? 'cogido' : ''}"><button data-id="${esc(c.id)}" aria-pressed="${c.cogido}">
      <span class="circulo" aria-hidden="true">${c.cogido ? '✓' : ''}</span>
      <span class="que"><span>${esc(c.nombre)}</span>${c.detalle ? `<small>${esc(c.detalle)}</small>` : ''}</span></button></li>`;
  }
  if (cat !== null) html += '</ul>';
  if (total && hechas === total) html += '<p class="fin">¡Todo cogido! 🎉</p>';
  raiz.innerHTML = html;
  document.title = `${lista.titulo} · Menuda`;
}

async function cargar() {
  if (enCurso) return;
  const { data, error: e } = await cliente.rpc('ver_lista_compartida', { p_token: token });
  if (enCurso) return;
  if (e) { error = 'Sin conexión. Se actualizará sola.'; } else { lista = data; error = ''; }
  pintar();
}

raiz.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button[data-id]');
  if (!b || !lista) return;
  const cosa = lista.cosas.find((c) => c.id === b.dataset.id);
  if (!cosa) return;
  const cogido = !cosa.cogido;
  cosa.cogido = cogido;   // se ve al momento
  pintar();
  navigator.vibrate?.(15);
  enCurso++;
  const { data, error: e } = await cliente.rpc('marcar_lista_compartida', { p_token: token, p_cosa: cosa.id, p_cogido: cogido });
  enCurso--;
  if (e) {
    cosa.cogido = !cogido;
    error = /caducado/i.test(e.message) ? '' : 'No se ha podido guardar. Prueba otra vez.';
    if (/caducado/i.test(e.message)) lista = null;
  } else if (!enCurso) {
    lista = data; error = '';
  }
  pintar();
});

if (!/^[0-9a-f]{32,}$/i.test(token)) {
  lista = null;
  pintar();
} else {
  cargar();
  // Lo que marca la otra persona aparece solo.
  setInterval(() => { if (document.visibilityState === 'visible') cargar(); }, 5000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cargar(); });
}
