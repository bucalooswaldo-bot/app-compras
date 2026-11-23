// Pantallas del recetario de la app (aparte de «Mis recetas»): buscar, ver y usar sus recetas.
import { html, useState, useEffect, useRef } from '../vendor/preact-htm.js';
import { escalar, formatoCantidad, normalizar, nombreDia, nombreMomento } from './logica.js';
import {
  cargarRecetario, buscarEnRecetario, tiposDe, recetaGuardada, guardarDelRecetario, prepararGuardado, articuloDeIngrediente,
  escucharRecetario, esEditorRecetario, subirFotoRecetario, guardarCambioRecetario, actualizarCopiaDeCasa,
} from './recetario.js';
import { dibujoReceta, reducirFoto } from './fotos.js';
import { Hoja, Contador, ElegirDia, Miniatura, mostrarAviso, compartir, useFotoParaEnviar } from './app.js';

/** Las recetas del recetario (null mientras carga; [] si no se pudo). */
export function useRecetario(cliente) {
  const [recetas, setRecetas] = useState(null);
  const [fallo, setFallo] = useState(false);
  useEffect(() => {
    let vivo = true;
    cargarRecetario(cliente).then((r) => vivo && setRecetas(r)).catch((e) => { console.error(e); if (vivo) { setRecetas([]); setFallo(true); } });
    const dejar = escucharRecetario((r) => vivo && setRecetas(r));
    return () => { vivo = false; dejar(); };
  }, [cliente]);
  return { recetas, fallo };
}

/** ¿Puede esta cuenta corregir el recetario (Mary)? */
export function useEsEditor(cliente) {
  const [editor, setEditor] = useState(false);
  useEffect(() => {
    let vivo = true;
    esEditorRecetario(cliente).then((e) => vivo && setEditor(e)).catch(() => {});
    return () => { vivo = false; };
  }, [cliente]);
  return editor;
}

const detalles = (r) => [r.tiempo_min && `${r.tiempo_min} min`, r.dificultad, r.coste && `coste ${r.coste}`].filter(Boolean).join(' · ');
const POR_PAGINA = 40;

export function RecetarioApp({ almacen, datos, sesion, abrirReceta, editarReceta }) {
  const cliente = sesion?.cliente ?? null;
  const { recetas, fallo } = useRecetario(cliente);
  const editor = useEsEditor(cliente);
  const [buscar, setBuscar] = useState('');
  const [tipo, setTipo] = useState(null);
  const [guardadas, setGuardadas] = useState(false);
  const [revision, setRevision] = useState(null); // editores: 'sin' | 'hechas' | 'ocultas'
  const [cuantas, setCuantas] = useState(POR_PAGINA);
  const [viendoId, setViendoId] = useState(null);
  useEffect(() => setCuantas(POR_PAGINA), [buscar, tipo, guardadas, revision]);

  if (!recetas) return html`<p class="vacio">Cargando el recetario…</p>`;
  if (fallo) return html`<p class="vacio">No se pudo abrir el recetario. Prueba otra vez con conexión.</p>`;
  const deRevision = (r) => !revision || (revision === 'ocultas' ? r.oculta : !r.oculta && (revision === 'hechas') === !!r.revisada);
  const lista = buscarEnRecetario(recetas, buscar, tipo, editor && revision === 'ocultas')
    .filter((r) => (!guardadas || recetaGuardada(datos, r.id)) && deRevision(r));
  const nGuardadas = recetas.filter((r) => recetaGuardada(datos, r.id)).length;
  const visibles = recetas.filter((r) => !r.oculta);
  const nRevisadas = visibles.filter((r) => r.revisada).length;
  const nOcultas = recetas.length - visibles.length;
  const viendo = viendoId && recetas.find((r) => r.id === viendoId);
  const abrir = (r) => {
    const g = recetaGuardada(datos, r.id);
    // Quien corrige el recetario ve siempre la receta del recetario (para poder editarla)
    if (g && !editor) abrirReceta(g.id); else setViendoId(r.id);
  };
  return html`
    <input type="search" placeholder=${`Buscar entre ${visibles.length} recetas o por ingrediente`} value=${buscar}
      onInput=${(e) => setBuscar(e.target.value)} />
    ${editor && html`<div class="chips revision">
      <span class="chips-label">Revisión: ${nRevisadas} de ${visibles.length}</span>
      <button class="chip ${revision === 'sin' ? 'activo' : ''}" onClick=${() => setRevision(revision === 'sin' ? null : 'sin')}>Sin revisar (${visibles.length - nRevisadas})</button>
      <button class="chip ${revision === 'hechas' ? 'activo' : ''}" onClick=${() => setRevision(revision === 'hechas' ? null : 'hechas')}>✓ Revisadas (${nRevisadas})</button>
      ${nOcultas > 0 && html`<button class="chip ${revision === 'ocultas' ? 'activo' : ''}" onClick=${() => setRevision(revision === 'ocultas' ? null : 'ocultas')}>Quitadas (${nOcultas})</button>`}
    </div>`}
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
            <${Miniatura} receta=${r} url=${r.foto} />
            <span class="texto-tarjeta">
              <strong>${g?.favorita ? '★ ' : ''}${editor && r.revisada ? '✓ ' : ''}${r.nombre}</strong>
              <small>${[r.tipo, detalles(r)].filter(Boolean).join(' · ')}</small>
            </span>
          </button>
        </li>`;
      })}
    </ul>
    ${lista.length > cuantas && html`<p class="pie"><button class="boton secundario" onClick=${() => setCuantas(cuantas + POR_PAGINA)}>
      Ver más (quedan ${lista.length - cuantas})</button></p>`}
    ${viendo && html`<${VerRecetaApp} almacen=${almacen} datos=${datos} receta=${viendo} abrirReceta=${abrirReceta}
      editarReceta=${editarReceta} onCerrar=${() => setViendoId(null)} editor=${editor} cliente=${cliente}
      tipos=${tiposDe(recetas).map((t) => t.tipo)} />`}`;
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
export function VerRecetaApp({ almacen, datos, receta: r, abrirReceta, editarReceta, onCerrar, editor = false, cliente = null, tipos = [] }) {
  const [raciones, setRaciones] = useState(r.raciones);
  const [editando, setEditando] = useState(false);
  const fotoEnviar = useFotoParaEnviar(r.foto ?? null, r.nombre);
  const marcarRevisada = async () => {
    try {
      await guardarCambioRecetario(cliente, cambioDe(r, { revisada: !r.revisada }));
      mostrarAviso(r.revisada ? 'Quitada la marca de revisada' : '✓ Marcada como revisada');
    } catch (e) { console.error(e); mostrarAviso(`No se pudo guardar: ${e.message ?? e}`); }
  };
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
      ${r.foto
        ? html`<div class="foto-receta"><img src=${r.foto} alt=${r.nombre} /></div>`
        : html`<div class="foto-receta corta"><span class="sin-foto grande" aria-hidden="true">${dibujoReceta(r)}</span></div>`}
      <p class="meta">📖 Recetario de la app · ${[r.tipo, detalles(r)].filter(Boolean).join(' · ')}</p>
      ${editor && html`<div class="acciones revisar">
        <button class="boton" onClick=${() => setEditando(true)}>✏️ Corregir o poner foto</button>
        <button class="chip ${r.revisada ? 'activo' : ''}" onClick=${marcarRevisada}>${r.revisada ? '✓ Revisada' : 'Marcar revisada'}</button>
        ${r.oculta && html`<small class="meta">Quitada del recetario: no la ve nadie más.</small>`}
      </div>`}
      <div class="acciones">
        <button class="chip" disabled=${haciendo} onClick=${favorita}>☆ Favorita</button>
        <button class="chip" disabled=${haciendo} onClick=${() => setAlPlan(true)}>+ Al plan</button>
        <button class="chip" onClick=${() => compartir({ titulo: r.nombre, texto: textoRecetaApp(r, raciones), foto: fotoEnviar })}>📤 Enviar</button>
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
      ${editando && html`<${EditarRecetaApp} almacen=${almacen} cliente=${cliente} receta=${r} tipos=${tipos}
        onCerrar=${() => setEditando(false)} />`}
    </${Hoja}>`;
}

/** Para elegir receta del plan: las del recetario que encajan con lo buscado y la casa aún no usa. */
export function delRecetario(recetas, datos, buscar, max = 15) {
  if (!recetas?.length || normalizar(buscar).trim().length < 2) return [];
  return buscarEnRecetario(recetas, buscar).filter((r) => !recetaGuardada(datos, r.id)).slice(0, max);
}

/** La fila de recetario_cambios de una receta (lo que ya tiene más lo que cambia). */
function cambioDe(r, cambios = {}) {
  return { id: r.id, receta: r._corregida ?? null, foto: r._fotoRuta ?? null, revisada: !!r.revisada, oculta: !!r.oculta, ...cambios };
}

const UNIDADES = [['g', 'g'], ['ml', 'ml'], ['ud', 'ud']];
const DIFICULTADES = ['fácil', 'media', 'difícil'];
const COSTES = ['bajo', 'medio', 'alto'];

/** Corregir una receta del recetario de la app (solo quien lo revisa): texto, ingredientes, foto, revisada u oculta. */
export function EditarRecetaApp({ almacen, cliente, receta: r, tipos, onCerrar }) {
  const [f, setF] = useState({
    nombre: r.nombre, tipo: r.tipo, raciones: r.raciones, tiempo_min: r.tiempo_min ?? '', dificultad: r.dificultad ?? 'fácil',
    coste: r.coste ?? 'bajo', etiquetas: (r.etiquetas ?? []).join(', '), pasos: r.pasos.join('\n\n'), truco: r.truco ?? '',
    revisada: true, oculta: !!r.oculta,
  });
  const [ings, setIngs] = useState(r.ingredientes.map(([nombre, cantidad, unidad]) => ({ clave: crypto.randomUUID(), nombre, cantidad: cantidad ?? '', unidad })));
  const [foto, setFoto] = useState(null);   // { blob, url } foto nueva elegida
  const [guardando, setGuardando] = useState(false);
  const entrada = useRef(null);
  const campo = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const cambiarIng = (k, c) => setIngs((xs) => xs.map((x) => (x.clave === k ? { ...x, ...c } : x)));

  const elegirFoto = async (archivo) => {
    if (!archivo) return;
    try {
      const blob = await reducirFoto(archivo, 1280, 0.82);
      if (foto) URL.revokeObjectURL(foto.url);
      setFoto({ blob, url: URL.createObjectURL(blob) });
    } catch (e) { mostrarAviso(e.message ?? String(e)); }
  };

  const guardar = async () => {
    if (!f.nombre.trim()) return mostrarAviso('Ponle un nombre a la receta');
    const ingredientes = ings.filter((i) => i.nombre.trim()).map((i) => {
      const c = String(i.cantidad).replace(',', '.').trim();
      return [i.nombre.trim(), c === '' || Number.isNaN(Number(c)) ? null : Number(c), i.unidad];
    });
    if (!ingredientes.length) return mostrarAviso('La receta necesita al menos un ingrediente');
    const pasos = f.pasos.split('\n').map((p) => p.replace(/^\s*\d+[.)-]\s*/, '').trim()).filter(Boolean);
    if (!pasos.length) return mostrarAviso('Escribe al menos un paso de la preparación');
    setGuardando(true);
    try {
      const corregida = {
        nombre: f.nombre.trim(), tipo: f.tipo, raciones: Math.max(1, Number(f.raciones) || 1), tiempo_min: Number(f.tiempo_min) || null,
        dificultad: f.dificultad, coste: f.coste, etiquetas: f.etiquetas.split(',').map((x) => x.trim()).filter(Boolean),
        ingredientes, pasos, truco: f.truco.trim() || null,
      };
      let ruta = cambioDe(r).foto;
      if (foto) ruta = await subirFotoRecetario(cliente, r.id, foto.blob);
      await guardarCambioRecetario(cliente, { id: r.id, receta: corregida, foto: ruta, revisada: f.revisada, oculta: f.oculta });
      // Si la casa ya usa esta receta, su copia se pone igual
      const nueva = { ...r, ...corregida, foto: ruta ? cliente.storage.from('recetario').getPublicUrl(ruta).data.publicUrl : null };
      await actualizarCopiaDeCasa(almacen, nueva).catch((e) => console.error(e));
      mostrarAviso('Receta del recetario guardada');
      onCerrar();
    } catch (e) {
      console.error(e);
      mostrarAviso(`No se pudo guardar: ${e.message ?? e}`);
    }
    setGuardando(false);
  };

  const urlFoto = foto?.url ?? r.foto;
  return html`
    <${Hoja} titulo="Corregir receta del recetario" onCerrar=${onCerrar}>
      <input ref=${entrada} type="file" accept="image/*" hidden onChange=${(e) => { elegirFoto(e.target.files?.[0]); e.target.value = ''; }} />
      <div class="foto-receta">${urlFoto
        ? html`<img src=${urlFoto} alt="Foto del plato" />`
        : html`<span class="sin-foto grande" aria-hidden="true">${dibujoReceta(r)}</span>`}</div>
      <div class="acciones">
        <button class="boton secundario" onClick=${() => entrada.current?.click()}>📷 ${urlFoto ? 'Cambiar la foto' : 'Poner foto'}</button>
        ${foto && html`<button class="enlace" onClick=${() => { URL.revokeObjectURL(foto.url); setFoto(null); }}>Quitar la nueva</button>`}
      </div>
      <label>Nombre<input value=${f.nombre} onInput=${campo('nombre')} /></label>
      <div class="dos">
        <label>Tipo<select value=${f.tipo} onChange=${campo('tipo')}>${tipos.map((t) => html`<option value=${t}>${t}</option>`)}</select></label>
        <label>Raciones<input inputmode="numeric" value=${f.raciones} onInput=${campo('raciones')} /></label>
      </div>
      <div class="dos">
        <label>Minutos<input inputmode="numeric" value=${f.tiempo_min} onInput=${campo('tiempo_min')} /></label>
        <label>Dificultad<select value=${f.dificultad} onChange=${campo('dificultad')}>${DIFICULTADES.map((d) => html`<option value=${d}>${d}</option>`)}</select></label>
      </div>
      <div class="dos">
        <label>Coste<select value=${f.coste} onChange=${campo('coste')}>${COSTES.map((d) => html`<option value=${d}>${d}</option>`)}</select></label>
        <label>Etiquetas<input value=${f.etiquetas} placeholder="Sin gluten, Rápida" onInput=${campo('etiquetas')} /></label>
      </div>
      <h3>Ingredientes</h3>
      <p class="meta">Cantidad para ${f.raciones} raciones. Déjala vacía si es «al gusto».</p>
      ${ings.map((i) => html`
        <div class="ing-app">
          <input class="ing-app-nombre" aria-label="Ingrediente" value=${i.nombre} onInput=${(e) => cambiarIng(i.clave, { nombre: e.target.value })} />
          <input class="ing-app-cant" aria-label="Cantidad" inputmode="decimal" value=${i.cantidad} onInput=${(e) => cambiarIng(i.clave, { cantidad: e.target.value })} />
          <select aria-label="Unidad" value=${i.unidad} onChange=${(e) => cambiarIng(i.clave, { unidad: e.target.value })}>
            ${UNIDADES.map(([v, t]) => html`<option value=${v}>${t}</option>`)}</select>
          <button class="icono peq" aria-label=${`Quitar ${i.nombre}`} onClick=${() => setIngs(ings.filter((x) => x.clave !== i.clave))}>✕</button>
        </div>`)}
      <button class="anadir" onClick=${() => setIngs([...ings, { clave: crypto.randomUUID(), nombre: '', cantidad: '', unidad: 'g' }])}>+ Añadir ingrediente</button>
      <label>Preparación<small class="meta"> (cada paso en su línea)</small>
        <textarea rows="10" value=${f.pasos} onInput=${campo('pasos')}></textarea></label>
      <label>Truco<textarea rows="2" value=${f.truco} onInput=${campo('truco')}></textarea></label>
      <label class="casilla"><input type="checkbox" checked=${f.revisada} onChange=${campo('revisada')} /> Revisada, está bien</label>
      <label class="casilla"><input type="checkbox" checked=${f.oculta} onChange=${campo('oculta')} /> Quitarla del recetario (no la verá nadie más)</label>
      <button class="boton grande" disabled=${guardando} onClick=${guardar}>${guardando ? 'Guardando…' : 'Guardar'}</button>
      <p class="meta">Los cambios se ven en el recetario de todas las casas.</p>
    </${Hoja}>`;
}
