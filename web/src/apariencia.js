// Ajustes de cómo se ve la app (modo oscuro, letra grande) y de los avisos en el móvil.
import { html, useState, useEffect } from '../vendor/preact-htm.js';
import { fechaISO } from './logica.js';
import { avisosDeCasa, textoAviso } from './avisos.js';
import { puedeAvisar, estadoAvisos, activarAvisos, desactivarAvisos, cambiarHora, avisoDePrueba } from './notificaciones.js';

const leer = (k, def) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* nada */ } };

const TEMAS = [['auto', 'Como el móvil'], ['claro', 'Claro'], ['oscuro', 'Oscuro']];
const LETRAS = [['normal', 'Normal'], ['grande', 'Grande']];

/** Pone el tema y el tamaño de letra guardados en este móvil. */
export function aplicarApariencia() {
  const raiz = document.documentElement;
  const tema = leer('tema', 'auto');
  if (tema === 'auto') delete raiz.dataset.theme;
  else raiz.dataset.theme = tema === 'oscuro' ? 'dark' : 'light';
  raiz.classList.toggle('letra-grande', leer('letra', 'normal') === 'grande');
  const oscuro = tema === 'oscuro' || (tema === 'auto' && matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', oscuro ? '#141715' : '#2f7d4f');
}

export function Apariencia() {
  const [tema, setTema] = useState(() => leer('tema', 'auto'));
  const [letra, setLetra] = useState(() => leer('letra', 'normal'));
  const elegir = (k, v, set) => { guardar(k, v); set(v); aplicarApariencia(); };
  return html`
    <h3>Pantalla</h3>
    <div class="chips">
      <span class="chips-label">Colores:</span>
      ${TEMAS.map(([v, t]) => html`<button class="chip ${tema === v ? 'activo' : ''}" onClick=${() => elegir('tema', v, setTema)}>${t}</button>`)}
    </div>
    <div class="chips">
      <span class="chips-label">Letra:</span>
      ${LETRAS.map(([v, t]) => html`<button class="chip ${letra === v ? 'activo' : ''}" onClick=${() => elegir('letra', v, setLetra)}>${t}</button>`)}
    </div>`;
}

const HORAS = [8, 9, 10, 12, 18, 20];

export function AjustesAvisos({ datos, sesion }) {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { estadoAvisos(sesion).then(setEstado).catch((e) => setError(e.message)); }, []);
  const hacer = async (fn) => {
    setOcupado(true); setError(null);
    try { await fn(); setEstado(await estadoAvisos(sesion)); } catch (e) { console.error(e); setError(e.message); }
    setOcupado(false);
  };
  const probar = () => hacer(async () => {
    const t = textoAviso(avisosDeCasa(datos, fechaISO(), 2), fechaISO())
      ?? { titulo: 'Todo en orden', cuerpo: 'No se acaba nada y tenéis todo para el menú de hoy y mañana.' };
    await avisoDePrueba(t.titulo, t.cuerpo, sesion);
  });
  if (!puedeAvisar()) {
    return html`<h3>Avisos en el móvil</h3><p class="texto-suave">Este navegador no permite avisos. En Android, abre la app con Chrome e instálala en la pantalla de inicio.</p>`;
  }
  if (!estado) return html`<h3>Avisos en el móvil</h3><p class="texto-suave">…</p>`;
  return html`
    <h3>Avisos en el móvil</h3>
    <p class="texto-suave">Una vez al día, si se acaba algo de la despensa o falta algo para el menú de hoy o mañana. Si nada cambia, no repite el mismo aviso.</p>
    ${estado.permiso === 'denied' && html`<p class="error">El móvil tiene bloqueados los avisos de esta app. Se activan en Ajustes del móvil → Aplicaciones → Chrome → Notificaciones.</p>`}
    ${estado.activos ? html`
      <div class="chips">
        <span class="chips-label">Hora:</span>
        ${HORAS.map((h) => html`<button class="chip ${estado.hora === h ? 'activo' : ''}" disabled=${ocupado}
          onClick=${() => hacer(() => cambiarHora(sesion, h))}>${h}:00</button>`)}
      </div>
      <div class="acciones">
        <button class="boton" disabled=${ocupado} onClick=${probar}>Ver un aviso de prueba</button>
        <button class="boton" disabled=${ocupado} onClick=${() => hacer(() => desactivarAvisos(sesion))}>Quitar avisos</button>
      </div>`
    : html`<button class="boton principal" disabled=${ocupado || estado.permiso === 'denied'} onClick=${() => hacer(() => activarAvisos(sesion))}>🔔 Activar avisos en este móvil</button>`}
    ${error && html`<p class="error">${error}</p>`}`;
}
