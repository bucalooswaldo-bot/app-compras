import { html, render, useState, useEffect, useMemo, useRef } from '../vendor/preact-htm.js';
import { crearAlmacen, motorPrueba, motorSupabase } from './almacen.js';
import {
  fechaISO, sumarDias, nombreDia, formatoCantidad, aEntrada, deEntrada, UNIDADES_ENTRADA, pasoDespensa,
  escalar, ingredientesDeComida, faltas, agruparPorCategoria, buscarArticulo, normalizar, redondear,
} from './logica.js';
import { CATEGORIAS, ARTICULOS, RECETAS } from './recetas-inicio.js';
import {
  SUPERS, SUPERS_WEB, nombreSuper, entenderDictado, cantidadParaArticulo, unidadNueva, textoBusqueda, sugerir, calcularCesta,
  encaja, palabrasClave, precioUnidad, etiquetaUnidad, euros, AHORRO_MINIMO_PARA_REPARTIR,
} from './comparar.js';
import { crearCatalogo } from './catalogo.js';
import { leerTique, leerImporte, pagado, emparejarArticulo, inicioPeriodo, gastosPorPeriodo, ahorroPosible } from './tiques.js';
import { proponerMenu } from './menu.js';
import { reducirFoto, dibujoReceta } from './fotos.js';
import * as config from '../config.js';

// ---------------------------------------------------------------------------
// Utilidades de pantalla
// ---------------------------------------------------------------------------
let mostrarAviso = () => {};

function Aviso() {
  const [texto, setTexto] = useState(null);
  useEffect(() => {
    let t;
    mostrarAviso = (s) => { setTexto(s); clearTimeout(t); t = setTimeout(() => setTexto(null), 3500); };
  }, []);
  return texto ? html`<div class="aviso" role="status">${texto}</div>` : null;
}

function Hoja({ titulo, onCerrar, children }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onCerrar();
    document.addEventListener('keydown', esc);
    document.body.classList.add('sin-scroll');
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('sin-scroll'); };
  }, []);
  return html`
    <div class="fondo" onClick=${(e) => e.target === e.currentTarget && onCerrar()}>
      <div class="hoja" role="dialog" aria-label=${titulo}>
        <div class="hoja-cab">
          <h2>${titulo}</h2>
          <button class="icono" aria-label="Cerrar" onClick=${onCerrar}>✕</button>
        </div>
        <div class="hoja-cuerpo">${children}</div>
      </div>
    </div>`;
}

function Contador({ valor, min = 1, onCambio }) {
  return html`
    <div class="contador">
      <button type="button" aria-label="Menos" onClick=${() => onCambio(Math.max(min, valor - 1))}>−</button>
      <span>${valor}</span>
      <button type="button" aria-label="Más" onClick=${() => onCambio(valor + 1)}>+</button>
    </div>`;
}

/** Campo de cantidad con su unidad (g/kg, ml/l, ud). Devuelve la cantidad en unidad base. */
function CampoCantidad({ unidad, valor, onCambio, placeholder = 'Cantidad', autoFocus }) {
  const [inicialTexto, inicialUnidad] = aEntrada(valor, unidad);
  const [texto, setTexto] = useState(inicialTexto);
  const [ue, setUe] = useState(inicialUnidad);
  useEffect(() => { const [t, u] = aEntrada(valor, unidad); if (deEntrada(texto, ue) !== valor) { setTexto(t); setUe(u); } }, [valor, unidad]);
  const opciones = UNIDADES_ENTRADA[unidad] ?? UNIDADES_ENTRADA.ud;
  const cambiar = (t, u) => { setTexto(t); setUe(u); onCambio(deEntrada(t, u)); };
  return html`
    <div class="fila-campo">
      <input inputmode="decimal" placeholder=${placeholder} value=${texto} autoFocus=${autoFocus}
        onInput=${(e) => cambiar(e.target.value, ue)} />
      ${opciones.length > 1
        ? html`<select value=${ue} onChange=${(e) => cambiar(texto, e.target.value)}>
            ${opciones.map(([u]) => html`<option value=${u}>${u}</option>`)}
          </select>`
        : html`<span class="unidad">${opciones[0][0]}</span>`}
    </div>`;
}

/** Botón que pide un segundo toque antes de hacer algo que no se puede deshacer. */
function BotonSeguro({ texto, pregunta, onClick }) {
  const [armado, setArmado] = useState(false);
  useEffect(() => { if (!armado) return; const t = setTimeout(() => setArmado(false), 5000); return () => clearTimeout(t); }, [armado]);
  return html`<button class="enlace peligro" onClick=${() => (armado ? onClick() : setArmado(true))}>${armado ? pregunta : texto}</button>`;
}

const nombreArticulo = (datos, id) => datos.articulos.find((a) => a.id === id)?.nombre ?? '¿?';
const articulo = (datos, id) => datos.articulos.find((a) => a.id === id);

/** Busca un artículo por nombre o lo crea. */
async function obtenerArticulo(almacen, nombre, unidad = 'ud', categoria = 'Otros') {
  const existe = buscarArticulo(almacen.datos.articulos, nombre);
  if (existe) return existe;
  const [nuevo] = await almacen.insertar('articulos', { nombre: nombre.trim(), unidad, categoria });
  return nuevo;
}

/** Mete las recetas propuestas por la IA (sin repetir artículos ni recetas ya existentes). */
async function cargarRecetasInicio(almacen) {
  const d = almacen.datos;
  const nuevosArt = [];
  const porNombre = new Map(d.articulos.map((a) => [normalizar(a.nombre), a]));
  for (const [nombre, [unidad, categoria]] of Object.entries(ARTICULOS)) {
    if (!porNombre.has(normalizar(nombre))) {
      const a = { id: crypto.randomUUID(), nombre, unidad, categoria };
      nuevosArt.push(a); porNombre.set(normalizar(nombre), a);
    }
  }
  if (nuevosArt.length) await almacen.insertar('articulos', nuevosArt);
  const yaHay = new Set(d.recetas.map((r) => normalizar(r.nombre)));
  const recetas = [], ingredientes = [];
  for (const r of RECETAS) {
    if (yaHay.has(normalizar(r.nombre))) continue;
    const id = crypto.randomUUID();
    recetas.push({ id, nombre: r.nombre, raciones: r.raciones, tiempo_min: r.tiempo_min, pasos: r.pasos,
      etiquetas: r.etiquetas, favorita: false, origen: 'ia' });
    r.ingredientes.forEach(([nombre, cantidad], orden) => {
      ingredientes.push({ receta_id: id, articulo_id: porNombre.get(normalizar(nombre)).id, cantidad, orden });
    });
  }
  if (recetas.length) await almacen.insertar('recetas', recetas);
  if (ingredientes.length) await almacen.insertar('ingredientes', ingredientes);
  return recetas.length;
}

// ---------------------------------------------------------------------------
// Plan semanal
// ---------------------------------------------------------------------------
function PantallaPlan({ almacen, datos, sesion, abrirReceta }) {
  const hoy = fechaISO();
  const [semana, setSemana] = useState(0);
  const [elegir, setElegir] = useState(null); // { fecha, momento }
  const [proponer, setProponer] = useState(false);
  const inicio = sumarDias(hoy, semana * 7);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i));

  const cocinar = async (comida, hecho) => {
    const signo = hecho ? -1 : 1;
    for (const ing of ingredientesDeComida(datos, comida)) {
      if (datos.despensa.some((x) => x.articulo_id === ing.articulo_id)) {
        await almacen.sumarDespensa(ing.articulo_id, signo * ing.cantidad);
      }
    }
    await almacen.actualizar('plan', comida.id, { cocinado: hecho });
    mostrarAviso(hecho ? 'Hecho. Se ha descontado de la despensa.' : 'Deshecho. Se ha devuelto a la despensa.');
  };

  return html`
    <section>
      <div class="barra-semana">
        <button class="icono" aria-label="Semana anterior" onClick=${() => setSemana(semana - 1)}>‹</button>
        <strong>${semana === 0 ? 'Próximos 7 días' : `${nombreDia(dias[0], hoy)} – ${nombreDia(dias[6], hoy)}`}</strong>
        <button class="icono" aria-label="Semana siguiente" onClick=${() => setSemana(semana + 1)}>›</button>
      </div>
      ${datos.recetas.length === 0 && html`<p class="vacio">Primero carga o crea alguna receta en la pestaña Recetas.</p>`}
      ${datos.recetas.length > 0 && html`<button class="boton proponer" onClick=${() => setProponer(true)}>✨ Proponer el menú de estos 7 días</button>`}
      ${dias.map((fecha) => html`
        <div class="dia ${fecha === hoy ? 'hoy' : ''}">
          <h3>${nombreDia(fecha, hoy)}</h3>
          ${['comida', 'cena'].map((momento) => {
            const comidas = datos.plan.filter((p) => p.fecha === fecha && p.momento === momento);
            return html`
              <div class="momento">
                <span class="etiqueta-momento">${momento === 'comida' ? 'Comida' : 'Cena'}</span>
                <div class="comidas">
                  ${comidas.map((c) => {
                    const r = datos.recetas.find((x) => x.id === c.receta_id);
                    return html`
                      <div class="comida ${c.cocinado ? 'hecha' : ''}">
                        <button class="enlace" onClick=${() => r && abrirReceta(r.id, c.raciones)}>
                          ${r?.nombre ?? 'Receta borrada'} <small>· ${c.raciones} rac.</small>
                        </button>
                        <button class="chip ${c.cocinado ? 'activo' : ''}" title="Marcar como cocinado"
                          onClick=${() => cocinar(c, !c.cocinado)}>${c.cocinado ? '✓ Hecho' : 'Hecho'}</button>
                        <button class="icono peq" aria-label="Quitar del plan"
                          onClick=${() => almacen.borrar('plan', c.id)}>✕</button>
                      </div>`;
                  })}
                  <button class="anadir" onClick=${() => setElegir({ fecha, momento })}>+ Añadir</button>
                </div>
              </div>`;
          })}
        </div>`)}
      ${elegir && html`<${ElegirReceta} datos=${datos} titulo=${`${nombreDia(elegir.fecha, hoy)}, ${elegir.momento}`}
        onCerrar=${() => setElegir(null)}
        onElegir=${(receta, raciones) => {
          almacen.insertar('plan', { fecha: elegir.fecha, momento: elegir.momento, receta_id: receta.id, raciones, cocinado: false });
          guardarRaciones(raciones);
          setElegir(null);
        }} />`}
      ${proponer && html`<${ProponerSemana} almacen=${almacen} datos=${datos} sesion=${sesion} desde=${inicio}
        onCerrar=${() => setProponer(false)} />`}
    </section>`;
}

const leerRaciones = () => { try { return Number(localStorage.getItem('raciones-plan')) || null; } catch { return null; } };
const guardarRaciones = (n) => { try { localStorage.setItem('raciones-plan', String(n)); } catch { /* nada */ } };

function ElegirReceta({ datos, titulo, onCerrar, onElegir }) {
  const [buscar, setBuscar] = useState('');
  const [raciones, setRaciones] = useState(leerRaciones() ?? 2);
  const lista = datos.recetas
    .filter((r) => normalizar(r.nombre).includes(normalizar(buscar)) || r.etiquetas.some((e) => normalizar(e).includes(normalizar(buscar))))
    .sort((a, b) => (b.favorita - a.favorita) || a.nombre.localeCompare(b.nombre, 'es'));
  return html`
    <${Hoja} titulo=${`Añadir: ${titulo}`} onCerrar=${onCerrar}>
      <div class="fila-campo">
        <label>Raciones</label>
        <${Contador} valor=${raciones} onCambio=${setRaciones} />
      </div>
      <input type="search" placeholder="Buscar receta" value=${buscar} onInput=${(e) => setBuscar(e.target.value)} />
      <ul class="lista-simple">
        ${lista.map((r) => html`<li><button onClick=${() => onElegir(r, raciones)}>
          ${r.favorita ? '★ ' : ''}${r.nombre} <small>${r.tiempo_min ? `${r.tiempo_min} min` : ''}</small></button></li>`)}
      </ul>
    </${Hoja}>`;
}

// ---------------------------------------------------------------------------
// Recetas
// ---------------------------------------------------------------------------
/** Direcciones para ver las fotos de las recetas (se piden de una vez y se recuerdan). */
function useFotos(almacen, rutas) {
  const [urls, setUrls] = useState({});
  const clave = [...new Set(rutas.filter(Boolean))].sort().join('|');
  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    almacen.motor.urlsFotos(clave.split('|'))
      .then((u) => vivo && setUrls((prev) => ({ ...prev, ...u })))
      .catch((e) => console.error(e));
    return () => { vivo = false; };
  }, [clave]);
  return urls;
}

function Miniatura({ receta, url }) {
  return url
    ? html`<img class="miniatura" src=${url} alt="" loading="lazy" />`
    : html`<span class="miniatura sin-foto" aria-hidden="true">${dibujoReceta(receta)}</span>`;
}

function PantallaRecetas({ almacen, datos, abrirReceta, editarReceta }) {
  const [buscar, setBuscar] = useState('');
  const [etiqueta, setEtiqueta] = useState(null);
  const [favoritas, setFavoritas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const etiquetas = [...new Set(datos.recetas.flatMap((r) => r.etiquetas))].sort((a, b) => a.localeCompare(b, 'es'));
  const lista = datos.recetas
    .filter((r) => !favoritas || r.favorita)
    .filter((r) => !etiqueta || r.etiquetas.includes(etiqueta))
    .filter((r) => normalizar(r.nombre).includes(normalizar(buscar)))
    .sort((a, b) => (b.favorita - a.favorita) || a.nombre.localeCompare(b.nombre, 'es'));
  const fotos = useFotos(almacen, lista.map((r) => r.foto_path));

  const cargar = async () => {
    setCargando(true);
    const n = await cargarRecetasInicio(almacen);
    setCargando(false);
    mostrarAviso(n ? `${n} recetas añadidas` : 'Ya estaban todas');
  };

  return html`
    <section>
      <div class="fila-campo">
        <input type="search" placeholder="Buscar receta" value=${buscar} onInput=${(e) => setBuscar(e.target.value)} />
        <button class="boton" onClick=${() => editarReceta(null)}>+ Nueva</button>
      </div>
      <div class="chips">
        <button class="chip ${favoritas ? 'activo' : ''}" onClick=${() => setFavoritas(!favoritas)}>★ Favoritas</button>
        ${etiquetas.map((e) => html`<button class="chip ${etiqueta === e ? 'activo' : ''}"
          onClick=${() => setEtiqueta(etiqueta === e ? null : e)}>${e}</button>`)}
      </div>
      ${datos.recetas.length === 0 && html`
        <div class="vacio">
          <p>Todavía no hay recetas.</p>
          <button class="boton grande" disabled=${cargando} onClick=${cargar}>
            ${cargando ? 'Cargando…' : `Cargar ${RECETAS.length} recetas propuestas`}</button>
          <p><small>Cocina casera y canaria. Luego se pueden cambiar o borrar.</small></p>
        </div>`}
      <ul class="tarjetas">
        ${lista.map((r) => html`
          <li>
            <button class="tarjeta con-foto" onClick=${() => abrirReceta(r.id)}>
              <${Miniatura} receta=${r} url=${r.foto_path ? fotos[r.foto_path] : null} />
              <span class="texto-tarjeta">
                <strong>${r.favorita ? '★ ' : ''}${r.nombre}</strong>
                <small>${[r.tiempo_min && `${r.tiempo_min} min`, `${r.raciones} rac.`, ...r.etiquetas].filter(Boolean).join(' · ')}</small>
              </span>
            </button>
          </li>`)}
      </ul>
      ${datos.recetas.length > 0 && datos.recetas.length < RECETAS.length + 50 && html`
        <p class="pie"><button class="enlace" disabled=${cargando} onClick=${cargar}>Añadir las recetas propuestas que falten</button></p>`}
    </section>`;
}

function VerReceta({ almacen, datos, id, racionesIniciales, onCerrar, onEditar }) {
  const r = datos.recetas.find((x) => x.id === id);
  const [raciones, setRaciones] = useState(racionesIniciales ?? r?.raciones ?? 4);
  const [alPlan, setAlPlan] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const entradaFoto = useRef(null);
  const fotos = useFotos(almacen, [r?.foto_path]);
  if (!r) return null;
  const ingredientes = datos.ingredientes.filter((i) => i.receta_id === id).sort((a, b) => a.orden - b.orden);
  const urlFoto = r.foto_path ? fotos[r.foto_path] : null;

  const ponerFoto = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setSubiendo(true);
    try {
      const prueba = almacen.motor.modo === 'prueba';
      const blob = await reducirFoto(archivo, prueba ? 640 : 1280, prueba ? 0.7 : 0.8);
      const ruta = await almacen.motor.subirFoto(blob);
      const anterior = r.foto_path;
      await almacen.actualizar('recetas', id, { foto_path: ruta });
      if (anterior) almacen.motor.borrarFoto(anterior).catch(() => {});
      mostrarAviso('Foto guardada');
    } catch (err) {
      console.error(err);
      mostrarAviso(`No se pudo guardar la foto: ${err.message ?? err}`);
    }
    setSubiendo(false);
  };
  const quitarFoto = async () => {
    const anterior = r.foto_path;
    await almacen.actualizar('recetas', id, { foto_path: null });
    almacen.motor.borrarFoto(anterior).catch(() => {});
  };

  const borrar = async () => {
    await almacen.borrar('ingredientes', ingredientes.map((i) => i.id));
    await almacen.borrar('plan', datos.plan.filter((p) => p.receta_id === id).map((p) => p.id));
    await almacen.borrar('recetas', id);
    if (r.foto_path) almacen.motor.borrarFoto(r.foto_path).catch(() => {});
    onCerrar();
  };
  return html`
    <${Hoja} titulo=${r.nombre} onCerrar=${onCerrar}>
      <div class="foto-receta">
        ${urlFoto
          ? html`<img src=${urlFoto} alt=${`Foto de ${r.nombre}`} />`
          : html`<span class="sin-foto grande" aria-hidden="true">${r.foto_path ? '…' : dibujoReceta(r)}</span>`}
        <input ref=${entradaFoto} type="file" accept="image/*" hidden onChange=${ponerFoto} />
        <div class="acciones-foto">
          <button class="chip" disabled=${subiendo} onClick=${() => entradaFoto.current?.click()}>
            ${subiendo ? 'Guardando foto…' : r.foto_path ? '📷 Cambiar foto' : '📷 Añadir foto'}</button>
          ${r.foto_path && !subiendo && html`<${BotonSeguro} texto="Quitar foto" pregunta="Toca otra vez para quitarla" onClick=${quitarFoto} />`}
        </div>
      </div>
      <div class="acciones">
        <button class="chip ${r.favorita ? 'activo' : ''}" onClick=${() => almacen.actualizar('recetas', id, { favorita: !r.favorita })}>
          ${r.favorita ? '★ Favorita' : '☆ Favorita'}</button>
        <button class="chip" onClick=${() => setAlPlan(true)}>+ Al plan</button>
        <button class="chip" onClick=${() => onEditar(id)}>Editar</button>
      </div>
      <p class="meta">${[r.tiempo_min && `${r.tiempo_min} min`, ...r.etiquetas, r.origen === 'ia' ? 'Propuesta por la IA' : ''].filter(Boolean).join(' · ')}</p>
      <div class="fila-campo"><label>Raciones</label><${Contador} valor=${raciones} onCambio=${setRaciones} /></div>
      <h3>Ingredientes</h3>
      <ul class="ingredientes">
        ${ingredientes.map((i) => {
          const a = articulo(datos, i.articulo_id);
          const hay = datos.despensa.find((d) => d.articulo_id === i.articulo_id);
          const c = escalar(i.cantidad, r.raciones, raciones);
          return html`<li>
            <span>${a?.nombre}${i.nota ? html` <small>(${i.nota})</small>` : ''}</span>
            <span class="cant">${c == null ? 'al gusto' : formatoCantidad(c, a?.unidad)}
              ${hay && hay.cantidad > 0 && html`<small class="en-casa" title="En casa">🏠 ${formatoCantidad(hay.cantidad, a?.unidad)}</small>`}</span>
          </li>`;
        })}
      </ul>
      <h3>Preparación</h3>
      <div class="pasos">${r.pasos.split('\n').filter(Boolean).map((p) => html`<p>${p}</p>`)}</div>
      <p class="pie"><${BotonSeguro} texto="Borrar receta" pregunta="¿Seguro? También se quita del plan. Toca otra vez para borrar." onClick=${borrar} /></p>
      ${alPlan && html`<${ElegirDia} onCerrar=${() => setAlPlan(false)} onElegir=${(fecha, momento) => {
        almacen.insertar('plan', { fecha, momento, receta_id: id, raciones, cocinado: false });
        setAlPlan(false);
        mostrarAviso(`Añadida al plan: ${nombreDia(fecha)}, ${momento}`);
      }} />`}
    </${Hoja}>`;
}

function ElegirDia({ onCerrar, onElegir }) {
  const hoy = fechaISO();
  const dias = Array.from({ length: 14 }, (_, i) => sumarDias(hoy, i));
  return html`
    <${Hoja} titulo="¿Qué día?" onCerrar=${onCerrar}>
      <ul class="lista-simple">
        ${dias.map((f) => html`<li class="dia-elegir">
          <span>${nombreDia(f, hoy)}</span>
          <button class="chip" onClick=${() => onElegir(f, 'comida')}>Comida</button>
          <button class="chip" onClick=${() => onElegir(f, 'cena')}>Cena</button>
        </li>`)}
      </ul>
    </${Hoja}>`;
}

function EditarReceta({ almacen, datos, id, onCerrar }) {
  const original = id ? datos.recetas.find((r) => r.id === id) : null;
  const ingOriginales = id ? datos.ingredientes.filter((i) => i.receta_id === id).sort((a, b) => a.orden - b.orden) : [];
  const [f, setF] = useState({
    nombre: original?.nombre ?? '', raciones: original?.raciones ?? 4, tiempo_min: original?.tiempo_min ?? '',
    etiquetas: (original?.etiquetas ?? []).join(', '), pasos: original?.pasos ?? '',
  });
  const [ings, setIngs] = useState(ingOriginales.map((i) => {
    const a = articulo(datos, i.articulo_id);
    return { clave: i.id, nombre: a?.nombre ?? '', cantidad: i.cantidad, unidad: a?.unidad ?? 'ud', nota: i.nota ?? '' };
  }));
  const [guardando, setGuardando] = useState(false);
  const cambiarIng = (k, cambios) => setIngs(ings.map((x) => (x.clave === k ? { ...x, ...cambios } : x)));
  const nombreCambiado = (k, nombre) => {
    const a = buscarArticulo(datos.articulos, nombre);
    cambiarIng(k, a ? { nombre, unidad: a.unidad } : { nombre });
  };

  const guardar = async () => {
    if (!f.nombre.trim()) return mostrarAviso('Ponle un nombre a la receta');
    setGuardando(true);
    const valores = {
      nombre: f.nombre.trim(), raciones: Math.max(1, Number(f.raciones) || 1),
      tiempo_min: Number(f.tiempo_min) || null, pasos: f.pasos,
      etiquetas: f.etiquetas.split(',').map((s) => s.trim()).filter(Boolean),
    };
    let recetaId = id;
    if (id) await almacen.actualizar('recetas', id, valores);
    else [{ id: recetaId }] = await almacen.insertar('recetas', { ...valores, favorita: false, origen: 'manual' });
    await almacen.borrar('ingredientes', ingOriginales.map((i) => i.id));
    const filas = [];
    let orden = 0;
    for (const i of ings) {
      if (!i.nombre.trim()) continue;
      const a = await obtenerArticulo(almacen, i.nombre, i.unidad, 'Otros');
      filas.push({ receta_id: recetaId, articulo_id: a.id, cantidad: i.cantidad, nota: i.nota || null, orden: orden++ });
    }
    if (filas.length) await almacen.insertar('ingredientes', filas);
    setGuardando(false);
    onCerrar(recetaId);
  };

  return html`
    <${Hoja} titulo=${id ? 'Editar receta' : 'Nueva receta'} onCerrar=${() => onCerrar(id)}>
      <label>Nombre<input value=${f.nombre} onInput=${(e) => setF({ ...f, nombre: e.target.value })} /></label>
      <div class="dos">
        <label>Raciones<input inputmode="numeric" value=${f.raciones} onInput=${(e) => setF({ ...f, raciones: e.target.value })} /></label>
        <label>Minutos<input inputmode="numeric" value=${f.tiempo_min} onInput=${(e) => setF({ ...f, tiempo_min: e.target.value })} /></label>
      </div>
      <label>Etiquetas <small>(separadas por comas)</small>
        <input value=${f.etiquetas} placeholder="Cuchara, Rápida…" onInput=${(e) => setF({ ...f, etiquetas: e.target.value })} /></label>
      <h3>Ingredientes</h3>
      <datalist id="articulos-lista">${datos.articulos.map((a) => html`<option value=${a.nombre} />`)}</datalist>
      ${ings.map((i) => html`
        <div class="ing-editar">
          <input list="articulos-lista" placeholder="Ingrediente" value=${i.nombre} onInput=${(e) => nombreCambiado(i.clave, e.target.value)} />
          ${!buscarArticulo(datos.articulos, i.nombre) && i.nombre.trim() && html`
            <select aria-label="Se mide en" value=${i.unidad} onChange=${(e) => cambiarIng(i.clave, { unidad: e.target.value, cantidad: null })}>
              <option value="g">peso</option><option value="ml">líquido</option><option value="ud">unidades</option>
            </select>`}
          <${CampoCantidad} unidad=${i.unidad} valor=${i.cantidad} placeholder="Al gusto" onCambio=${(c) => cambiarIng(i.clave, { cantidad: c })} />
          <button class="icono peq" aria-label="Quitar ingrediente" onClick=${() => setIngs(ings.filter((x) => x.clave !== i.clave))}>✕</button>
        </div>`)}
      <button class="anadir" onClick=${() => setIngs([...ings, { clave: crypto.randomUUID(), nombre: '', cantidad: null, unidad: 'g', nota: '' }])}>+ Ingrediente</button>
      <label>Preparación<textarea rows="6" value=${f.pasos} onInput=${(e) => setF({ ...f, pasos: e.target.value })}></textarea></label>
      <button class="boton grande" disabled=${guardando} onClick=${guardar}>${guardando ? 'Guardando…' : 'Guardar'}</button>
    </${Hoja}>`;
}

// ---------------------------------------------------------------------------
// Despensa
// ---------------------------------------------------------------------------
function PantallaDespensa({ almacen, datos }) {
  const [buscar, setBuscar] = useState('');
  const [soloFaltan, setSoloFaltan] = useState(false);
  const [editar, setEditar] = useState(null); // articulo_id o 'nuevo'
  const filas = datos.despensa
    .filter((d) => normalizar(nombreArticulo(datos, d.articulo_id)).includes(normalizar(buscar)))
    .filter((d) => !soloFaltan || (d.minimo > 0 && d.cantidad < d.minimo));
  const faltanN = datos.despensa.filter((d) => d.minimo > 0 && d.cantidad < d.minimo).length;

  return html`
    <section>
      <div class="fila-campo">
        <input type="search" placeholder="Buscar en la despensa" value=${buscar} onInput=${(e) => setBuscar(e.target.value)} />
        <button class="boton" onClick=${() => setEditar('nuevo')}>+ Añadir</button>
      </div>
      <div class="chips">
        <button class="chip ${soloFaltan ? 'activo' : ''}" onClick=${() => setSoloFaltan(!soloFaltan)}>
          Se acaba${faltanN ? ` (${faltanN})` : ''}</button>
      </div>
      ${datos.despensa.length === 0 && html`<div class="vacio">
        <p>Apunta lo que hay en casa. Si le pones un <b>mínimo</b>, cuando baje de ahí aparecerá en la lista de la compra.</p>
        <p><small>Ejemplo: aceite, mínimo 1 l.</small></p></div>`}
      ${agruparPorCategoria(filas, datos.articulos).map(([cat, grupo]) => html`
        <h3 class="categoria">${cat}</h3>
        <ul class="filas">
          ${grupo.map((d) => {
            const a = articulo(datos, d.articulo_id);
            const paso = pasoDespensa(a.unidad, d.cantidad);
            const bajo = d.minimo > 0 && d.cantidad < d.minimo;
            return html`<li class=${bajo ? 'bajo' : ''}>
              <button class="enlace nombre" onClick=${() => setEditar(d.articulo_id)}>
                ${a.nombre}
                ${d.minimo > 0 && html`<small>mín. ${formatoCantidad(d.minimo, a.unidad)}</small>`}
              </button>
              <div class="contador">
                <button aria-label=${`Quitar ${paso}`} onClick=${() => almacen.sumarDespensa(a.id, -paso)}>−</button>
                <span>${formatoCantidad(d.cantidad, a.unidad)}</span>
                <button aria-label=${`Sumar ${paso}`} onClick=${() => almacen.sumarDespensa(a.id, paso)}>+</button>
              </div>
            </li>`;
          })}
        </ul>`)}
      ${editar && html`<${EditarDespensa} almacen=${almacen} datos=${datos} articuloId=${editar === 'nuevo' ? null : editar}
        onCerrar=${() => setEditar(null)} />`}
    </section>`;
}

function EditarDespensa({ almacen, datos, articuloId, onCerrar }) {
  const a0 = articuloId ? articulo(datos, articuloId) : null;
  const d0 = articuloId ? datos.despensa.find((d) => d.articulo_id === articuloId) : null;
  const [nombre, setNombre] = useState(a0?.nombre ?? '');
  const existente = a0 ?? buscarArticulo(datos.articulos, nombre);
  const [unidad, setUnidad] = useState(a0?.unidad ?? 'ud');
  const [categoria, setCategoria] = useState(a0?.categoria ?? 'Otros');
  const [cantidad, setCantidad] = useState(d0?.cantidad ?? null);
  const [minimo, setMinimo] = useState(d0?.minimo || null);
  const u = existente?.unidad ?? unidad;

  useEffect(() => { if (existente && !a0) setCategoria(existente.categoria); }, [existente?.id]);

  const guardar = async () => {
    if (!nombre.trim()) return mostrarAviso('Escribe el nombre');
    let art = existente;
    if (!art) art = await obtenerArticulo(almacen, nombre, unidad, categoria);
    else {
      const cambios = {};
      if (nombre.trim() !== art.nombre && a0) cambios.nombre = nombre.trim();
      if (categoria !== art.categoria) cambios.categoria = categoria;
      if (Object.keys(cambios).length) await almacen.actualizar('articulos', art.id, cambios);
    }
    await almacen.fijarDespensa(art.id, { cantidad: cantidad ?? 0, minimo: minimo ?? 0 });
    onCerrar();
  };
  const quitar = async () => {
    if (d0) await almacen.borrar('despensa', d0.id);
    onCerrar();
  };

  return html`
    <${Hoja} titulo=${a0 ? a0.nombre : 'Añadir a la despensa'} onCerrar=${onCerrar}>
      <datalist id="articulos-despensa">${datos.articulos.map((a) => html`<option value=${a.nombre} />`)}</datalist>
      <label>Producto<input list="articulos-despensa" value=${nombre} autoFocus=${!a0} onInput=${(e) => setNombre(e.target.value)} /></label>
      ${!existente && html`<label>Se mide en
        <select value=${unidad} onChange=${(e) => { setUnidad(e.target.value); setCantidad(null); setMinimo(null); }}>
          <option value="ud">unidades</option><option value="g">peso (g / kg)</option><option value="ml">líquido (ml / l)</option>
        </select></label>`}
      <label>Sección<select value=${categoria} onChange=${(e) => setCategoria(e.target.value)}>
        ${CATEGORIAS.map((c) => html`<option value=${c}>${c}</option>`)}</select></label>
      <label>Hay en casa</label>
      <${CampoCantidad} unidad=${u} valor=${cantidad} onCambio=${setCantidad} placeholder="0" />
      <label>Avisar cuando baje de <small>(opcional)</small></label>
      <${CampoCantidad} unidad=${u} valor=${minimo} onCambio=${setMinimo} placeholder="Sin mínimo" />
      <button class="boton grande" onClick=${guardar}>Guardar</button>
      ${d0 && html`<p class="pie"><button class="enlace peligro" onClick=${quitar}>Quitar de la despensa</button></p>`}
    </${Hoja}>`;
}

// ---------------------------------------------------------------------------
// Lista de la compra
// ---------------------------------------------------------------------------
const PLAZOS = [[3, '3 días'], [7, '1 semana'], [14, '2 semanas']];
const leerPlazo = () => { try { return Number(localStorage.getItem('plazo-lista')) || 7; } catch { return 7; } };

function PantallaLista({ almacen, datos, sesion }) {
  const hoy = fechaISO();
  const [plazo, setPlazo] = useState(leerPlazo());
  const [texto, setTexto] = useState('');
  const [verComprado, setVerComprado] = useState(true);
  const [editar, setEditar] = useState(null);
  const [comparar, setComparar] = useState(false);
  const previa = useMemo(() => (texto.trim() ? entenderDictado(texto, datos.articulos, marcasConocidas()) : []), [texto, datos.articulos]);
  const auto = faltas(datos, hoy, sumarDias(hoy, plazo - 1));
  const manual = datos.lista.filter((l) => !l.comprado);
  const comprado = datos.lista.filter((l) => l.comprado).sort((a, b) => (b.comprado_en ?? '').localeCompare(a.comprado_en ?? ''));
  const pendientes = [
    ...auto.map((f) => ({ ...f, tipo: 'auto', clave: `auto-${f.articulo_id}` })),
    ...manual.map((l) => ({ ...l, tipo: 'manual', clave: l.id })),
  ];

  const elegirPlazo = (p) => { setPlazo(p); try { localStorage.setItem('plazo-lista', String(p)); } catch { /* nada */ } };

  const anadir = async (e) => {
    e?.preventDefault();
    const frase = texto.trim();
    if (!frase) return;
    // "Necesito aceite, sal, tomate triturado y 2 kilos de papas" -> cinco cosas
    const cosas = entenderDictado(frase, datos.articulos, marcasConocidas());
    if (!cosas.length) return;
    const nombres = [];
    for (const c of cosas) {
      const a = c.articulo ?? await obtenerArticulo(almacen, c.nombre, unidadNueva(c), 'Otros');
      await almacen.insertar('lista', { articulo_id: a.id, cantidad: cantidadParaArticulo(c, a.unidad),
        marca: c.detalle, origen: 'manual', comprado: false });
      nombres.push(c.detalle ? `${a.nombre} (${c.detalle})` : a.nombre);
    }
    setTexto('');
    if (cosas.length > 1) mostrarAviso(`Añadido: ${nombres.join(', ')}`);
  };

  const comprar = async (f) => {
    const ahora = new Date().toISOString();
    const a = articulo(datos, f.articulo_id);
    let cantidad = f.cantidad;
    if (cantidad == null && a?.unidad === 'ud') cantidad = 1;
    if (f.tipo === 'auto') {
      await almacen.insertar('lista', { articulo_id: f.articulo_id, cantidad, origen: 'auto', comprado: true, comprado_en: ahora });
    } else {
      await almacen.actualizar('lista', f.id, { comprado: true, comprado_en: ahora, cantidad });
    }
    if (cantidad) await almacen.sumarDespensa(f.articulo_id, cantidad);
  };

  const deshacer = async (l) => {
    if (l.cantidad) await almacen.sumarDespensa(l.articulo_id, -l.cantidad);
    if (l.origen === 'auto') await almacen.borrar('lista', l.id);
    else await almacen.actualizar('lista', l.id, { comprado: false, comprado_en: null });
  };

  const vaciarComprado = () => almacen.borrar('lista', comprado.map((l) => l.id));

  return html`
    <section>
      <form class="fila-campo" onSubmit=${anadir}>
        <datalist id="articulos-compra">${datos.articulos.map((a) => html`<option value=${a.nombre} />`)}</datalist>
        <input list="articulos-compra" placeholder="Añadir (o dictar: leche, 2 kg de papas…)" value=${texto}
          onInput=${(e) => setTexto(e.target.value)} />
        <${BotonDictar} onTexto=${(t) => setTexto((x) => (x ? `${x}, ${t}` : t))} />
        <button class="boton" type="submit">Añadir</button>
      </form>
      ${previa.length > 1 && html`<p class="previa">Se añadirán ${previa.length}: ${previa.map((c) => c.detalle ? `${c.nombre} (${c.detalle})` : c.nombre).join(' · ')}</p>`}
      ${pendientes.length > 0 && html`<button class="boton grande comparar" onClick=${() => setComparar(true)}>💶 ¿Dónde sale más barato?</button>`}
      <div class="chips">
        <span class="chips-label">Recetas de:</span>
        ${PLAZOS.map(([p, t]) => html`<button class="chip ${plazo === p ? 'activo' : ''}" onClick=${() => elegirPlazo(p)}>${t}</button>`)}
      </div>
      ${pendientes.length === 0 && html`<div class="vacio"><p>No falta nada. 🎉</p>
        <p><small>La lista se llena sola con las recetas del plan y con lo que baje del mínimo en la despensa.</small></p></div>`}
      ${agruparPorCategoria(pendientes, datos.articulos).map(([cat, grupo]) => html`
        <h3 class="categoria">${cat}</h3>
        <ul class="filas compra">
          ${grupo.map((f) => {
            const a = articulo(datos, f.articulo_id);
            const motivo = f.tipo === 'manual' ? 'a mano'
              : [f.recetas.length && f.recetas.join(', '), f.bajoMinimo && 'se acaba'].filter(Boolean).join(' · ');
            return html`<li key=${f.clave}>
              <button class="marcar" aria-label=${`Comprado: ${a?.nombre}`} onClick=${() => comprar(f)}></button>
              <button class="enlace nombre" onClick=${() => f.tipo === 'manual' && setEditar(f)}>
                ${a?.nombre}${f.marca && html` <span class="detalle">${f.marca}</span>`}<small>${motivo}</small>
              </button>
              <span class="cant">${f.cantidad != null ? formatoCantidad(f.cantidad, a?.unidad) : ''}</span>
              ${f.tipo === 'manual' && html`<button class="icono peq" aria-label="Quitar de la lista" onClick=${() => almacen.borrar('lista', f.id)}>✕</button>`}
            </li>`;
          })}
        </ul>`)}
      ${comprado.length > 0 && html`
        <div class="comprado">
          <button class="enlace" onClick=${() => setVerComprado(!verComprado)}>
            ${verComprado ? '▾' : '▸'} Comprado (${comprado.length})</button>
          ${verComprado && html`
            <ul class="filas">
              ${comprado.map((l) => {
                const a = articulo(datos, l.articulo_id);
                return html`<li class="hecho">
                  <button class="marcar marcado" aria-label=${`Deshacer: ${a?.nombre}`} onClick=${() => deshacer(l)}>✓</button>
                  <button class="enlace nombre" onClick=${() => setEditar(l)}>${a?.nombre}<small>toca para cambiar la cantidad</small></button>
                  <span class="cant">${l.cantidad != null ? formatoCantidad(l.cantidad, a?.unidad) : ''}</span>
                </li>`;
              })}
            </ul>
            <p class="pie"><button class="enlace" onClick=${vaciarComprado}>Vaciar comprados</button></p>`}
        </div>`}
      ${editar && html`<${CantidadLista} almacen=${almacen} datos=${datos} fila=${editar} onCerrar=${() => setEditar(null)} />`}
      ${comparar && html`<${Comparar} almacen=${almacen} datos=${datos} sesion=${sesion} onCerrar=${() => setComparar(false)}
        items=${pendientes.map((f) => {
          const a = articulo(datos, f.articulo_id);
          return { clave: f.clave, articulo_id: f.articulo_id, nombre: a?.nombre ?? '¿?', unidad: a?.unidad ?? 'ud',
            cantidad: f.cantidad ?? null, detalle: f.marca ?? null };
        })} />`}
    </section>`;
}

function CantidadLista({ almacen, datos, fila, onCerrar }) {
  const a = articulo(datos, fila.articulo_id);
  const [cantidad, setCantidad] = useState(fila.cantidad);
  const [marca, setMarca] = useState(fila.marca ?? '');
  const guardar = async () => {
    if (fila.comprado) {
      const delta = (cantidad ?? 0) - (fila.cantidad ?? 0);
      if (delta) await almacen.sumarDespensa(fila.articulo_id, delta);
    }
    await almacen.actualizar('lista', fila.id, { cantidad, marca: marca.trim() || null });
    onCerrar();
  };
  return html`
    <${Hoja} titulo=${a?.nombre ?? ''} onCerrar=${onCerrar}>
      <label>${fila.comprado ? 'Cantidad comprada' : 'Cantidad'}</label>
      <${CampoCantidad} unidad=${a?.unidad} valor=${cantidad} onCambio=${setCantidad} placeholder="Sin indicar" autoFocus />
      ${fila.comprado && html`<p><small>La despensa se ajusta con la diferencia.</small></p>`}
      ${!fila.comprado && html`<label>Marca o tipo (opcional)
        <input placeholder="Por ejemplo: Puleva, sin lactosa…" value=${marca} onInput=${(e) => setMarca(e.target.value)} /></label>
        <p><small>Al comparar precios solo se buscará eso. Vacío = la más barata.</small></p>`}
      <button class="boton grande" onClick=${guardar}>Guardar</button>
    </${Hoja}>`;
}

// ---------------------------------------------------------------------------
// Dictar y comparar precios
// ---------------------------------------------------------------------------
const Reconocer = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;

/** Botón de micrófono (Chrome en Android lo permite). Lo dicho se pasa al campo de texto. */
function BotonDictar({ onTexto }) {
  const [oyendo, setOyendo] = useState(false);
  const rec = useRef(null);
  if (!Reconocer) return null;
  const pulsar = () => {
    if (oyendo) { rec.current?.stop(); return; }
    const r = new Reconocer();
    r.lang = 'es-ES';
    r.interimResults = false;
    r.onresult = (e) => onTexto(e.results[0][0].transcript);
    r.onerror = (e) => {
      if (e.error === 'not-allowed') mostrarAviso('Hay que permitir el micrófono para dictar.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') mostrarAviso('No se pudo dictar. Prueba con el micrófono del teclado.');
    };
    r.onend = () => setOyendo(false);
    rec.current = r;
    try { r.start(); setOyendo(true); } catch { setOyendo(false); }
  };
  return html`<button type="button" class="icono microfono ${oyendo ? 'oyendo' : ''}" aria-label=${oyendo ? 'Parar' : 'Dictar'}
    onClick=${pulsar}>${oyendo ? '⏹' : '🎤'}</button>`;
}

// HiperDino ya pone el tamaño en el nombre ("leche entera 1 l"); Mercadona lo da aparte ("Brik 1 l").
const formatoDe = (p) => (p.supermercado_id === 'hiperdino' ? null : p.formato);

let catalogoGlobal = null;
const obtenerCatalogo = (sesion) => (catalogoGlobal ??= crearCatalogo(sesion.cliente));

/** Marcas que ya conoce la app (para entender "leche puleva" al dictar). */
function marcasConocidas() {
  if (!catalogoGlobal) return [];
  return [...new Set([...catalogoGlobal.productos.values()].map((p) => p.marca).filter(Boolean))];
}

/** Filtro de "no me gusta" (un producto o una marca entera). */
function filtroGustos(datos) {
  const fuera = datos.preferencias.filter((p) => p.tipo === 'no_gusta');
  return (p) => !fuera.some((x) => (x.producto_id && x.producto_id === p.id)
    || (x.marca && p.marca && normalizar(x.marca) === normalizar(p.marca)));
}

/** Productos de un súper que valen para una cosa de la lista. */
function candidatosDe(datos, catalogo, item, s) {
  const vale = filtroGustos(datos);
  let enlaces = datos.equivalencias
    .filter((e) => e.articulo_id === item.articulo_id)
    .map((e) => ({ e, p: catalogo.productos.get(e.producto_id) }))
    .filter(({ p }) => p && p.supermercado_id === s && p.activo !== false && Number.isFinite(p.precio) && vale(p));
  if (item.detalle) {
    const claves = palabrasClave(item.detalle);
    enlaces = enlaces.filter(({ p }) => encaja(p, claves));
  } else {
    // Si ella eligió uno a mano, manda lo suyo.
    const aMano = enlaces.filter(({ e }) => !e.auto);
    if (aMano.length) enlaces = aMano;
  }
  return enlaces.map(({ p }) => p);
}

function Comparar({ almacen, datos, sesion, items, onCerrar }) {
  const [estado, setEstado] = useState(sesion ? 'cargando' : 'prueba');
  const [mensaje, setMensaje] = useState('');
  const [vista, setVista] = useState('productos');
  const [elegir, setElegir] = useState(null);
  const catalogo = sesion ? obtenerCatalogo(sesion) : null;

  /** Carga los productos enlazados y busca en las webs lo que aún no tenga producto. */
  const completar = async () => {
    try {
      setEstado('cargando');
      await catalogo.cargar(almacen.datos.equivalencias.map((e) => e.producto_id));
      await catalogo.cargarLidl();
      const tareas = [];
      for (const item of items) {
        for (const s of SUPERS_WEB) {
          if (candidatosDe(almacen.datos, catalogo, item, s).length) continue;
          tareas.push({ item, s, texto: textoBusqueda(item.nombre, item.detalle, s) });
        }
      }
      const enlazar = async (lista) => {
        const nuevos = [];
        for (const t of lista) {
          const sug = sugerir(catalogo.buscado(t.s, t.texto) ?? [], t.item, filtroGustos(almacen.datos));
          const ya = (x) => x.articulo_id === t.item.articulo_id && x.producto_id === sug.id;
          if (sug && !almacen.datos.equivalencias.some(ya) && !nuevos.some(ya)) {
            nuevos.push({ articulo_id: t.item.articulo_id, producto_id: sug.id, auto: true });
          }
        }
        if (nuevos.length) await almacen.insertar('equivalencias', nuevos);
      };
      // Lo ya buscado en esta sesión no se vuelve a pedir a los súper.
      await enlazar(tareas.filter((t) => catalogo.buscado(t.s, t.texto)));
      const porTexto = new Map();
      for (const t of tareas.filter((t) => !catalogo.buscado(t.s, t.texto))) {
        const k = t.texto.toLowerCase();
        if (!porTexto.has(k)) porTexto.set(k, { texto: t.texto, supers: [], tareas: [] });
        const c = porTexto.get(k);
        if (!c.supers.includes(t.s)) c.supers.push(t.s);
        c.tareas.push(t);
      }
      const consultas = [...porTexto.values()];
      for (let i = 0; i < consultas.length; i += 4) {
        setEstado('buscando');
        setMensaje(`Buscando en Mercadona e HiperDino… ${i} de ${consultas.length}`);
        const tanda = consultas.slice(i, i + 4);
        await catalogo.buscar(tanda.map(({ texto, supers }) => ({ texto, supers })));
        await enlazar(tanda.flatMap((c) => c.tareas));
      }
      setEstado('listo');
    } catch (e) {
      console.error(e);
      setMensaje(e.message ?? String(e));
      setEstado('error');
    }
  };
  useEffect(() => { if (sesion) completar(); }, []);

  if (!sesion) {
    return html`<${Hoja} titulo="Comparar precios" onCerrar=${onCerrar}>
      <p>Comparar precios solo funciona en la versión compartida (con cuenta), porque hay que consultar las webs de los súper.</p>
    </${Hoja}>`;
  }

  const cesta = calcularCesta(items.map((item) => ({
    ...item,
    candidatos: Object.fromEntries(SUPERS.map(([s]) => [s, candidatosDe(datos, catalogo, item, s)])),
  })));
  // Columnas: Mercadona e HiperDino siempre; Lidl cuando hay precios de sus tiques.
  const columnas = SUPERS.filter(([s]) => SUPERS_WEB.includes(s) || cesta.lineas.some((l) => l.porSuper[s]));
  const sueltos = columnas.filter(([s]) => !cesta.activos.includes(s) && cesta.lineas.some((l) => l.porSuper[s]));
  const rejilla = `grid-template-columns: minmax(0, 1.1fr) repeat(${columnas.length}, minmax(0, 1fr))`;
  const elegidos = cesta.lineas.flatMap((l) => Object.values(l.porSuper).map((o) => o.producto));
  const masViejo = elegidos.reduce((m, p) => (p.visto_en && (!m || p.visto_en < m) ? p.visto_en : m), null);
  const dias = masViejo ? Math.floor((Date.now() - new Date(masViejo).getTime()) / 86_400_000) : null;
  const r = cesta.recomendacion;
  const ocupado = estado === 'cargando' || estado === 'buscando';
  const lineaDe = (item) => cesta.lineas.find((l) => l.item.clave === item.clave);

  return html`
    <${Hoja} titulo="¿Dónde sale más barato?" onCerrar=${onCerrar}>
      ${ocupado && html`<p class="cargando">${estado === 'cargando' ? 'Cargando precios…' : mensaje}</p>`}
      ${estado === 'error' && html`<p class="mensaje">No se pudo completar la búsqueda: ${mensaje}
        <br /><button class="enlace" onClick=${completar}>Reintentar</button></p>`}

      ${r.tipo !== 'sin_datos' && html`
        <div class="veredicto ${r.tipo}">
          ${r.tipo === 'repartir'
            ? html`<b>Conviene repartir: ahorras ${euros(cesta.ahorro)}</b>
                <span>${SUPERS.filter(([s]) => cesta.reparto[s].length).map(([s, n]) => `${n}: ${euros(cesta.totalReparto[s])}`).join(' + ')}</span>`
            : html`<b>Mejor en ${nombreSuper(r.supermercado)}: ${euros(cesta.totales[r.supermercado])}</b>
                <span>${SUPERS.filter(([s]) => s !== r.supermercado && cesta.activos.includes(s)).map(([s, n]) => `${n}: ${euros(cesta.totales[s])}`).join(' · ')}
                  ${r.diferencia > 0 && ` (${euros(r.diferencia)} más)`}</span>
                <span>${cesta.ahorro > 0
                  ? `Repartiendo entre los dos ahorrarías ${euros(cesta.ahorro)}: no compensa ir a dos (menos de ${AHORRO_MINIMO_PARA_REPARTIR} €).`
                  : 'Repartiendo no se ahorra nada.'}</span>`}
          <small>Comparando ${cesta.comunes} de ${items.length} cosas, las que tienen precio en ${cesta.activos.map(nombreSuper).join(' y ')}.</small>
          ${sueltos.map(([s, n]) => html`<small>${n}: solo ${cesta.lineas.filter((l) => l.porSuper[s]).length} precios de vuestros tiques; cuenta en "Si repartes".</small>`)}
        </div>`}
      ${r.tipo === 'sin_datos' && !ocupado && html`<p class="vacio">Aún no hay precios para comparar. Toca una cosa para elegir su producto.</p>`}

      <div class="chips">
        <button class="chip ${vista === 'productos' ? 'activo' : ''}" onClick=${() => setVista('productos')}>Por producto</button>
        <button class="chip ${vista === 'reparto' ? 'activo' : ''}" onClick=${() => setVista('reparto')}>Si repartes</button>
      </div>

      ${vista === 'productos' ? html`
        <div class="tabla-precios">
          <div class="tp-cab" style=${rejilla}><span></span>${columnas.map(([, n]) => html`<span>${n}</span>`)}</div>
          ${cesta.lineas.map((l) => html`
            <button class="tp-fila" style=${rejilla} onClick=${() => setElegir(l.item)}>
              <span class="tp-nombre">${l.item.nombre}${l.item.detalle && html` <span class="detalle">${l.item.detalle}</span>`}
                ${l.item.cantidad != null && html`<small>${formatoCantidad(l.item.cantidad, l.item.unidad)}</small>`}</span>
              ${columnas.map(([s]) => {
                const o = l.porSuper[s];
                if (!o) return html`<span class="tp-precio nada">${ocupado ? '…' : 'no está'}</span>`;
                return html`<span class="tp-precio ${l.mejor === s && Object.keys(l.porSuper).length > 1 ? 'mejor' : ''}">
                  <b>${o.aprox ? '≈ ' : ''}${euros(o.total)}</b>
                  <small>${o.envases > 1 ? `${o.envases} × ` : ''}${o.producto.nombre}${formatoDe(o.producto) ? `, ${formatoDe(o.producto)}` : ''}</small>
                </span>`;
              })}
            </button>`)}
        </div>
        <p class="pie"><small>Toca una fila para cambiar el producto o la marca. ≈ = calculado por unidades, puede variar.</small></p>
      ` : html`
        ${SUPERS.map(([s, n]) => cesta.reparto[s].length > 0 && html`
          <h3 class="categoria">En ${n}: ${euros(cesta.totalReparto[s])}</h3>
          <ul class="filas">
            ${cesta.reparto[s].map((l) => html`<li>
              <button class="enlace nombre" onClick=${() => setElegir(l.item)}>${l.item.nombre}
                <small>${l.porSuper[s].envases > 1 ? `${l.porSuper[s].envases} × ` : ''}${l.porSuper[s].producto.nombre}</small></button>
              <span class="cant">${l.porSuper[s].aprox ? '≈ ' : ''}${euros(l.porSuper[s].total)}</span>
            </li>`)}
          </ul>`)}
      `}

      ${cesta.sinPrecio.length > 0 && !ocupado && html`<p class="nota">Sin producto todavía: ${cesta.sinPrecio.map((l) => l.item.nombre).join(', ')}. Tócalo para buscarlo con otras palabras.</p>`}
      <p class="meta">Precios de las webs de Mercadona e HiperDino para Gran Canaria${dias != null ? (dias < 1 ? ', de hoy' : `, de hace ${dias} día${dias === 1 ? '' : 's'} como mucho`) : ''}.
        Se actualizan solos cada semana. Lidl llegará con los tiques.</p>

      ${elegir && html`<${ElegirProducto} almacen=${almacen} datos=${datos} catalogo=${catalogo} item=${elegir}
        linea=${lineaDe(elegir)} onCerrar=${() => setElegir(null)}
        onCambio=${(rebuscar) => { setElegir(null); if (rebuscar) completar(); }} />`}
    </${Hoja}>`;
}

function ElegirProducto({ almacen, datos, catalogo, item, linea, onCerrar, onCambio }) {
  const [s, setS] = useState(linea?.mejor ?? SUPERS[0][0]);
  const [texto, setTexto] = useState(() => textoBusqueda(item.nombre, item.detalle, s));
  const [buscado, setBuscado] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setTexto(textoBusqueda(item.nombre, item.detalle, s)); setBuscado(null); }, [s]);

  const vale = filtroGustos(datos);
  const enlaces = datos.equivalencias.filter((e) => e.articulo_id === item.articulo_id)
    .filter((e) => catalogo.productos.get(e.producto_id)?.supermercado_id === s);
  const elegidoAMano = enlaces.some((e) => !e.auto);
  const actual = linea?.porSuper[s]?.producto;
  const esLidl = s === 'lidl';
  const resultados = (esLidl
    ? catalogo.deLidl(texto)
    : buscado ?? catalogo.buscado(s, texto) ?? enlaces.map((e) => catalogo.productos.get(e.producto_id)))
    .filter(Boolean);

  const buscar = async (e) => {
    e?.preventDefault();
    if (!texto.trim()) return;
    setOcupado(true);
    try {
      await catalogo.buscar([{ texto: texto.trim(), supers: [s] }]);
      setBuscado(catalogo.buscado(s, texto.trim()) ?? []);
    } catch (err) {
      mostrarAviso(`No se pudo buscar: ${err.message}`);
    }
    setOcupado(false);
  };
  const elegir = async (p) => {
    await almacen.borrar('equivalencias', enlaces.map((e) => e.id));
    await almacen.insertar('equivalencias', { articulo_id: item.articulo_id, producto_id: p.id, auto: false });
    mostrarAviso(`${item.nombre} en ${nombreSuper(s)}: ${p.nombre}`);
    onCambio(false);
  };
  const queElijaLaApp = async () => {
    await almacen.borrar('equivalencias', enlaces.map((e) => e.id));
    onCambio(true);
  };
  const noMeGusta = async (p) => {
    await almacen.insertar('preferencias', p.marca
      ? { tipo: 'no_gusta', marca: p.marca, producto_id: null, articulo_id: null }
      : { tipo: 'no_gusta', producto_id: p.id, marca: null, articulo_id: null });
    mostrarAviso(p.marca ? `No se propondrá nada de ${p.marca}` : 'No se propondrá este producto');
    if (actual?.id === p.id) onCambio(true);
  };
  const disgustos = datos.preferencias.filter((x) => x.tipo === 'no_gusta');

  return html`
    <${Hoja} titulo=${item.detalle ? `${item.nombre} (${item.detalle})` : item.nombre} onCerrar=${onCerrar}>
      <div class="chips">
        ${SUPERS.map(([id, n]) => html`<button class="chip ${s === id ? 'activo' : ''}" onClick=${() => setS(id)}>${n}</button>`)}
      </div>
      <p>${actual
        ? html`Ahora: <b>${actual.nombre}</b> ${formatoDe(actual) ? `(${formatoDe(actual)})` : ''} · ${euros(actual.precio)}
            <br /><small>${elegidoAMano ? 'Elegido por ti.' : 'Elegido por la app: el más barato de los que encajan.'}</small>`
        : 'Todavía no hay producto en este súper.'}</p>
      ${elegidoAMano && html`<p><button class="enlace" onClick=${queElijaLaApp}>Que elija la app (el más barato)</button></p>`}
      ${esLidl && html`<p><small>Lidl no vende en su web: aquí salen los productos de vuestros tiques de Lidl.</small></p>`}
      <form class="fila-campo" onSubmit=${esLidl ? (e) => e.preventDefault() : buscar}>
        <input type="search" value=${texto} onInput=${(e) => { setTexto(e.target.value); setBuscado(null); }} />
        ${!esLidl && html`<button class="boton" disabled=${ocupado}>${ocupado ? '…' : 'Buscar'}</button>`}
      </form>
      <ul class="productos">
        ${resultados.map((p) => {
          const gusta = vale(p);
          return html`<li class=${gusta ? '' : 'descartado'}>
            ${p.imagen_url ? html`<img src=${p.imagen_url} alt="" loading="lazy" referrerpolicy="no-referrer" />` : html`<span class="sin-foto"></span>`}
            <div class="info">
              <span>${p.nombre}</span>
              <small>${[formatoDe(p), Number.isFinite(precioUnidad(p)) && `${precioUnidad(p).toFixed(2).replace('.', ',')} ${etiquetaUnidad(p.unidad)}`].filter(Boolean).join(' · ')}</small>
              ${gusta && p.marca && html`<button class="enlace peq" onClick=${() => noMeGusta(p)}>No me gusta ${p.marca}</button>`}
              ${!gusta && html`<small>No le gusta</small>`}
            </div>
            <div class="precio">
              <b>${euros(p.precio)}</b>
              ${p.precio_anterior && html`<s>${euros(p.precio_anterior)}</s>`}
              ${gusta && (actual?.id === p.id && elegidoAMano
                ? html`<span class="elegido">✓</span>`
                : html`<button class="boton peq" onClick=${() => elegir(p)}>Elegir</button>`)}
            </div>
          </li>`;
        })}
        ${resultados.length === 0 && html`<li class="vacio">Busca con otras palabras (por ejemplo, la marca).</li>`}
      </ul>
      ${disgustos.length > 0 && html`
        <h3>No le gusta</h3>
        <div class="chips">${disgustos.map((x) => html`<button class="chip" onClick=${() => almacen.borrar('preferencias', x.id)}>
          ${x.marca ?? catalogo.productos.get(x.producto_id)?.nombre ?? 'producto'} ✕</button>`)}</div>
        <p><small>Toca una para volver a permitirla.</small></p>`}
    </${Hoja}>`;
}

// ---------------------------------------------------------------------------
// Ajustes / casa
// ---------------------------------------------------------------------------
function PantallaAjustes({ almacen, sesion, onCerrar }) {
  const [casa, setCasa] = useState(null);
  useEffect(() => {
    if (!sesion) return;
    sesion.cliente.from('hogares').select('nombre,codigo').eq('id', sesion.hogarId).single()
      .then(({ data }) => setCasa(data));
  }, []);
  const borrarPrueba = () => {
    almacen.motor.borrarTodo();
    almacen.cargar();
    onCerrar();
  };
  return html`
    <${Hoja} titulo="Ajustes" onCerrar=${onCerrar}>
      ${sesion ? html`
        <h3>Casa</h3>
        <p><b>${casa?.nombre ?? '…'}</b></p>
        <p>Para que otra persona use la misma lista, que cree su cuenta y ponga este código:</p>
        <p class="codigo">${casa?.codigo ?? '…'}</p>
        <h3>Cuenta</h3>
        <p>${sesion.email}</p>
        <button class="boton" onClick=${() => sesion.cliente.auth.signOut().then(() => location.reload())}>Cerrar sesión</button>
      ` : html`
        <h3>Modo prueba</h3>
        <p>Los datos se guardan solo en este dispositivo y no se comparten. Sirve para probar la app.</p>
        <${BotonSeguro} texto="Borrar datos de prueba" pregunta="¿Seguro? Se borra todo lo de este móvil. Toca otra vez." onClick=${borrarPrueba} />
      `}
      <h3>Instalar en el móvil</h3>
      <p>En Chrome para Android: menú ⋮ → <b>Añadir a pantalla de inicio</b> (o <b>Instalar aplicación</b>).</p>
      <p class="meta">Versión ${config.VERSION}</p>
    </${Hoja}>`;
}

// ---------------------------------------------------------------------------
// Gastos: tiques por foto o captura, resumen y ahorro
// ---------------------------------------------------------------------------
const OCR = new URL('../vendor/ocr/', import.meta.url).href;
let lectorOCR = null;

function cargarScript(src) {
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el lector de tiques'));
    document.head.appendChild(s);
  });
}

/** Lee el texto de una foto en el propio móvil (sin mandar la foto a nadie). */
async function leerTextoDeImagen(fichero, onProgreso) {
  if (!window.Tesseract) await cargarScript(`${OCR}tesseract.min.js`);
  lectorOCR ??= window.Tesseract.createWorker('spa', 1, {
    workerPath: `${OCR}worker.min.js`, corePath: OCR, langPath: OCR, gzip: true, workerBlobURL: false,
    logger: (m) => m.status === 'recognizing text' && onProgreso?.(Math.round(m.progress * 100)),
  });
  const lector = await lectorOCR;
  // Fotos grandes: a 2000 px de ancho como mucho (más rápido y lee igual de bien)
  const bmp = await createImageBitmap(fichero);
  const escala = Math.min(1, 2000 / bmp.width);
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  const ctx = lienzo.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.3)';
  ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  const { data } = await lector.recognize(lienzo);
  return data.text;
}

const NOMBRE_PERIODO = { semana: 'Semana', mes: 'Mes', anio: 'Año' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function tituloPeriodo(inicio, periodo) {
  const [a, m, d] = inicio.split('-').map(Number);
  if (periodo === 'anio') return String(a);
  if (periodo === 'mes') return `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${a}`;
  return `Semana del ${d} de ${MESES[m - 1]}`;
}
const nombreDe = (s) => (s && s !== 'otro' ? nombreSuper(s) : 'Otro');
const fechaCorta = (iso) => { const [a, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${a}`; };

/** Precio de hoy de un envase de ese artículo en un súper (el más barato de los enlazados). */
function precioEnSuper(datos, catalogo) {
  return (articulo_id, s) => {
    if (!catalogo) return null;
    const ps = candidatosDe(datos, catalogo, { articulo_id }, s).map((p) => p.precio).filter(Number.isFinite);
    return ps.length ? Math.min(...ps) : null;
  };
}

function PantallaGastos({ almacen, datos, sesion }) {
  const [periodo, setPeriodo] = useState(() => { try { return localStorage.getItem('periodo-gastos') || 'mes'; } catch { return 'mes'; } });
  const [leyendo, setLeyendo] = useState(null); // null | número (progreso) | 'cargando'
  const [revisar, setRevisar] = useState(null);
  const [ver, setVer] = useState(null);
  const [preciosListos, setPreciosListos] = useState(false);
  const fichero = useRef(null);
  const catalogo = sesion ? obtenerCatalogo(sesion) : null;

  useEffect(() => { try { localStorage.setItem('periodo-gastos', periodo); } catch { /* nada */ } }, [periodo]);
  useEffect(() => {
    if (!catalogo) return;
    Promise.all([catalogo.cargar(datos.equivalencias.map((e) => e.producto_id)), catalogo.cargarLidl()])
      .then(() => setPreciosListos(true)).catch((e) => console.error(e));
  }, [datos.equivalencias.length, datos.tiques.length]);

  const tiques = [...datos.tiques].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const grupos = gastosPorPeriodo(tiques, periodo);
  const actual = grupos[0];
  const ahorro = useMemo(() => {
    if (!actual) return null;
    const ids = new Set(tiques.filter((t) => inicioPeriodo(t.fecha, periodo) === actual.inicio).map((t) => t.id));
    const superDe = new Map(tiques.map((t) => [t.id, t.supermercado_id]));
    const lineas = datos.tique_lineas.filter((l) => ids.has(l.tique_id)).map((l) => ({ ...l, supermercado_id: superDe.get(l.tique_id) }));
    return ahorroPosible(lineas, precioEnSuper(datos, catalogo), SUPERS.map(([s]) => s));
  }, [datos, periodo, preciosListos]);

  const elegirFoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      setLeyendo('cargando');
      const texto = await leerTextoDeImagen(f, setLeyendo);
      const leido = leerTique(texto);
      if (!leido.lineas.length) mostrarAviso('No he podido leer productos en la foto. Puedes escribirlos a mano.');
      setRevisar(leido);
    } catch (err) {
      console.error(err);
      mostrarAviso(`No se pudo leer el tique: ${err.message ?? err}`);
    } finally {
      setLeyendo(null);
    }
  };

  return html`
    <section>
      <div class="acciones-gastos">
        <button class="boton grande" disabled=${leyendo != null} onClick=${() => fichero.current.click()}>
          ${leyendo == null ? '📷 Añadir tique' : leyendo === 'cargando' ? 'Preparando el lector…' : `Leyendo el tique… ${leyendo}%`}
        </button>
        <input ref=${fichero} type="file" accept="image/*" hidden onChange=${elegirFoto} />
        <button class="enlace" onClick=${() => setRevisar({ supermercado: null, fecha: null, total: null, lineas: [] })}>o escribirlo a mano</button>
      </div>
      <p class="texto-suave">Haz una foto al tique de papel o una captura del tique de Lidl Plus. Se lee en el móvil; la foto no se guarda.</p>

      <div class="chips periodos">
        ${Object.entries(NOMBRE_PERIODO).map(([p, n]) => html`
          <button class="chip ${periodo === p ? 'activo' : ''}" onClick=${() => setPeriodo(p)}>${n}</button>`)}
      </div>

      ${!grupos.length && html`<p class="vacio">Aún no hay tiques. Añade el primero y aquí verás lo que gastáis por semana, mes y año.</p>`}
      ${actual && html`
        <div class="tarjeta-gasto">
          <span class="meta">${tituloPeriodo(actual.inicio, periodo)}</span>
          <strong class="cifra">${euros(actual.total)}</strong>
          <span class="meta">${actual.tiques} ${actual.tiques === 1 ? 'tique' : 'tiques'}</span>
          <div class="por-super">
            ${Object.entries(actual.porSuper).sort((a, b) => b[1] - a[1]).map(([s, v]) => html`
              <div><span>${nombreDe(s)}</span><b>${euros(v)}</b></div>`)}
          </div>
          ${ahorro && (ahorro.ahorro >= 0.5
            ? html`<p class="ahorro">Comprando cada cosa donde hoy está más barata, habríais pagado <b>${euros(ahorro.ahorro)}</b> menos.</p>
                <ul class="lista-simple ahorro-detalle">
                  ${ahorro.detalle.slice(0, 5).map((x) => html`<li>${x.texto}: ${euros(x.pagado)} → ${euros(x.precio)} en ${nombreSuper(x.en)}</li>`)}
                </ul>`
            : ahorro.pagado > 0 && html`<p class="ahorro bien">Buena compra: con los precios de hoy no habríais ahorrado casi nada en otro súper.</p>`)}
        </div>`}

      ${grupos.length > 1 && html`
        <h3 class="categoria">Anteriores</h3>
        <div class="filas">
          ${grupos.slice(1, 13).map((g) => html`
            <div class="fila-gasto"><span>${tituloPeriodo(g.inicio, periodo)}</span><b>${euros(g.total)}</b></div>`)}
        </div>`}

      ${tiques.length > 0 && html`
        <h3 class="categoria">Tiques</h3>
        <div class="filas">
          ${tiques.slice(0, 40).map((t) => html`
            <button class="fila-gasto enlace" onClick=${() => setVer(t.id)}>
              <span>${fechaCorta(t.fecha)} · ${nombreDe(t.supermercado_id)}</span><b>${euros(t.total ?? 0)}</b>
            </button>`)}
        </div>`}

      ${revisar && html`<${RevisarTique} almacen=${almacen} datos=${datos} sesion=${sesion} leido=${revisar}
        onCerrar=${() => setRevisar(null)} />`}
      ${ver && html`<${VerTique} almacen=${almacen} datos=${datos} id=${ver} onCerrar=${() => setVer(null)} />`}
    </section>`;
}

function RevisarTique({ almacen, datos, sesion, leido, onCerrar }) {
  const [superId, setSuper] = useState(leido.supermercado ?? 'lidl');
  const [fecha, setFecha] = useState(leido.fecha ?? fechaISO());
  const [total, setTotal] = useState(leido.total != null ? String(leido.total).replace('.', ',') : '');
  const [lineas, setLineas] = useState(() => leido.lineas.map((l) => ({
    ...l, clave: nuevaClave(), articulo_id: emparejarArticulo(l.texto, datos.articulos)?.id ?? '',
  })));
  const [marcar, setMarcar] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const articulos = useMemo(() => [...datos.articulos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [datos.articulos]);

  const cambiar = (clave, cambios) => setLineas(lineas.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  const suma = redondear(lineas.reduce((s, l) => s + pagado(l), 0));
  const totalNum = total.trim() ? leerImporte(total) : null;
  const descuadre = totalNum != null && Math.abs(totalNum - suma) > 0.05;

  const guardar = async () => {
    const validas = lineas.filter((l) => l.texto.trim() && Number.isFinite(l.importe));
    const t = totalNum ?? suma;
    const filas = validas.map(({ clave, ...l }) => ({
      texto: l.texto.trim(), cantidad: l.cantidad ?? null, precio_unidad: l.precio_unidad ?? null,
      importe: l.importe, descuento: l.descuento ?? 0, kg: !!l.kg, articulo_id: l.articulo_id || null,
    }));
    setGuardando(true);
    try {
      if (sesion) {
        const { error } = await sesion.cliente.rpc('guardar_tique', {
          p_hogar: sesion.hogarId, p_super: superId || null, p_fecha: `${fecha}T12:00:00`, p_total: t, p_lineas: filas,
        });
        if (error) throw error;
        await almacen.cargar();
      } else {
        const [tique] = await almacen.insertar('tiques', { supermercado_id: superId || null, fecha: `${fecha}T12:00:00`, total: t, estado: 'revisado' });
        await almacen.insertar('tique_lineas', filas.map((f) => ({ ...f, tique_id: tique.id })));
      }
      if (marcar) {
        const comprados = new Set(filas.map((f) => f.articulo_id).filter(Boolean));
        for (const l of almacen.datos.lista.filter((x) => !x.comprado && comprados.has(x.articulo_id))) {
          await almacen.actualizar('lista', l.id, { comprado: true });
        }
      }
      mostrarAviso(`Tique guardado: ${euros(t)}.`);
      onCerrar();
    } catch (e) {
      console.error(e);
      mostrarAviso(`No se pudo guardar: ${e.message ?? e}`);
      setGuardando(false);
    }
  };

  return html`
    <${Hoja} titulo="Revisar el tique" onCerrar=${onCerrar}>
      <div class="fila-campo">
        <select value=${superId} onChange=${(e) => setSuper(e.target.value)} aria-label="Supermercado">
          ${SUPERS.map(([s, n]) => html`<option value=${s}>${n}</option>`)}
          <option value="">Otro</option>
        </select>
        <input type="date" value=${fecha} onInput=${(e) => setFecha(e.target.value)} aria-label="Fecha" />
      </div>
      <div class="fila-campo">
        <label class="meta" for="total-tique">Total del tique</label>
        <input id="total-tique" inputmode="decimal" placeholder=${String(suma).replace('.', ',')} value=${total}
          onInput=${(e) => setTotal(e.target.value)} />
      </div>
      <p class=${descuadre ? 'texto-suave aviso-suave' : 'texto-suave'}>
        Suma de las líneas: ${euros(suma)}${descuadre ? ` · no cuadra con el total (${euros(totalNum)}): revisa si falta o sobra algo.` : ''}
      </p>
      <div class="lineas-tique">
        ${lineas.map((l) => html`
          <div class="linea-tique">
            <input class="lt-texto" value=${l.texto} aria-label="Producto" onInput=${(e) => cambiar(l.clave, { texto: e.target.value })} />
            <input class="lt-importe" inputmode="decimal" aria-label="Importe" value=${String(l.importe).replace('.', ',')}
              onChange=${(e) => cambiar(l.clave, { importe: leerImporte(e.target.value) ?? 0 })} />
            <button class="icono peq" aria-label="Quitar línea" onClick=${() => setLineas(lineas.filter((x) => x.clave !== l.clave))}>✕</button>
            <select class="lt-articulo" value=${l.articulo_id} aria-label="Es de la lista…" onChange=${(e) => cambiar(l.clave, { articulo_id: e.target.value })}>
              <option value="">— sin enlazar —</option>
              ${articulos.map((a) => html`<option value=${a.id}>${a.nombre}</option>`)}
            </select>
            ${(l.cantidad > 1 || l.kg || l.descuento > 0) && html`<small class="meta">
              ${l.kg ? `${formatoCantidad(l.cantidad * 1000, 'g')}` : l.cantidad > 1 ? `${l.cantidad} × ${euros(l.precio_unidad ?? l.importe / l.cantidad)}` : ''}
              ${l.descuento > 0 ? ` · descuento ${euros(l.descuento)}` : ''}</small>`}
          </div>`)}
        <button class="anadir" onClick=${() => setLineas([...lineas, { clave: nuevaClave(), texto: '', importe: 0, descuento: 0, cantidad: null, articulo_id: '' }])}>+ Añadir línea</button>
      </div>
      <label class="marcar"><input type="checkbox" checked=${marcar} onChange=${(e) => setMarcar(e.target.checked)} />
        Tachar de la lista lo que ya está comprado</label>
      ${superId === 'lidl' && html`<p class="nota">Los precios de este tique se usarán para comparar Lidl con los otros súper.</p>`}
      <div class="pie">
        <button class="boton grande" disabled=${guardando || !lineas.length} onClick=${guardar}>${guardando ? 'Guardando…' : 'Guardar tique'}</button>
      </div>
    <//>`;
}

let contadorClaves = 0;
const nuevaClave = () => `l${++contadorClaves}`;

function VerTique({ almacen, datos, id, onCerrar }) {
  const t = datos.tiques.find((x) => x.id === id);
  if (!t) return null;
  const lineas = datos.tique_lineas.filter((l) => l.tique_id === id);
  return html`
    <${Hoja} titulo=${`${nombreDe(t.supermercado_id)} · ${fechaCorta(t.fecha)}`} onCerrar=${onCerrar}>
      <div class="filas">
        ${lineas.map((l) => html`
          <div class="fila-gasto">
            <span>${l.texto}${l.articulo_id ? html` <small class="meta">· ${nombreArticulo(datos, l.articulo_id)}</small>` : ''}</span>
            <b>${euros(pagado(l))}</b>
          </div>`)}
        <div class="fila-gasto total"><span>Total</span><b>${euros(t.total ?? 0)}</b></div>
      </div>
      <div class="pie">
        <${BotonSeguro} texto="Borrar este tique" pregunta="¿Seguro? Toca otra vez para borrarlo"
          onClick=${async () => { await almacen.borrar('tiques', id); onCerrar(); }} />
      </div>
    <//>`;
}

// ---------------------------------------------------------------------------
// Proponer el menú de la semana
// ---------------------------------------------------------------------------
function ProponerSemana({ almacen, datos, sesion, desde, onCerrar }) {
  const [ofertas, setOfertas] = useState(new Set());
  const [azar, setAzar] = useState(0);
  const [quitadas, setQuitadas] = useState(new Set());
  const hoy = fechaISO();
  const inicio = desde < hoy ? hoy : desde;

  useEffect(() => {
    if (!sesion) return;
    const catalogo = obtenerCatalogo(sesion);
    catalogo.cargar(datos.equivalencias.map((e) => e.producto_id)).then(() => {
      const rebajados = new Set([...catalogo.productos.values()]
        .filter((p) => p.precio_anterior && p.precio && p.precio < p.precio_anterior).map((p) => p.id));
      setOfertas(new Set(datos.equivalencias.filter((e) => rebajados.has(e.producto_id)).map((e) => e.articulo_id)));
    }).catch((e) => console.error(e));
  }, []);

  const propuesta = useMemo(() => proponerMenu(datos, {
    desde: inicio, dias: 7, raciones: leerRaciones() ?? 2, ofertas,
    azar: azar === 0 ? () => 0.5 : Math.random,
  }), [azar, ofertas]);
  const elegidas = propuesta.filter((p) => !quitadas.has(`${p.fecha}|${p.momento}`));

  const aceptar = async () => {
    await almacen.insertar('plan', elegidas.map(({ motivo, ...p }) => ({ ...p, cocinado: false })));
    mostrarAviso(`${elegidas.length} comidas añadidas al plan. Lo que falte sale en la Lista.`);
    onCerrar();
  };

  return html`
    <${Hoja} titulo="Menú propuesto" onCerrar=${onCerrar}>
      ${!datos.recetas.length ? html`<p class="vacio">Primero carga o crea alguna receta en la pestaña Recetas.</p>`
        : !propuesta.length ? html`<p class="vacio">Esta semana ya tiene todas las comidas y cenas puestas.</p>`
        : html`
          <p class="texto-suave">Elegido con lo que hay en casa${ofertas.size ? ', lo que está de oferta' : ''} y sin repetir lo de los últimos días. Quita lo que no os apetezca.</p>
          <div class="filas">
            ${propuesta.map((p) => {
              const k = `${p.fecha}|${p.momento}`;
              const fuera = quitadas.has(k);
              const r = datos.recetas.find((x) => x.id === p.receta_id);
              return html`
                <div class="propuesta ${fuera ? 'fuera' : ''}">
                  <div>
                    <small class="meta">${nombreDia(p.fecha, hoy)} · ${p.momento === 'comida' ? 'Comida' : 'Cena'}</small>
                    <div>${r?.nombre}</div>
                    ${p.motivo && html`<small class="meta">${p.motivo}</small>`}
                  </div>
                  <button class="icono peq" aria-label=${fuera ? 'Volver a poner' : 'Quitar'}
                    onClick=${() => { const s = new Set(quitadas); fuera ? s.delete(k) : s.add(k); setQuitadas(s); }}>${fuera ? '↺' : '✕'}</button>
                </div>`;
            })}
          </div>
          <div class="pie">
            <button class="boton" onClick=${() => { setQuitadas(new Set()); setAzar(azar + 1); }}>🔀 Otra propuesta</button>
            <button class="boton grande" disabled=${!elegidas.length} onClick=${aceptar}>Añadir ${elegidas.length} al plan</button>
          </div>`}
    <//>`;
}

// ---------------------------------------------------------------------------
// App principal
// ---------------------------------------------------------------------------
const PESTANAS = [['plan', 'Plan', '📅'], ['recetas', 'Recetas', '📖'], ['despensa', 'Despensa', '🏠'], ['lista', 'Lista', '🛒'], ['gastos', 'Gastos', '💶']];

function App({ almacen, sesion }) {
  const [datos, setDatos] = useState(almacen.datos);
  const [pestana, setPestana] = useState(() => { try { return localStorage.getItem('pestana') || 'lista'; } catch { return 'lista'; } });
  const [receta, setReceta] = useState(null); // { id, raciones }
  const [editando, setEditando] = useState(undefined); // undefined = cerrado, null = nueva, id = editar
  const [ajustes, setAjustes] = useState(false);

  useEffect(() => { setDatos(almacen.datos); return almacen.escuchar(setDatos); }, []);
  useEffect(() => { try { localStorage.setItem('pestana', pestana); } catch { /* nada */ } window.scrollTo(0, 0); }, [pestana]);

  const hoy = fechaISO();
  const nLista = useMemo(() => faltas(datos, hoy, sumarDias(hoy, leerPlazo() - 1)).length
    + datos.lista.filter((l) => !l.comprado).length, [datos, pestana]);

  const props = {
    almacen, datos, sesion,
    abrirReceta: (id, raciones) => setReceta({ id, raciones }),
    editarReceta: (id) => setEditando(id),
  };
  return html`
    <header class="cabecera">
      <h1>${PESTANAS.find((p) => p[0] === pestana)[1]}</h1>
      ${!sesion && html`<span class="modo-prueba">Prueba</span>`}
      <button class="icono" aria-label="Ajustes" onClick=${() => setAjustes(true)}>⚙</button>
    </header>
    <main>
      ${!almacen.cargado ? html`<p class="vacio">Cargando…</p>`
        : pestana === 'plan' ? html`<${PantallaPlan} ...${props} />`
        : pestana === 'recetas' ? html`<${PantallaRecetas} ...${props} />`
        : pestana === 'despensa' ? html`<${PantallaDespensa} ...${props} />`
        : pestana === 'gastos' ? html`<${PantallaGastos} ...${props} />`
        : html`<${PantallaLista} ...${props} />`}
    </main>
    <nav class="pestanas">
      ${PESTANAS.map(([id, nombre, ico]) => html`
        <button class=${pestana === id ? 'activa' : ''} aria-current=${pestana === id ? 'page' : null} onClick=${() => setPestana(id)}>
          <span class="ico">${ico}${id === 'lista' && nLista > 0 && html`<b class="globo">${nLista}</b>`}</span>${nombre}
        </button>`)}
    </nav>
    ${receta && html`<${VerReceta} ...${props} id=${receta.id} racionesIniciales=${receta.raciones}
      onCerrar=${() => setReceta(null)} onEditar=${(id) => { setReceta(null); setEditando(id); }} />`}
    ${editando !== undefined && html`<${EditarReceta} ...${props} id=${editando}
      onCerrar=${(id) => { setEditando(undefined); if (id) setReceta({ id }); }} />`}
    ${ajustes && html`<${PantallaAjustes} almacen=${almacen} sesion=${sesion} onCerrar=${() => setAjustes(false)} />`}
    <${Aviso} />`;
}

// ---------------------------------------------------------------------------
// Entrada, cuenta y casa (solo en modo compartido)
// ---------------------------------------------------------------------------
function Entrar({ cliente }) {
  const [modo, setModo] = useState('entrar');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    setOcupado(true); setMsg('');
    const { data, error } = modo === 'entrar'
      ? await cliente.auth.signInWithPassword({ email, password: clave })
      : await cliente.auth.signUp({ email, password: clave });
    setOcupado(false);
    if (error) return setMsg(traducirError(error.message));
    if (modo === 'crear' && !data.session) setMsg('Cuenta creada. Revisa tu correo para confirmarla y luego entra aquí.');
  };
  return html`
    <div class="portada">
      <h1>🛒 Compras de casa</h1>
      <form onSubmit=${enviar}>
        <label>Correo<input type="email" autocomplete="email" required value=${email} onInput=${(e) => setEmail(e.target.value)} /></label>
        <label>Contraseña<input type="password" autocomplete=${modo === 'entrar' ? 'current-password' : 'new-password'}
          required minlength="6" value=${clave} onInput=${(e) => setClave(e.target.value)} /></label>
        <button class="boton grande" disabled=${ocupado}>${modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}</button>
      </form>
      ${msg && html`<p class="mensaje">${msg}</p>`}
      <p><button class="enlace" onClick=${() => { setModo(modo === 'entrar' ? 'crear' : 'entrar'); setMsg(''); }}>
        ${modo === 'entrar' ? 'No tengo cuenta: crear una' : 'Ya tengo cuenta: entrar'}</button></p>
    </div>`;
}

function traducirError(m) {
  if (/Invalid login/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'Falta confirmar el correo (revisa tu bandeja de entrada).';
  if (/already registered/i.test(m)) return 'Ese correo ya tiene cuenta. Entra con él.';
  if (/Password should be/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/Código no válido/.test(m)) return 'Ese código no existe. Revísalo.';
  return m;
}

function ElegirCasa({ cliente, onListo }) {
  const [nombre, setNombre] = useState('Casa');
  const [codigo, setCodigo] = useState('');
  const [msg, setMsg] = useState('');
  const crear = async () => {
    const { data, error } = await cliente.rpc('crear_hogar', { p_nombre: nombre });
    if (error) return setMsg(traducirError(error.message));
    onListo(data);
  };
  const unirse = async (e) => {
    e.preventDefault();
    const { data, error } = await cliente.rpc('unirse_hogar', { p_codigo: codigo });
    if (error) return setMsg(traducirError(error.message));
    onListo(data);
  };
  return html`
    <div class="portada">
      <h1>Tu casa</h1>
      <p>Crea la casa para empezar:</p>
      <div class="fila-campo">
        <input aria-label="Nombre de la casa" value=${nombre} onInput=${(e) => setNombre(e.target.value)} />
        <button class="boton" onClick=${crear}>Crear casa</button>
      </div>
      <p><small>¿Otra persona ya creó la casa con su propia cuenta? Pon el código que ve en ⚙:</small></p>
      <form class="fila-campo" onSubmit=${unirse}>
        <input placeholder="Código (6 letras)" value=${codigo} onInput=${(e) => setCodigo(e.target.value)} />
        <button class="boton" disabled=${codigo.trim().length < 6}>Unirme</button>
      </form>
      ${msg && html`<p class="mensaje">${msg}</p>`}
      <p><button class="enlace" onClick=${() => cliente.auth.signOut().then(() => location.reload())}>Cerrar sesión</button></p>
    </div>`;
}

async function arrancarSupabase(raiz) {
  const cliente = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
  const pintar = (vista) => render(vista, raiz);

  const conSesion = async (session) => {
    const { data, error } = await cliente.from('hogar_miembros').select('hogar_id').eq('user_id', session.user.id).limit(1);
    if (error) { pintar(html`<p class="vacio">No se pudo conectar: ${error.message}</p>`); return; }
    const entrar = async (hogarId) => {
      const motor = motorSupabase(cliente, hogarId);
      const almacen = crearAlmacen(motor);
      almacen.onError = (e) => mostrarAviso(`No se pudo guardar: ${e.message ?? e}`);
      pintar(html`<${App} almacen=${almacen} sesion=${{ cliente, hogarId, email: session.user.email }} />`);
      await almacen.cargar();
      motor.escucharCambios(() => almacen.cargar());
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && almacen.cargar());
    };
    if (data.length) entrar(data[0].hogar_id);
    else pintar(html`<${ElegirCasa} cliente=${cliente} onListo=${entrar} />`);
  };

  const { data: { session } } = await cliente.auth.getSession();
  if (session) conSesion(session);
  else pintar(html`<${Entrar} cliente=${cliente} />`);
  cliente.auth.onAuthStateChange((evento, s) => { if (evento === 'SIGNED_IN' && !session) location.reload(); });
}

async function arrancarPrueba(raiz) {
  const almacen = crearAlmacen(motorPrueba());
  render(html`<${App} almacen=${almacen} sesion=${null} />`, raiz);
  await almacen.cargar();
}

const raiz = document.getElementById('app');
raiz.textContent = '';
const prueba = new URLSearchParams(location.search).has('prueba') || config.MODO === 'prueba' || !config.SUPABASE_URL;
(prueba ? arrancarPrueba(raiz) : arrancarSupabase(raiz)).catch((e) => {
  console.error(e);
  raiz.textContent = `Error al arrancar: ${e.message}`;
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
