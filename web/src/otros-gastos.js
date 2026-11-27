// Pestaña Gastos: "Otros gastos de casa" (tiques de tiendas que no son el súper) y garantías.
// Es un extra: solo sale si la casa lo enciende en Ajustes. Lo de comida sigue arriba, como siempre.
import { html, useState, useMemo, useRef } from '../vendor/preact-htm.js';
import { fechaISO } from './logica.js';
import { leerTique, leerImporte } from './tiques.js';
import { euros } from './comparar.js';
import { reducirFoto } from './fotos.js';
import {
  TIPOS_GASTO, nombreTipo, iconoTipo, esOtroGasto, ANIOS_GARANTIA, sumarAnios, diasHasta,
  agruparGarantias, otrosGastosDelPeriodo, tiendasUsadas, tipoDeTienda, tiendaDelTexto,
} from './garantias.js';
import { Hoja, BotonSeguro, mostrarAviso, useFotos, leerTextoDeImagen } from './app.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** "12 ene 2027" */
const fechaBonita = (iso) => { const [a, m, d] = iso.slice(0, 10).split('-').map(Number); return `${d} ${MESES[m - 1]} ${a}`; };
/** "12 de enero" */
const diaYMes = (iso) => { const [, m, d] = iso.slice(0, 10).split('-').map(Number); return `${d} de ${MESES_LARGOS[m - 1]}`; };
/** "mar 2028" */
const mesYAnio = (iso) => { const [a, m] = iso.slice(0, 10).split('-').map(Number); return `${MESES[m - 1]} ${a}`; };

/** ¿Tiene la casa encendido "Gastos fuera del súper"? */
export const otrosGastosEncendido = (datos) => !!(datos.ajustes ?? [])[0]?.otros_gastos;

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------
export function AjusteOtrosGastos({ almacen, datos }) {
  const fila = (datos.ajustes ?? [])[0];
  const encendido = !!fila?.otros_gastos;
  const cambiar = (v) => (fila ? almacen.actualizar('ajustes', fila.id, { otros_gastos: v })
    : almacen.insertar('ajustes', { otros_gastos: v }));
  return html`
    <h3>Gastos fuera del súper</h3>
    <label class="casilla">
      <input type="checkbox" id="ajuste-otros-gastos" checked=${encendido} onChange=${(e) => cambiar(e.target.checked)} />
      Apuntar también tiques de otras tiendas y guardar garantías
    </label>
    <p class="texto-suave">Farmacia, droguería, ropa, electrónica… Sale en Gastos, debajo de lo del súper. Vale para toda la casa.</p>`;
}

// ---------------------------------------------------------------------------
// Aviso de garantía que se acaba (arriba en Gastos)
// ---------------------------------------------------------------------------
export function AvisoGarantia({ datos, onVer }) {
  const g = agruparGarantias(datos.garantias).pronto.find((x) => x.dias <= 30);
  if (!g) return null;
  const cuando = g.dias === 0 ? 'hoy' : g.dias === 1 ? 'mañana' : `el ${diaYMes(g.hasta)}`;
  return html`<button class="aviso-garantia" onClick=${() => onVer(g.id)}>
    ⏰ La garantía de <b>${g.que.toLowerCase()}</b> acaba ${cuando}. Si falla algo, es el momento.
  </button>`;
}

// ---------------------------------------------------------------------------
// Apartado "Otros gastos de casa"
// ---------------------------------------------------------------------------
export function OtrosGastos({ almacen, datos, sesion, periodo, inicio, tituloPeriodo }) {
  const [leyendo, setLeyendo] = useState(null);
  const [revisar, setRevisar] = useState(null);
  const [ver, setVer] = useState(null);
  const [garantias, setGarantias] = useState(false);
  const [garantia, setGarantia] = useState(null);
  const camara = useRef(null);
  const galeria = useRef(null);

  const resumen = otrosGastosDelPeriodo(datos.tiques, periodo, inicio);
  const ultimos = datos.tiques.filter(esOtroGasto).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5);
  const nGarantias = (datos.garantias ?? []).length;

  const elegirFoto = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    let leido = { fecha: null, total: null };
    let tienda = null;
    try {
      setLeyendo('cargando');
      const texto = await leerTextoDeImagen(archivo, setLeyendo);
      leido = leerTique(texto);
      tienda = tiendaDelTexto(texto);
    } catch (err) {
      console.error(err);
      mostrarAviso('No he podido leer el tique. Escribe la tienda y el total.');
    } finally {
      setLeyendo(null);
    }
    setRevisar({ archivo, fecha: leido.fecha, total: leido.total, tienda: tienda?.tienda ?? '', tipo: tienda?.tipo ?? null });
  };

  return html`
    <h3 class="categoria">Otros gastos de casa</h3>
    <div class="otros-gastos">
      ${resumen.tiques > 0
        ? html`<div class="fila-gasto total"><span>${tituloPeriodo}</span><b>${euros(resumen.total)}</b></div>
            ${resumen.porTipo.map(([t, v]) => html`<div class="fila-gasto"><span>${iconoTipo(t)} ${nombreTipo(t)}</span><b>${euros(v)}</b></div>`)}`
        : html`<p class="texto-suave">Farmacia, ropa, electrónica… Haz foto al tique y se suma aquí, aparte de lo del súper.</p>`}
      ${leyendo != null
        ? html`<button class="boton" disabled>${leyendo === 'cargando' ? 'Preparando el lector…' : `Leyendo el tique… ${leyendo}%`}</button>`
        : html`<div class="dos-botones">
            <button class="boton secundario" onClick=${() => camara.current.click()}>📷 Hacer foto</button>
            <button class="boton secundario" onClick=${() => galeria.current.click()}>🖼 De la galería</button>
          </div>`}
      <input ref=${camara} type="file" accept="image/*" capture="environment" hidden onChange=${elegirFoto} />
      <input ref=${galeria} type="file" accept="image/*" hidden onChange=${elegirFoto} />
      <button class="enlace" onClick=${() => setRevisar({ archivo: null, fecha: null, total: null, tienda: '', tipo: null })}>o escribirlo a mano</button>
      ${ultimos.length > 0 && html`<div class="filas">
        ${ultimos.map((t) => html`<button class="fila-gasto enlace" onClick=${() => setVer(t.id)}>
          <span>${t.tienda || nombreTipo(t.tipo)}<small class="meta otro-detalle">${fechaBonita(t.fecha)} · ${nombreTipo(t.tipo)}</small></span><b>${euros(Number(t.total ?? 0))}</b>
        </button>`)}
      </div>`}
      <button class="fila-gasto enlace fila-garantias" onClick=${() => setGarantias(true)}>
        <span>🛡 Garantías</span><b>${nGarantias ? `${nGarantias} ›` : 'Añadir ›'}</b>
      </button>
    </div>
    ${revisar && html`<${RevisarOtroGasto} almacen=${almacen} datos=${datos} sesion=${sesion} inicial=${revisar} onCerrar=${() => setRevisar(null)} />`}
    ${ver && html`<${VerOtroGasto} almacen=${almacen} datos=${datos} id=${ver} onCerrar=${() => setVer(null)}
      onVerGarantia=${(id) => { setVer(null); setGarantia(id); }} />`}
    ${garantias && html`<${Garantias} almacen=${almacen} datos=${datos} onCerrar=${() => setGarantias(false)}
      onVer=${(id) => setGarantia(id)} />`}
    ${garantia && html`<${VerGarantia} almacen=${almacen} datos=${datos} id=${garantia} onCerrar=${() => setGarantia(null)} />`}`;
}

/** Abre una garantía desde fuera del apartado (el aviso de arriba). */
export function VerGarantiaSuelta({ almacen, datos, id, onCerrar }) {
  return html`<${VerGarantia} almacen=${almacen} datos=${datos} id=${id} onCerrar=${onCerrar} />`;
}

function ChipsTipo({ valor, onCambio }) {
  return html`<div class="chips chips-envuelve">
    ${TIPOS_GASTO.map(([k, n, i]) => html`<button type="button" class="chip ${valor === k ? 'activo' : ''}" onClick=${() => onCambio(k)}>${i} ${n}</button>`)}
  </div>`;
}

/** Campos de una garantía: qué es y cuántos años. */
function CamposGarantia({ que, setQue, anios, setAnios, comprado }) {
  return html`
    <div class="fila-campo">
      <label class="meta" for="garantia-que">Qué es</label>
      <input id="garantia-que" maxlength="80" placeholder="Lavadora, móvil, freidora…" value=${que} onInput=${(e) => setQue(e.target.value)} />
    </div>
    <div class="fila-campo">
      <label class="meta" for="garantia-anios">Dura</label>
      <select id="garantia-anios" value=${anios} onChange=${(e) => setAnios(Number(e.target.value))}>
        ${ANIOS_GARANTIA.map((a) => html`<option value=${a}>${a} ${a === 1 ? 'año' : 'años'}</option>`)}
      </select>
    </div>
    ${comprado && html`<p class="texto-suave">Acaba el ${fechaBonita(sumarAnios(comprado, anios))}. Te avisamos un mes antes.</p>`}`;
}

/** Guarda la foto del tique (más pequeña) en la carpeta de la casa. */
async function guardarFoto(almacen, archivo) {
  const blob = await reducirFoto(archivo, 1600, 0.82);
  return almacen.motor.subirFoto(blob);
}

// ---------------------------------------------------------------------------
// Revisar un tique de otra tienda
// ---------------------------------------------------------------------------
function RevisarOtroGasto({ almacen, datos, sesion, inicial, onCerrar }) {
  const tiendas = useMemo(() => tiendasUsadas(datos.tiques), [datos.tiques]);
  const [tienda, setTienda] = useState(inicial.tienda ?? '');
  const [tipo, setTipo] = useState(inicial.tipo ?? tipoDeTienda(datos.tiques, inicial.tienda));
  const [fecha, setFecha] = useState(inicial.fecha ?? fechaISO());
  const [total, setTotal] = useState(inicial.total != null ? String(inicial.total).replace('.', ',') : '');
  const [conGarantia, setConGarantia] = useState(false);
  const [que, setQue] = useState('');
  const [anios, setAnios] = useState(3);
  const [archivo, setArchivo] = useState(inicial.archivo ?? null);
  const [guardando, setGuardando] = useState(false);
  const fotoRef = useRef(null);

  const cambiarTienda = (v) => {
    setTienda(v);
    const t = tipoDeTienda(datos.tiques, v) ?? tiendaDelTexto(v)?.tipo;
    if (t) setTipo(t);
  };
  const totalNum = leerImporte(total);
  const listo = tienda.trim() && tipo && totalNum != null && (!conGarantia || que.trim());

  const guardar = async () => {
    setGuardando(true);
    try {
      const foto_path = conGarantia && archivo ? await guardarFoto(almacen, archivo) : null;
      const [t] = await almacen.insertar('tiques', {
        supermercado_id: null, tipo, tienda: tienda.trim().slice(0, 80), fecha: `${fecha}T12:00:00`,
        total: totalNum, estado: 'revisado', foto_path,
      });
      if (conGarantia) {
        await almacen.insertar('garantias', {
          tique_id: t.id, que: que.trim().slice(0, 80), tienda: tienda.trim().slice(0, 80),
          comprado: fecha, hasta: sumarAnios(fecha, anios), foto_path,
        });
      }
      mostrarAviso(conGarantia ? `Guardado con garantía hasta ${fechaBonita(sumarAnios(fecha, anios))}.` : `Guardado: ${euros(totalNum)}.`);
      onCerrar();
    } catch (e) {
      console.error(e);
      mostrarAviso(`No se pudo guardar: ${e.message ?? e}`);
      setGuardando(false);
    }
  };

  return html`
    <${Hoja} titulo="Tique de otra tienda" onCerrar=${onCerrar}>
      <div class="fila-campo">
        <label class="meta" for="otro-tienda">Tienda</label>
        <input id="otro-tienda" list="otro-tiendas" maxlength="80" placeholder="Farmacia, Primark…" value=${tienda}
          onInput=${(e) => cambiarTienda(e.target.value)} />
        <datalist id="otro-tiendas">${tiendas.map((t) => html`<option value=${t} />`)}</datalist>
      </div>
      <div class="fila-campo">
        <input type="date" id="otro-fecha" value=${fecha} onInput=${(e) => setFecha(e.target.value)} aria-label="Fecha" />
        <input id="otro-total" inputmode="decimal" placeholder="Total €" value=${total} onInput=${(e) => setTotal(e.target.value)} aria-label="Total" />
      </div>
      <label class="meta">¿Qué es?</label>
      <${ChipsTipo} valor=${tipo} onCambio=${setTipo} />
      <label class="casilla">
        <input type="checkbox" id="otro-garantia" checked=${conGarantia} onChange=${(e) => setConGarantia(e.target.checked)} />
        Tiene garantía (guardamos la foto del tique)
      </label>
      ${conGarantia && html`
        <${CamposGarantia} que=${que} setQue=${setQue} anios=${anios} setAnios=${setAnios} comprado=${fecha} />
        ${archivo
          ? html`<p class="texto-suave">📎 Foto del tique lista para guardar.</p>`
          : html`<button class="boton secundario" onClick=${() => fotoRef.current.click()}>📷 Añadir foto del tique</button>`}
        <input ref=${fotoRef} type="file" accept="image/*" capture="environment" hidden onChange=${(e) => { setArchivo(e.target.files?.[0] ?? null); e.target.value = ''; }} />`}
      <div class="pie">
        <button class="boton grande" disabled=${guardando || !listo} onClick=${guardar}>${guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    <//>`;
}

function VerOtroGasto({ almacen, datos, id, onCerrar, onVerGarantia }) {
  const t = datos.tiques.find((x) => x.id === id);
  if (!t) return null;
  const gs = (datos.garantias ?? []).filter((g) => g.tique_id === id);
  return html`
    <${Hoja} titulo=${`${t.tienda || nombreTipo(t.tipo)} · ${fechaBonita(t.fecha)}`} onCerrar=${onCerrar}>
      <div class="filas">
        <div class="fila-gasto total"><span>Total</span><b>${euros(Number(t.total ?? 0))}</b></div>
      </div>
      <label class="meta">¿Qué es?</label>
      <${ChipsTipo} valor=${t.tipo} onCambio=${(v) => almacen.actualizar('tiques', id, { tipo: v })} />
      ${gs.map((g) => html`<button class="fila-gasto enlace" onClick=${() => onVerGarantia(g.id)}>
        <span>🛡 ${g.que}</span><b>hasta ${mesYAnio(g.hasta)} ›</b></button>`)}
      <div class="pie">
        <${BotonSeguro} texto="Borrar este gasto" pregunta=${gs.length ? '¿Borrar este gasto? La garantía no se borra.' : '¿Quieres borrar este gasto?'}
          onClick=${async () => { await almacen.borrar('tiques', id); onCerrar(); }} />
      </div>
    <//>`;
}

// ---------------------------------------------------------------------------
// Garantías
// ---------------------------------------------------------------------------
function FilaGarantia({ g, onVer }) {
  const etiqueta = g.dias < 0 ? html`<span class="etiqueta-g gris">acabó</span>`
    : g.dias <= 60 ? html`<span class="etiqueta-g pronto">${g.dias === 0 ? 'hoy' : fechaBonita(g.hasta).replace(/ \d{4}$/, '')}</span>`
    : html`<span class="etiqueta-g verde">hasta ${mesYAnio(g.hasta)}</span>`;
  return html`<button class="fila-gasto enlace" onClick=${() => onVer(g.id)}>
    <span>${g.que}<small class="meta"> · ${[g.tienda, mesYAnio(g.comprado)].filter(Boolean).join(' · ')}</small></span>${etiqueta}
  </button>`;
}

function Garantias({ almacen, datos, onCerrar, onVer }) {
  const [buscar, setBuscar] = useState('');
  const [nueva, setNueva] = useState(false);
  const q = buscar.trim().toLowerCase();
  const filtradas = (datos.garantias ?? []).filter((g) => !q || `${g.que} ${g.tienda ?? ''}`.toLowerCase().includes(q));
  const { pronto, vigentes, caducadas } = agruparGarantias(filtradas);
  const grupo = (titulo, lista) => lista.length > 0 && html`
    <h3 class="categoria">${titulo}</h3>
    <div class="filas">${lista.map((g) => html`<${FilaGarantia} g=${g} onVer=${onVer} />`)}</div>`;
  return html`
    <${Hoja} titulo="Garantías" onCerrar=${onCerrar}>
      ${(datos.garantias ?? []).length > 3 && html`<input id="buscar-garantia" type="search" placeholder="Buscar: lavadora, móvil…"
        value=${buscar} onInput=${(e) => setBuscar(e.target.value)} />`}
      ${!(datos.garantias ?? []).length && html`<p class="vacio">Aún no hay garantías. Al guardar el tique de algo que la tenga (la lavadora, el móvil…), marca «Tiene garantía» y aquí tendrás la foto del tique cuando la necesites.</p>`}
      ${grupo('Acaban pronto', pronto)}
      ${grupo('En garantía', vigentes)}
      ${grupo('Ya caducadas', caducadas)}
      <div class="pie">
        <button class="boton grande" onClick=${() => setNueva(true)}>+ Añadir una garantía</button>
      </div>
      ${nueva && html`<${NuevaGarantia} almacen=${almacen} onCerrar=${() => setNueva(false)} />`}
    <//>`;
}

/** Garantía sin tique guardado en Gastos (por ejemplo, algo comprado hace tiempo). */
function NuevaGarantia({ almacen, onCerrar }) {
  const [que, setQue] = useState('');
  const [tienda, setTienda] = useState('');
  const [comprado, setComprado] = useState(fechaISO());
  const [anios, setAnios] = useState(3);
  const [archivo, setArchivo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const fotoRef = useRef(null);
  const guardar = async () => {
    setGuardando(true);
    try {
      const foto_path = archivo ? await guardarFoto(almacen, archivo) : null;
      await almacen.insertar('garantias', {
        tique_id: null, que: que.trim().slice(0, 80), tienda: tienda.trim().slice(0, 80) || null,
        comprado, hasta: sumarAnios(comprado, anios), foto_path,
      });
      mostrarAviso('Garantía guardada.');
      onCerrar();
    } catch (e) {
      console.error(e);
      mostrarAviso(`No se pudo guardar: ${e.message ?? e}`);
      setGuardando(false);
    }
  };
  return html`
    <${Hoja} titulo="Nueva garantía" onCerrar=${onCerrar}>
      <${CamposGarantia} que=${que} setQue=${setQue} anios=${anios} setAnios=${setAnios} comprado=${comprado} />
      <div class="fila-campo">
        <label class="meta" for="garantia-tienda">Tienda</label>
        <input id="garantia-tienda" maxlength="80" value=${tienda} onInput=${(e) => setTienda(e.target.value)} />
      </div>
      <div class="fila-campo">
        <label class="meta" for="garantia-comprado">Comprado el</label>
        <input id="garantia-comprado" type="date" value=${comprado} onInput=${(e) => setComprado(e.target.value)} />
      </div>
      ${archivo ? html`<p class="texto-suave">📎 Foto del tique lista para guardar.</p>`
        : html`<button class="boton secundario" onClick=${() => fotoRef.current.click()}>📷 Foto del tique</button>`}
      <input ref=${fotoRef} type="file" accept="image/*" hidden onChange=${(e) => { setArchivo(e.target.files?.[0] ?? null); e.target.value = ''; }} />
      <div class="pie">
        <button class="boton grande" disabled=${guardando || !que.trim() || !comprado} onClick=${guardar}>${guardando ? 'Guardando…' : 'Guardar garantía'}</button>
      </div>
    <//>`;
}

function VerGarantia({ almacen, datos, id, onCerrar }) {
  const g = (datos.garantias ?? []).find((x) => x.id === id);
  const fotos = useFotos(almacen, [g?.foto_path]);
  const [subiendo, setSubiendo] = useState(false);
  const fotoRef = useRef(null);
  if (!g) return null;
  const dias = diasHasta(g.hasta);
  const ponerFoto = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setSubiendo(true);
    try {
      const ruta = await guardarFoto(almacen, archivo);
      await almacen.actualizar('garantias', id, { foto_path: ruta });
    } catch (err) {
      mostrarAviso(`No se pudo guardar la foto: ${err.message ?? err}`);
    } finally {
      setSubiendo(false);
    }
  };
  const url = g.foto_path ? fotos[g.foto_path] : null;
  return html`
    <${Hoja} titulo=${g.que} onCerrar=${onCerrar}>
      <p class=${dias < 0 ? 'texto-suave' : dias <= 60 ? 'aviso-garantia quieto' : 'texto-suave ok-garantia'}>
        ${dias < 0 ? `La garantía acabó el ${fechaBonita(g.hasta)}.`
          : dias === 0 ? 'La garantía acaba hoy.'
          : `En garantía hasta el ${fechaBonita(g.hasta)} (quedan ${dias} días).`}
      </p>
      <div class="filas">
        ${g.tienda && html`<div class="fila-gasto"><span>Tienda</span><b>${g.tienda}</b></div>`}
        <div class="fila-gasto"><span>Comprado</span><b>${fechaBonita(g.comprado)}</b></div>
      </div>
      ${url ? html`<a href=${url} target="_blank" rel="noopener"><img class="foto-tique" src=${url} alt=${`Tique de ${g.que}`} /></a>`
        : g.foto_path ? html`<p class="texto-suave">Cargando la foto…</p>`
        : html`<button class="boton secundario" disabled=${subiendo} onClick=${() => fotoRef.current.click()}>${subiendo ? 'Guardando…' : '📷 Añadir foto del tique'}</button>`}
      <input ref=${fotoRef} type="file" accept="image/*" hidden onChange=${ponerFoto} />
      ${url && html`<p class="texto-suave">Es lo que piden en la tienda para una reparación o una devolución. Tócala para verla en grande.</p>`}
      <div class="pie">
        <${BotonSeguro} texto="Borrar esta garantía" pregunta="¿Borrar esta garantía y la foto de su tique?"
          onClick=${async () => {
            const tiqueConFoto = datos.tiques.some((t) => t.foto_path && t.foto_path === g.foto_path);
            await almacen.borrar('garantias', id);
            if (g.foto_path && !tiqueConFoto) almacen.motor.borrarFoto(g.foto_path).catch(() => {});
            onCerrar();
          }} />
      </div>
    <//>`;
}
