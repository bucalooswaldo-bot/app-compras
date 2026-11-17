// Pantalla de Inicio: lo importante de un vistazo (menú de hoy, qué falta y lo que se acaba).
import { html, useState, useMemo, useEffect } from '../vendor/preact-htm.js';
import { fechaISO, nombreDia, nombreMomento, formatoCantidad, pendienteHoy, tengoTodo } from './logica.js';
import { avisosDeCasa, enumerar } from './avisos.js';
import { Miniatura, useFotos, ElegirReceta, guardarRaciones, useCocinar } from './app.js';
import { puedeAvisar, estadoAvisos, activarAvisos } from './notificaciones.js';

const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function saludo(d = new Date()) {
  const h = d.getHours();
  const s = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  return { s, fecha: `${DIAS_LARGOS[d.getDay()]} ${d.getDate()} de ${MESES_LARGOS[d.getMonth()]}` };
}

const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* nada */ } };

/** Tarjeta para activar los avisos en el móvil (solo si se puede y aún no están puestos). */
function OfrecerAvisos({ sesion }) {
  const [estado, setEstado] = useState(null);
  const [cerrado, setCerrado] = useState(() => leer('avisos-ofrecidos') === 'no');
  useEffect(() => { estadoAvisos(sesion).then(setEstado).catch(() => setEstado(null)); }, []);
  if (cerrado || !estado || !estado.soportado || estado.activos || estado.permiso === 'denied') return null;
  const activar = async () => {
    try {
      await activarAvisos(sesion);
      setEstado({ ...estado, activos: true });
    } catch (e) {
      console.error(e);
      setEstado({ ...estado, error: e.message });
    }
  };
  return html`
    <div class="tarjeta-inicio ofrecer-avisos">
      <p><b>🔔 ¿Te avisamos en el móvil?</b></p>
      <p class="texto-suave">Una vez al día, solo si se acaba algo o falta algo para el menú de hoy o mañana.</p>
      ${estado.error && html`<p class="error">${estado.error}</p>`}
      <div class="acciones">
        <button class="boton principal" onClick=${activar}>Sí, avísame</button>
        <button class="boton" onClick=${() => { guardar('avisos-ofrecidos', 'no'); setCerrado(true); }}>Ahora no</button>
      </div>
    </div>`;
}

export function PantallaInicio({ almacen, datos, sesion, abrirReceta, irA, nLista }) {
  const hoy = fechaISO();
  const [elegir, setElegir] = useState(null); // momento
  const { cocinar, hoja } = useCocinar(almacen, datos);
  const avisos = useMemo(() => avisosDeCasa(datos, hoy, 4), [datos]);
  const deHoy = datos.plan.filter((p) => p.fecha === hoy);
  const recetasHoy = deHoy.map((c) => datos.recetas.find((r) => r.id === c.receta_id)).filter(Boolean);
  const fotos = useFotos(almacen, recetasHoy.map((r) => r.foto_path));
  const proximos = avisos.menu.filter((m) => m.fecha > hoy);
  const conFaltas = proximos.filter((m) => m.faltan.length);
  const paraHoy = datos.lista.filter(pendienteHoy).length;
  const { s, fecha } = saludo();
  const momentosLibres = ['comida', 'cena'].filter((m) => !deHoy.some((c) => c.momento === m));

  return html`
    <section class="inicio">
      <p class="saludo"><b>${s}</b> · ${fecha}</p>
      <${OfrecerAvisos} sesion=${sesion} />

      <div class="tarjeta-inicio">
        <h2>🍽️ Hoy</h2>
        ${deHoy.length === 0 && html`<p class="texto-suave">No hay nada planeado para hoy.</p>`}
        ${deHoy.map((c) => {
          const r = datos.recetas.find((x) => x.id === c.receta_id);
          if (!r) return null;
          const faltan = c.cocinado ? [] : tengoTodo(datos, r.id, c.raciones).filter((f) => f.estado === 'falta');
          return html`
            <div class="comida-hoy ${c.cocinado ? 'hecha' : ''}">
              <button class="foto-boton" aria-label=${`Ver ${r.nombre}`} onClick=${() => abrirReceta(r.id, c.raciones)}>
                <${Miniatura} receta=${r} url=${r.foto_path ? fotos[r.foto_path] : null} />
              </button>
              <div class="comida-texto" onClick=${() => abrirReceta(r.id, c.raciones)}>
                <small class="meta">${nombreMomento(c.momento)} · ${c.raciones} rac.</small>
                <strong>${r.nombre}</strong>
                ${c.cocinado ? html`<small class="ok">✓ Hecho</small>`
                  : faltan.length ? html`<small class="falta">Falta ${enumerar(faltan.map((f) => f.nombre))}</small>`
                  : html`<small class="ok">Tenéis todo</small>`}
              </div>
              <button class="chip ${c.cocinado ? 'activo' : ''}" onClick=${() => cocinar(c, !c.cocinado)}>
                ${c.cocinado ? '✓ Hecho' : 'Hecho'}</button>
            </div>`;
        })}
        ${momentosLibres.length > 0 && datos.recetas.length > 0 && html`
          <div class="acciones">
            ${momentosLibres.map((m) => html`<button class="boton" onClick=${() => setElegir(m)}>+ ${nombreMomento(m)} de hoy</button>`)}
          </div>`}
      </div>

      <div class="tarjeta-inicio">
        <h2>📅 Próximos días</h2>
        ${proximos.length === 0 ? html`<p class="texto-suave">No hay comidas planeadas para los próximos días.</p>`
          : conFaltas.length === 0 ? html`<p class="ok">Tenéis todo para el menú de los próximos días.</p>`
          : html`<ul class="avisos-menu">
              ${conFaltas.map((m) => html`<li>
                <button class="enlace" onClick=${() => abrirReceta(m.receta.id, m.comida.raciones)}>
                  <b>${nombreDia(m.fecha, hoy)}</b> · ${m.receta.nombre}</button>
                <small class="falta">Falta ${enumerar(m.faltan.map((f) => f.nombre))}</small>
              </li>`)}
            </ul>`}
        <div class="acciones"><button class="boton" onClick=${() => irA('plan')}>Ver el plan</button></div>
      </div>

      <div class="tarjeta-inicio">
        <h2>🧺 Se acaba</h2>
        ${avisos.seAcaba.length === 0 ? html`<p class="texto-suave">Nada por ahora.</p>`
          : html`<div class="chips">
              ${avisos.seAcaba.map((a) => html`<span class="chip aviso-chip ${a.agotado ? 'agotado' : ''}">
                ${a.nombre}${a.agotado ? '' : html` <small>· quedan ${formatoCantidad(a.cantidad, a.unidad)}</small>`}</span>`)}
            </div>
            <p class="meta">Ya sale en la lista de la compra.</p>`}
      </div>

      <div class="tarjeta-inicio">
        <h2>🛒 La compra</h2>
        <p>${paraHoy > 0 ? html`<b>${paraHoy}</b> ${paraHoy === 1 ? 'cosa' : 'cosas'} en la compra de hoy` : 'Nada apuntado para la compra de hoy'}${nLista > 0 ? html` · <b>${nLista}</b> en total` : ''}.</p>
        <div class="acciones"><button class="boton principal" onClick=${() => irA('lista')}>Ir a la lista</button></div>
      </div>

      ${hoja}
      ${elegir && html`<${ElegirReceta} almacen=${almacen} datos=${datos} titulo=${`Hoy, ${nombreMomento(elegir).toLowerCase()}`} momento=${elegir}
        onCerrar=${() => setElegir(null)}
        onElegir=${(receta, raciones) => {
          almacen.insertar('plan', { fecha: hoy, momento: elegir, receta_id: receta.id, raciones, cocinado: false });
          guardarRaciones(raciones);
          setElegir(null);
        }} />`}
    </section>`;
}
