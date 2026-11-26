// Pantalla de Inicio: ideas para cocinar (receta del día y filas de recetas) y lo importante de un vistazo.
import { html, useState, useMemo, useEffect } from '../vendor/preact-htm.js';
import { fechaISO, nombreDia, nombreMomento, formatoCantidad, pendienteHoy, tengoTodo } from './logica.js';
import { avisosDeCasa, enumerar } from './avisos.js';
import { Miniatura, useFotos, ElegirReceta, guardarRaciones, leerRaciones, useCocinar, ProponerSemana, mostrarAviso } from './app.js';
import { useRecetario, useEsEditor, VerRecetaApp } from './recetario-vista.js';
import { esDeLaCasa, recetaGuardada, guardarDelRecetario, tiposDe } from './recetario.js';
import { dibujoReceta } from './fotos.js';
import { recetaDelDia, filasDeIdeas, enCasa, cobertura, barajar, semillaDe } from './sugerencias.js';
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

/** Colores de fondo para las recetas sin foto (según el tipo de plato), dentro de la gama de Menuda. */
const FONDOS = [
  ['#f8e1d4', '#e9a98c'], ['#e3efe4', '#9cc5a6'], ['#fbeccb', '#e7bd6a'], ['#f6dcd8', '#d98e7f'], ['#e6ecdf', '#b3c69a'],
];
function fondoDe(r) {
  let h = 0;
  for (const c of r.tipo ?? r.nombre ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = FONDOS[h % FONDOS.length];
  return `background: linear-gradient(140deg, ${a}, ${b});`;
}

/** Foto de la receta o, si aún no tiene, un dibujo sobre un fondo de color. */
function FotoIdea({ receta, url, clase = '' }) {
  return url
    ? html`<img class="foto-idea ${clase}" src=${url} alt="" loading="lazy" />`
    : html`<span class="foto-idea sin-foto ${clase}" style=${fondoDe(receta)} aria-hidden="true"><span>${dibujoReceta(receta)}</span></span>`;
}

const datosReceta = (r) => [r.tiempo_min && `⏱ ${r.tiempo_min} min`, r.dificultad, r.raciones && `${r.raciones} rac.`].filter(Boolean);

/** La receta del día: grande, con foto, y con un toque se pone para comer o cenar hoy. */
function RecetaDelDia({ receta: r, tiene, momentosLibres, hayAlgoHoy, onVer, onOtra, onPoner }) {
  const c = cobertura(r, tiene);
  return html`
    <div class="destacada">
      <button class="destacada-foto" onClick=${onVer} aria-label=${`Ver ${r.nombre}`}>
        <${FotoIdea} receta=${r} url=${r.foto} clase="grande" />
        <span class="sello">${hayAlgoHoy ? '✨ Idea del día' : '✨ ¿Y si hoy hacéis…?'}</span>
        <span class="destacada-nombre">
          <small>${r.tipo}</small>
          <strong>${r.nombre}</strong>
        </span>
      </button>
      <div class="destacada-pie">
        <p class="destacada-datos">${datosReceta(r).map((d) => html`<span>${d}</span>`)}</p>
        ${c.total > 0 && html`<p class=${c.tengo === c.total ? 'ok' : 'texto-suave'}>
          ${c.tengo === c.total ? '✓ Tenéis todo en casa' : c.tengo === 0 ? `Lleva ${c.total} ingredientes` : `Tenéis ${c.tengo} de ${c.total} ingredientes en casa`}</p>`}
        <div class="acciones">
          ${momentosLibres.map((m) => html`<button class="boton" onClick=${() => onPoner(m)}>${m === 'comida' ? '🍽️ Para comer hoy' : '🌙 Para cenar hoy'}</button>`)}
          ${momentosLibres.length === 0 && html`<button class="boton" onClick=${onVer}>Ver la receta</button>`}
          <button class="boton secundario otra" onClick=${onOtra} aria-label="Otra idea">↻ Otra</button>
        </div>
      </div>
    </div>`;
}

/** Una fila de recetas que se pasa con el dedo. */
function FilaIdeas({ titulo, subtitulo, recetas, urlDe, tiene, onAbrir, verMas }) {
  return html`
    <div class="fila-ideas">
      <div class="fila-ideas-cabeza">
        <div><h2>${titulo}</h2>${subtitulo && html`<small class="meta">${subtitulo}</small>`}</div>
        ${verMas && html`<button class="enlace" onClick=${verMas}>Ver todas</button>`}
      </div>
      <ul class="carrusel">
        ${recetas.map((r) => {
          const c = tiene ? cobertura(r, tiene) : null;
          return html`<li><button class="idea" onClick=${() => onAbrir(r)}>
            <${FotoIdea} receta=${r} url=${urlDe(r)} />
            <strong>${r.favorita ? '★ ' : ''}${r.nombre}</strong>
            <small>${c && c.total ? (c.tengo === c.total ? '✓ Tenéis todo' : `Tenéis ${c.tengo} de ${c.total}`)
              : [r.tiempo_min && `${r.tiempo_min} min`, r.dificultad].filter(Boolean).join(' · ')}</small>
          </button></li>`;
        })}
      </ul>
    </div>`;
}

export function PantallaInicio({ almacen, datos, sesion, abrirReceta, editarReceta, irA, nLista }) {
  const hoy = fechaISO();
  const [elegir, setElegir] = useState(null); // momento
  const [proponer, setProponer] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const [viendoId, setViendoId] = useState(null); // receta del recetario abierta
  const cliente = sesion?.cliente ?? null;
  const { recetas: recetario } = useRecetario(cliente);
  const editor = useEsEditor(cliente);
  const { cocinar, hoja } = useCocinar(almacen, datos);
  const avisos = useMemo(() => avisosDeCasa(datos, hoy, 4), [datos]);
  const deHoy = datos.plan.filter((p) => p.fecha === hoy);
  const recetasHoy = deHoy.map((c) => datos.recetas.find((r) => r.id === c.receta_id)).filter(Boolean);
  const proximos = avisos.menu.filter((m) => m.fecha > hoy);
  const conFaltas = proximos.filter((m) => m.faltan.length);
  const paraHoy = datos.lista.filter(pendienteHoy).length;
  const { s, fecha } = saludo();
  const momentosLibres = ['comida', 'cena'].filter((m) => !deHoy.some((c) => c.momento === m));

  // Ideas del día: cambian cada día (y con «Otra»), iguales en los dos móviles.
  const tiene = useMemo(() => enCasa(datos), [datos.despensa, datos.articulos]);
  const disponibles = useMemo(() => (recetario ?? []).filter((r) => !r.oculta), [recetario]);
  const yaHoy = new Set(recetasHoy.map((r) => r.catalogo_id).filter(Boolean));
  const delDia = useMemo(() => recetaDelDia(disponibles.filter((r) => !yaHoy.has(r.id)), hoy, vuelta),
    [disponibles, hoy, vuelta, [...yaHoy].join()]);
  const filas = useMemo(() => filasDeIdeas(disponibles, hoy, tiene, { excluir: [delDia?.id] }), [disponibles, hoy, tiene, delDia?.id]);
  const vuestras = useMemo(() => barajar(datos.recetas.filter(esDeLaCasa), semillaDe(hoy))
    .sort((a, b) => (b.favorita - a.favorita) || (!!b.foto_path - !!a.foto_path)).slice(0, 12), [datos.recetas, hoy]);
  const fotos = useFotos(almacen, [...recetasHoy, ...vuestras].map((r) => r.foto_path));
  const viendo = viendoId && disponibles.find((r) => r.id === viendoId);

  const abrirDelRecetario = (r) => {
    const g = recetaGuardada(datos, r.id);
    if (g && !editor) abrirReceta(g.id); else setViendoId(r.id);
  };
  const ponerHoy = async (r, momento) => {
    try {
      const raciones = leerRaciones() ?? r.raciones;
      const fila = await guardarDelRecetario(almacen, r);
      await almacen.insertar('plan', { fecha: hoy, momento, receta_id: fila.id, raciones, cocinado: false });
      mostrarAviso(`Hoy ${momento === 'comida' ? 'coméis' : 'cenáis'} ${r.nombre}. Lo que falte sale en la Lista.`);
    } catch (e) {
      console.error(e);
      mostrarAviso(`No se pudo poner: ${e.message ?? e}`);
    }
  };

  return html`
    <section class="inicio">
      <p class="saludo"><b>${s}</b> · ${fecha}</p>
      <${OfrecerAvisos} sesion=${sesion} />

      ${deHoy.length > 0 && html`<div class="tarjeta-inicio">
        <h2>🍽️ Hoy</h2>
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
            ${momentosLibres.map((m) => html`<button class="boton secundario" onClick=${() => setElegir(m)}>+ ${nombreMomento(m)} de hoy</button>`)}
          </div>`}
      </div>`}

      ${recetario === null ? html`<div class="destacada cargando-idea" aria-hidden="true"><span class="foto-idea grande sin-foto"></span></div>`
        : delDia && html`<${RecetaDelDia} receta=${delDia} tiene=${tiene} momentosLibres=${momentosLibres} hayAlgoHoy=${deHoy.length > 0}
          onVer=${() => abrirDelRecetario(delDia)} onOtra=${() => setVuelta((v) => v + 1)} onPoner=${(m) => ponerHoy(delDia, m)} />`}
      ${deHoy.length === 0 && datos.recetas.length > 0 && html`
        <p class="elegir-mias">¿Mejor una de las vuestras? <button class="enlace" onClick=${() => setElegir('comida')}>Elegir de mis recetas</button></p>`}

      ${vuestras.length >= 3 && html`<${FilaIdeas} titulo="Las vuestras" subtitulo="Vuestras recetas de siempre" recetas=${vuestras}
        urlDe=${(r) => (r.foto_path ? fotos[r.foto_path] : null)} onAbrir=${(r) => abrirReceta(r.id)} verMas=${() => irA('recetas')} />`}
      ${filas.map((f) => html`<${FilaIdeas} key=${f.id} titulo=${f.titulo} subtitulo=${f.subtitulo} recetas=${f.recetas}
        urlDe=${(r) => r.foto} tiene=${f.cobertura ? tiene : null} onAbrir=${abrirDelRecetario} />`)}

      <div class="tarjeta-inicio">
        <h2>📅 Próximos días</h2>
        ${proximos.length === 0 ? html`
            <p class="texto-suave">La semana está sin planear. Os proponemos un menú con lo que tenéis en casa y lo cambiáis a vuestro gusto.</p>
            <div class="acciones">
              ${datos.recetas.length > 0 && html`<button class="boton" onClick=${() => setProponer(true)}>✨ Proponme la semana</button>`}
              <button class="boton secundario" onClick=${() => irA('plan')}>Ver el plan</button>
            </div>`
          : html`
            ${conFaltas.length === 0 ? html`<p class="ok">Tenéis todo para el menú de los próximos días.</p>`
              : html`<ul class="avisos-menu">
                  ${conFaltas.map((m) => html`<li>
                    <button class="enlace" onClick=${() => abrirReceta(m.receta.id, m.comida.raciones)}>
                      <b>${nombreDia(m.fecha, hoy)}</b> · ${m.receta.nombre}</button>
                    <small class="falta">Falta ${enumerar(m.faltan.map((f) => f.nombre))}</small>
                  </li>`)}
                </ul>`}
            <div class="acciones"><button class="boton secundario" onClick=${() => irA('plan')}>Ver el plan</button></div>`}
      </div>

      <div class="tarjeta-inicio">
        <h2>🛒 La compra</h2>
        <p>${paraHoy > 0 ? html`<b>${paraHoy}</b> ${paraHoy === 1 ? 'cosa' : 'cosas'} en la compra de hoy` : 'Nada apuntado para la compra de hoy'}${nLista > 0 ? html` · <b>${nLista}</b> en total` : ''}.</p>
        ${avisos.seAcaba.length > 0 && html`<p class="se-acaba">🧺 <b>${avisos.seAcaba.length === 1 ? 'Se acaba' : `Se acaban ${avisos.seAcaba.length} cosas`}:</b>${' '}
          ${enumerar(avisos.seAcaba.map((a) => a.nombre))}.
          <small class="meta">Ya están en la lista.</small></p>`}
        <div class="acciones"><button class="boton" onClick=${() => irA('lista')}>Ir a la lista</button></div>
      </div>

      ${hoja}
      ${viendo && html`<${VerRecetaApp} almacen=${almacen} datos=${datos} receta=${viendo} abrirReceta=${abrirReceta}
        editarReceta=${editarReceta} onCerrar=${() => setViendoId(null)} editor=${editor} cliente=${cliente}
        tipos=${tiposDe(disponibles).map((t) => t.tipo)} />`}
      ${proponer && html`<${ProponerSemana} almacen=${almacen} datos=${datos} sesion=${sesion} desde=${hoy} onCerrar=${() => setProponer(false)} />`}
      ${elegir && html`<${ElegirReceta} almacen=${almacen} datos=${datos} titulo=${`Hoy, ${nombreMomento(elegir).toLowerCase()}`} momento=${elegir}
        onCerrar=${() => setElegir(null)}
        onElegir=${(receta, raciones) => {
          almacen.insertar('plan', { fecha: hoy, momento: elegir, receta_id: receta.id, raciones, cocinado: false });
          guardarRaciones(raciones);
          setElegir(null);
        }} />`}
    </section>`;
}
