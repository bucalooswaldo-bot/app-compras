// Pantallas del recetario de la app (aparte de «Mis recetas»): buscar, ver y usar sus recetas.
import { html, useState, useEffect } from '../vendor/preact-htm.js';
import { escalar, formatoCantidad, normalizar, nombreDia, nombreMomento } from './logica.js';
import {
  cargarRecetario, buscarEnRecetario, tiposDe, recetaGuardada, guardarDelRecetario, prepararGuardado, articuloDeIngrediente,
} from './recetario.js';
import { dibujoReceta } from './fotos.js';
import { Hoja, Contador, ElegirDia, Miniatura, mostrarAviso, compartir } from './app.js';

/** Las recetas del recetario (null mientras carga; [] si no se pudo). */
export function useRecetario() {
  const [recetas, setRecetas] = useState(null);
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    let vivo = true;
    cargarRecetario().then((r) => vivo && setRecetas(r)).catch((e) => { console.error(e); if (vivo) { setRecetas([]); setFallo(true); } });
    return () => { vivo = false; };
  }, []);
  return { recetas, fallo };
}

const detalles = (r) => [r.tiempo_min && `${r.tiempo_min} min`, r.dificultad, r.coste && `coste ${r.coste}`].filter(Boolean).join(' · ');
const POR_PAGINA = 40;

export function RecetarioApp({ almacen, datos, abrirReceta, editarReceta }) {
  const { recetas, fallo } = useRecetario();
  const [buscar, setBuscar] = useState('');
  const [tipo, setTipo] = useState(null);
  const [guardadas, setGuardadas] = useState(false);
  const [cuantas, setCuantas] = useState(POR_PAGINA);
  const [viendo, setViendo] = useState(null);
  useEffect(() => setCuantas(POR_PAGINA), [buscar, tipo, guardadas]);

  if (!recetas) return html`<p class="vacio">Cargando el recetario…</p>`;
  if (fallo) return html`<p class="vacio">No se pudo abrir el recetario. Prueba otra vez con conexión.</p>`;
  const lista = buscarEnRecetario(recetas, buscar, tipo).filter((r) => !guardadas || recetaGuardada(datos, r.id));
  const nGuardadas = recetas.filter((r) => recetaGuardada(datos, r.id)).length;
  const abrir = (r) => {
    const g = recetaGuardada(datos, r.id);
    if (g) abrirReceta(g.id); else setViendo(r);
  };
  return html`
    <input type="search" placeholder=${`Buscar entre ${recetas.length} recetas o por ingrediente`} value=${buscar}
      onInput=${(e) => setBuscar(e.target.value)} />
    <div class="chips">
      ${nGuardadas > 0 && html`<button class="chip ${guardadas ? 'activo' : ''}" onClick=${() => setGuardadas(!guardadas)}>★ Las que uso (${nGuardadas})</button>`}
      ${tiposDe(recetas).map(({ tipo: t }) => html`<button class="chip ${tipo === t ? 'activo' : ''}" onClick=${() => setTipo(tipo === t ? null : t)}>${t}</button>`)}
    </div>
    ${lista.length === 0 && html`<p class="vacio">No hay recetas así en el recetario.</p>`}
    <ul class="tarjetas">
      ${lista.slice(0, cuantas).map((r) => {
        const g = recetaGuardada(datos, r.id);
        return html`<li>
          <button class="tarjeta con-foto" onClick=${() => abrir(r)}>
            <${Miniatura} receta=${r} />
            <span class="texto-tarjeta">
              <strong>${g?.favorita ? '★ ' : ''}${r.nombre}</strong>
              <small>${[r.tipo, detalles(r)].filter(Boolean).join(' · ')}</small>
            </span>
          </button>
        </li>`;
      })}
    </ul>
    ${lista.length > cuantas && html`<p class="pie"><button class="boton secundario" onClick=${() => setCuantas(cuantas + POR_PAGINA)}>
      Ver más (quedan ${lista.length - cuantas})</button></p>`}
    ${viendo && html`<${VerRecetaApp} almacen=${almacen} datos=${datos} receta=${viendo} abrirReceta=${abrirReceta}
      editarReceta=${editarReceta} onCerrar=${() => setViendo(null)} />`}`;
}

/** Texto para enviar por WhatsApp una receta del recetario. */
function textoRecetaApp(r, raciones) {
  const l = [`*${r.nombre}*`, `${raciones} ${raciones === 1 ? 'ración' : 'raciones'}${r.tiempo_min ? ` · ${r.tiempo_min} min` : ''}`, '', '*Ingredientes*'];
  for (const [n, c, u] of r.ingredientes) {
    const e = escalar(c, r.raciones, raciones);
    l.push(`- ${n}${e == null ? '' : `: ${formatoCantidad(e, u)}`}`);
  }
  l.push('', '*Preparación*', ...r.pasos.map((p, i) => `${i + 1}. ${p}`));
  if (r.truco) l.push('', `*Truco:* ${r.truco}`);
  return l.join('\n');
}

/** Una receta del recetario que la casa aún no ha usado. Al usarla se guarda en la casa y se abre como las demás. */
export function VerRecetaApp({ almacen, datos, receta: r, abrirReceta, editarReceta, onCerrar }) {
  const [raciones, setRaciones] = useState(r.raciones);
  const [alPlan, setAlPlan] = useState(false);
  const [haciendo, setHaciendo] = useState(false);
  const usar = async (cambios, luego) => {
    setHaciendo(true);
    try {
      const fila = await guardarDelRecetario(almacen, r, cambios);
      await luego(fila);
    } catch (e) {
      console.error(e);
      mostrarAviso(`No se pudo guardar: ${e.message ?? e}`);
    }
    setHaciendo(false);
  };
  const favorita = () => usar({ favorita: true }, (f) => { mostrarAviso('★ Guardada en favoritas'); onCerrar(); abrirReceta(f.id, raciones); });
  const cocinar = () => usar({}, (f) => { onCerrar(); abrirReceta(f.id, raciones, { cocinar: true }); });
  const hacerMia = async () => {
    setHaciendo(true);
    try {
      const g = prepararGuardado(almacen.datos.articulos, r);
      if (g.articulos.length) await almacen.insertar('articulos', g.articulos);
      await almacen.insertar('recetas', { ...g.receta, origen: 'manual', catalogo_id: null });
      await almacen.insertar('ingredientes', g.ingredientes);
      onCerrar();
      editarReceta(g.receta.id);
      mostrarAviso('Copiada a «Mis recetas». Cámbiala a tu gusto.');
    } catch (e) {
      console.error(e);
      mostrarAviso(`No se pudo copiar: ${e.message ?? e}`);
    }
    setHaciendo(false);
  };
  return html`
    <${Hoja} titulo=${r.nombre} onCerrar=${onCerrar}>
      <div class="foto-receta corta"><span class="sin-foto grande" aria-hidden="true">${dibujoReceta(r)}</span></div>
      <p class="meta">📖 Recetario de la app · ${[r.tipo, detalles(r)].filter(Boolean).join(' · ')}</p>
      <div class="acciones">
        <button class="chip" disabled=${haciendo} onClick=${favorita}>☆ Favorita</button>
        <button class="chip" disabled=${haciendo} onClick=${() => setAlPlan(true)}>+ Al plan</button>
        <button class="chip" onClick=${() => compartir({ titulo: r.nombre, texto: textoRecetaApp(r, raciones) })}>📤 Enviar</button>
        <button class="chip" disabled=${haciendo} onClick=${hacerMia}>✏️ Copiar a mis recetas</button>
      </div>
      <div class="fila-campo"><label>Raciones</label><${Contador} valor=${raciones} onCambio=${setRaciones} /></div>
      <h3>Ingredientes</h3>
      <ul class="ingredientes">
        ${r.ingredientes.map(([nombre, cantidad, unidad]) => {
          const a = articuloDeIngrediente(datos.articulos, nombre);
          const hay = a && datos.despensa.find((d) => d.articulo_id === a.id);
          const c = escalar(cantidad, r.raciones, raciones);
          return html`<li>
            <span>${nombre}</span>
            <span class="cant">${c == null ? 'al gusto' : formatoCantidad(c, unidad)}
              ${hay && hay.cantidad > 0 && html`<small class="en-casa" title="En casa">🏠 ${formatoCantidad(hay.cantidad, a.unidad)}</small>`}</span>
          </li>`;
        })}
      </ul>
      <h3>Preparación</h3>
      <div class="pasos">${r.pasos.map((p, i) => html`<p>${i + 1}. ${p}</p>`)}</div>
      ${r.truco && html`<div class="pasos"><p class="paso-titulo"><strong>Truco:</strong> ${r.truco}</p></div>`}
      <div class="botones-cocinar">
        <button class="boton grande" disabled=${haciendo} onClick=${cocinar}>👩‍🍳 Cocinarla</button>
      </div>
      <p class="meta">Al ponerla en el plan o cocinarla, la app la tiene en cuenta para la lista de la compra y la despensa.
        Sigue estando en el recetario de la app, no en «Mis recetas».</p>
      ${alPlan && html`<${ElegirDia} onCerrar=${() => setAlPlan(false)} onElegir=${(fecha, momento) => usar({}, async (f) => {
        await almacen.insertar('plan', { fecha, momento, receta_id: f.id, raciones, cocinado: false });
        setAlPlan(false);
        mostrarAviso(`Añadida al plan: ${nombreDia(fecha)}, ${nombreMomento(momento).toLowerCase()}`);
      })} />`}
    </${Hoja}>`;
}

/** Para elegir receta del plan: las del recetario que encajan con lo buscado y la casa aún no usa. */
export function delRecetario(recetas, datos, buscar, max = 15) {
  if (!recetas?.length || normalizar(buscar).trim().length < 2) return [];
  return buscarEnRecetario(recetas, buscar).filter((r) => !recetaGuardada(datos, r.id)).slice(0, max);
}
