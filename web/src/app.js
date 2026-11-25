import { html, render, useState, useEffect, useMemo, useRef } from '../vendor/preact-htm.js';
import { crearAlmacen, motorPrueba, motorSupabase } from './almacen.js';
import {
  fechaISO, sumarDias, nombreDia, formatoCantidad, aEntrada, deEntrada, UNIDADES_ENTRADA, pasoDespensa,
  escalar, ingredientesDeComida, faltas, estaBajo, avisoDe, camposAviso, tieneAviso, noHay, esDescarte, descarteVigente, pendienteManual, pendienteHoy, tengoTodo, enCasa, sugerirCompra, MOMENTOS, nombreMomento, agruparPorCategoria, iconoPasillo, buscarArticulo, normalizar, redondear,
} from './logica.js';
import { CATEGORIAS, ARTICULOS, RECETAS } from './recetas-inicio.js';
import {
  SUPERS, SUPERS_WEB, nombreSuper, entenderDictado, pareceFrase, cantidadParaArticulo, unidadNueva, textoBusqueda, sugerir, calcularCesta,
  encaja, palabrasClave, precioUnidad, etiquetaUnidad, euros, AHORRO_MINIMO_PARA_REPARTIR,
} from './comparar.js';
import { crearCatalogo } from './catalogo.js';
import { CADENAS, ponerSupers, claveDeNombre } from './supers.js';
import {
  leerTique, leerImporte, pagado, emparejarArticulo, inicioPeriodo, gastosPorPeriodo, ahorroPosible, gastoPorCategoria, textoCSV,
  tiqueRepetido, lineasQueSobran, cotejarTique,
} from './tiques.js';
import { proponerMenu } from './menu.js';
import { barrasPorSuper, comparaConAnterior } from './ofertas.js';
import { reducirFoto, dibujoReceta, fotoDeVideo, fotoDeFotograma, portadaDeCaptura } from './fotos.js';
import { entenderIngredientes, adivinarCategoria } from './ingredientes.js';
import { entenderReceta, textoPorColumnas, juntarLecturas, tituloPorTamano, numerarPasos } from './receta-texto.js';
import { prepararVideo, megas } from './video.js';
import { PantallaInicio } from './inicio.js';
import { PantallaPlan } from './planificador.js';
import { Apariencia, aplicarApariencia, AjustesAvisos } from './apariencia.js';
import { entenderConsumo, cantidadGastada } from './consumo.js';
import { textoReceta, textoLista, tiemposDePaso, reloj, duracion, aDescontar, pasosDe, encabezadoPaso } from './cocina.js';
import { superProbable, nombreSencillo, elegirArticulo, cantidadASumar, seccionDe, nombreDeEtiqueta, fichaDeOpenFoodFacts } from './foto-producto.js';
import * as config from '../config.js';
import { iniciarAtras, useAtras } from './atras.js';
import { RecetarioApp, useRecetario, delRecetario } from './recetario-vista.js';
import { esDeLaCasa, guardarDelRecetario, ponerClienteRecetario } from './recetario.js';

// ---------------------------------------------------------------------------
// Utilidades de pantalla
// ---------------------------------------------------------------------------
export let mostrarAviso = () => {};
// Súbelo a la vez que VERSION en sw.js: así se ve en Ajustes qué versión tiene cada móvil.
const VERSION_APP = 47;

function Aviso() {
  const [texto, setTexto] = useState(null);
  useEffect(() => {
    let t;
    mostrarAviso = (s) => { setTexto(s); clearTimeout(t); t = setTimeout(() => setTexto(null), 3500); };
  }, []);
  return texto ? html`<div class="aviso" role="status">${texto}</div>` : null;
}

export function Hoja({ titulo, onCerrar, children }) {
  useAtras(onCerrar);   // el botón atrás del móvil cierra la ventana en vez de salir de la app
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

export function Contador({ valor, min = 1, onCambio }) {
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
/**
 * Cuándo avisar: sin aviso, cuando no quede nada, o al quedar una cantidad.
 * valor: null = sin aviso, 0 = cuando no quede, > 0 = al quedar eso o menos.
 */
function CampoAviso({ unidad, valor, onCambio }) {
  const modo = valor == null ? 'no' : valor === 0 ? 'cero' : 'queda';
  const [ultimo, setUltimo] = useState(valor > 0 ? valor : unidad === 'ud' ? 1 : null);
  return html`
    <div class="campo-aviso">
      <div class="chips-aviso" role="group" aria-label="Cuándo avisar">
        <button type="button" class="chip ${modo === 'no' ? 'activo' : ''}" onClick=${() => onCambio(null)}>Sin aviso</button>
        <button type="button" class="chip ${modo === 'cero' ? 'activo' : ''}" onClick=${() => onCambio(0)}>Cuando no quede</button>
        <button type="button" class="chip ${modo === 'queda' ? 'activo' : ''}" onClick=${() => onCambio(ultimo || (unidad === 'ud' ? 1 : null))}>Cuando quede…</button>
      </div>
      ${modo === 'queda' && html`<div class="aviso-cantidad">
        <span>Avisar al quedar</span>
        ${unidad === 'ud'
          ? html`<${Contador} valor=${valor ?? 1} min=${1} onCambio=${(c) => { setUltimo(c); onCambio(c); }} />`
          : html`<${CampoCantidad} unidad=${unidad} valor=${valor} onCambio=${(c) => { setUltimo(c); onCambio(c > 0 ? c : null); }} placeholder="Cantidad" />`}
        <span class="meta">o menos</span>
      </div>`}
    </div>`;
}

/** Texto corto del aviso para la fila de la despensa. */
const textoAviso = (d, unidad) => {
  const v = avisoDe(d);
  return v == null ? 'sin aviso' : v === 0 ? 'aviso cuando no quede' : `aviso al quedar ${formatoCantidad(v, unidad)}`;
};

/**
 * Botón para borrar o quitar algo: antes pregunta en una ventana ("¿Quieres borrar la receta?")
 * con "Cancelar" y "Sí, borrar", para que no se borre nada por un toque sin querer.
 */
function BotonSeguro({ texto, pregunta, si = 'Sí, borrar', onClick, clase = 'enlace peligro' }) {
  const [abierta, setAbierta] = useState(false);
  const [haciendo, setHaciendo] = useState(false);
  useAtras(() => (haciendo ? false : setAbierta(false)), abierta);
  useEffect(() => {
    if (!abierta) return;
    const esc = (e) => e.key === 'Escape' && setAbierta(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [abierta]);
  const confirmar = async () => {
    setHaciendo(true);
    try { await onClick(); } finally { setHaciendo(false); setAbierta(false); }
  };
  return html`
    <button class=${clase} onClick=${() => setAbierta(true)}>${texto}</button>
    ${abierta && html`
      <div class="fondo confirmar-fondo" onClick=${(e) => e.target === e.currentTarget && !haciendo && setAbierta(false)}>
        <div class="confirmar" role="alertdialog" aria-modal="true" aria-label=${pregunta}>
          <p>${pregunta}</p>
          <div class="confirmar-botones">
            <button class="boton secundario" disabled=${haciendo} onClick=${() => setAbierta(false)}>Cancelar</button>
            <button class="boton peligro" disabled=${haciendo} onClick=${confirmar}>${haciendo ? 'Un momento…' : si}</button>
          </div>
        </div>
      </div>`}`;
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
/**
 * "Hecho" en una comida del plan, igual en Inicio y en Plan: al marcarla pregunta qué restar de la despensa
 * (hoja DescontarCocinado); al desmarcarla devuelve lo que se restó.
 * Devuelve { cocinar(comida, hecho), hoja } — hay que pintar `hoja` en la pantalla.
 */
export function useCocinar(almacen, datos) {
  const [hecha, setHecha] = useState(null);
  const cocinar = async (comida, hecho) => {
    if (hecho) { setHecha(comida); return; }
    const restado = leerRestado(comida.id)
      ?? ingredientesDeComida(datos, comida).filter((i) => datos.despensa.some((x) => x.articulo_id === i.articulo_id))
        .map((i) => [i.articulo_id, i.cantidad]);
    for (const [articuloId, cantidad] of restado) await almacen.sumarDespensa(articuloId, cantidad);
    guardarRestado(comida.id, null);
    await almacen.actualizar('plan', comida.id, { cocinado: false });
    mostrarAviso(restado.length ? 'Deshecho. Se ha devuelto a la despensa.' : 'Deshecho.');
  };
  const hoja = hecha && html`<${DescontarCocinado} almacen=${almacen} datos=${datos} recetaId=${hecha.receta_id} raciones=${hecha.raciones}
    comida=${hecha} onCerrar=${() => setHecha(null)} />`;
  return { cocinar, hoja };
}

export const leerRaciones = () => { try { return Number(localStorage.getItem('raciones-plan')) || null; } catch { return null; } };
export const guardarRaciones = (n) => { try { localStorage.setItem('raciones-plan', String(n)); } catch { /* nada */ } };

const ETIQUETA_MOMENTO = { postre: /postre|dulce/, tentempie: /tentempi|merienda|desayuno|snack/, cena: /cena|ligera/ };

export function ElegirReceta({ almacen, datos, titulo, momento, onCerrar, onElegir }) {
  const [buscar, setBuscar] = useState('');
  const [raciones, setRaciones] = useState(leerRaciones() ?? 2);
  const encaja = (r) => (ETIQUETA_MOMENTO[momento]?.test(normalizar(r.etiquetas.join(' '))) ? 1 : 0);
  const lista = datos.recetas
    .filter((r) => normalizar(r.nombre).includes(normalizar(buscar)) || r.etiquetas.some((e) => normalizar(e).includes(normalizar(buscar))))
    .sort((a, b) => (encaja(b) - encaja(a)) || (b.favorita - a.favorita) || a.nombre.localeCompare(b.nombre, 'es'));
  const fotos = useFotos(almacen, lista.map((r) => r.foto_path));
  const { recetas: recetario } = useRecetario();
  const deLaApp = delRecetario(recetario, datos, buscar);
  const elegirDeLaApp = async (r) => {
    try { onElegir(await guardarDelRecetario(almacen, r), raciones); } catch (e) { console.error(e); mostrarAviso(`No se pudo guardar: ${e.message ?? e}`); }
  };
  return html`
    <${Hoja} titulo=${`Añadir: ${titulo}`} onCerrar=${onCerrar}>
      <div class="fila-campo">
        <label>Raciones</label>
        <${Contador} valor=${raciones} onCambio=${setRaciones} />
      </div>
      <input type="search" placeholder="Buscar receta (o elige de la lista)" value=${buscar} onInput=${(e) => setBuscar(e.target.value)} />
      ${lista.length === 0 && deLaApp.length === 0 && html`<p class="vacio">No hay recetas con ese nombre. Créala en la pestaña Recetas.</p>`}
      <ul class="lista-recetas">
        ${lista.map((r) => html`<li><button class="tarjeta con-foto" onClick=${() => onElegir(r, raciones)}>
          <${Miniatura} receta=${r} url=${r.foto_path ? fotos[r.foto_path] : null} />
          <span class="texto-tarjeta"><strong>${r.favorita ? '★ ' : ''}${r.nombre}</strong>
            <small>${[r.origen === 'app' && '📖 Recetario de la app', r.tiempo_min && `${r.tiempo_min} min`, ...r.etiquetas].filter(Boolean).join(' · ')}</small></span>
        </button></li>`)}
      </ul>
      ${deLaApp.length > 0 && html`
        <h3>📖 Del recetario de la app</h3>
        <ul class="lista-recetas">
          ${deLaApp.map((r) => html`<li><button class="tarjeta con-foto" onClick=${() => elegirDeLaApp(r)}>
            <${Miniatura} receta=${r} />
            <span class="texto-tarjeta"><strong>${r.nombre}</strong>
              <small>${[r.tipo, r.tiempo_min && `${r.tiempo_min} min`].filter(Boolean).join(' · ')}</small></span>
          </button></li>`)}
        </ul>`}
      ${!buscar && recetario?.length > 0 && html`<p class="meta">Escribe para buscar también en las ${recetario.length} recetas del recetario de la app.</p>`}
    </${Hoja}>`;
}

// ---------------------------------------------------------------------------
// Recetas
// ---------------------------------------------------------------------------
/** Direcciones para ver las fotos de las recetas (se piden de una vez y se recuerdan). */
export function useFotos(almacen, rutas) {
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

export function Miniatura({ receta, url }) {
  return url
    ? html`<img class="miniatura" src=${url} alt="" loading="lazy" />`
    : html`<span class="miniatura sin-foto" aria-hidden="true">${dibujoReceta(receta)}</span>`;
}

const leerVistaRecetas = () => { try { return localStorage.getItem('vista-recetas') === 'app' ? 'app' : 'mias'; } catch { return 'mias'; } };

function PantallaRecetas(props) {
  const [vista, setVista] = useState(leerVistaRecetas);
  const elegir = (v) => { setVista(v); try { localStorage.setItem('vista-recetas', v); } catch { /* nada */ } };
  const mias = props.datos.recetas.filter(esDeLaCasa).length;
  return html`
    <section>
      <div class="partes" role="tablist">
        <button role="tab" aria-selected=${vista === 'mias'} class=${vista === 'mias' ? 'activa' : ''} onClick=${() => elegir('mias')}>
          🏠 Mis recetas${mias > 0 && html` <b>${mias}</b>`}</button>
        <button role="tab" aria-selected=${vista === 'app'} class=${vista === 'app' ? 'activa' : ''} onClick=${() => elegir('app')}>
          📖 Recetario de la app</button>
      </div>
      ${vista === 'app' ? html`<${RecetarioApp} ...${props} />` : html`<${MisRecetas} ...${props} />`}
    </section>`;
}

function MisRecetas({ almacen, datos, abrirReceta, editarReceta }) {
  const [buscar, setBuscar] = useState('');
  const [etiqueta, setEtiqueta] = useState(null);
  const [favoritas, setFavoritas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const entradaCaptura = useRef(null);
  const propias = datos.recetas.filter(esDeLaCasa);
  const etiquetas = [...new Set(propias.flatMap((r) => r.etiquetas))].sort((a, b) => a.localeCompare(b, 'es'));
  const lista = propias
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
      <div class="fila-campo">
        <input type="search" placeholder="Buscar receta" value=${buscar} onInput=${(e) => setBuscar(e.target.value)} />
        <button class="boton" onClick=${() => editarReceta(null)}>+ Nueva</button>
      </div>
      <input ref=${entradaCaptura} type="file" accept="image/*" multiple hidden
        onChange=${(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) editarReceta(null, fs); }} />
      <button class="boton-captura" onClick=${() => entradaCaptura.current?.click()}>
        📷 Nueva receta desde una captura <small>Instagram, TikTok, una web… (se pueden elegir varias)</small></button>
      <div class="chips">
        <button class="chip ${favoritas ? 'activo' : ''}" onClick=${() => setFavoritas(!favoritas)}>★ Favoritas</button>
        ${etiquetas.map((e) => html`<button class="chip ${etiqueta === e ? 'activo' : ''}"
          onClick=${() => setEtiqueta(etiqueta === e ? null : e)}>${e}</button>`)}
      </div>
      ${propias.length === 0 && html`
        <div class="vacio">
          <p>Todavía no hay recetas tuyas. Crea la primera, sácala de una captura o busca en el 📖 Recetario de la app.</p>
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
      ${propias.length > 0 && propias.length < RECETAS.length + 50 && html`
        <p class="pie"><button class="enlace" disabled=${cargando} onClick=${cargar}>Añadir las recetas propuestas que falten</button></p>`}`;
}

/** Una línea de la preparación; "Truco o recomendación:" y parecidos, en negrita. */
function LineaPaso({ texto, enLinea }) {
  const e = encabezadoPaso(texto);
  const dentro = e ? html`<strong>${e.titulo}</strong>${e.resto ? ` ${e.resto}` : ''}` : texto;
  if (enLinea) return dentro;
  return html`<p class=${e ? 'paso-titulo' : ''}>${dentro}</p>`;
}

function VerReceta({ almacen, datos, id, racionesIniciales, cocinarYa = false, onCerrar, onEditar }) {
  const r = datos.recetas.find((x) => x.id === id);
  const [raciones, setRaciones] = useState(racionesIniciales ?? r?.raciones ?? 4);
  const [alPlan, setAlPlan] = useState(false);
  const [cocinando, setCocinando] = useState(cocinarYa);
  const [cocinado, setCocinado] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const entradaFoto = useRef(null);
  const fotos = useFotos(almacen, [r?.foto_path]);
  const [urlVideo, setUrlVideo] = useState(null);
  const [video, setVideo] = useState(null);   // texto del progreso al preparar o subir un vídeo
  const entradaVideo = useRef(null);
  const reproductor = useRef(null);
  useEffect(() => {
    setUrlVideo(null);
    if (!r?.video_path) return;
    let vivo = true;
    almacen.motor.urlVideo(r.video_path).then((u) => vivo && setUrlVideo(u)).catch((e) => console.error(e));
    return () => { vivo = false; };
  }, [r?.video_path]);
  const fotoEnviar = useFotoParaEnviar(r?.foto_path ? fotos[r.foto_path] : null, r?.nombre);
  if (!r) return null;
  const ingredientes = datos.ingredientes.filter((i) => i.receta_id === id).sort((a, b) => a.orden - b.orden);
  const urlFoto = r.foto_path ? fotos[r.foto_path] : null;

  const prueba = almacen.motor.modo === 'prueba';
  /** Guarda una foto de portada; `sacar` la prepara (de un archivo o de un fotograma del vídeo). */
  const guardarPortada = async (sacar, aviso = 'Foto guardada') => {
    setSubiendo(true);
    try {
      const blob = await sacar();
      const ruta = await almacen.motor.subirFoto(blob);
      const anterior = r.foto_path;
      await almacen.actualizar('recetas', id, { foto_path: ruta });
      if (anterior) almacen.motor.borrarFoto(anterior).catch(() => {});
      mostrarAviso(aviso);
    } catch (err) {
      console.error(err);
      mostrarAviso(`No se pudo guardar la foto: ${err.message ?? err}`);
    }
    setSubiendo(false);
  };
  const ponerFoto = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (archivo) await guardarPortada(() => reducirFoto(archivo, prueba ? 640 : 1280, prueba ? 0.7 : 0.8));
  };
  const portadaDelVideo = () => {
    const v = reproductor.current;
    if (!v?.videoWidth) return mostrarAviso('Dale al play y para el vídeo donde quieras la foto');
    v.pause();
    guardarPortada(() => fotoDeFotograma(v, prueba ? 640 : 1280, prueba ? 0.7 : 0.8), 'Portada cambiada');
  };
  const ponerVideo = async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setVideo('Preparando el vídeo…');
    try {
      const { blob, comprimido } = await prepararVideo(archivo, (p) => setVideo(`Comprimiendo el vídeo… ${p} %`));
      setVideo(`Guardando el vídeo (${megas(blob.size)})…`);
      const ruta = await almacen.motor.subirVideo(blob);
      const anterior = r.video_path;
      await almacen.actualizar('recetas', id, { video_path: ruta });
      if (anterior) almacen.motor.borrarVideo(anterior).catch(() => {});
      // Sin foto todavía: se saca una del vídeo para la portada
      if (!r.foto_path) {
        setVideo('Sacando una foto para la portada…');
        await guardarPortada(() => fotoDeVideo(archivo, 1.5, prueba ? 640 : 1280, prueba ? 0.7 : 0.8), 'Portada sacada del vídeo')
          .catch(() => {});
      }
      mostrarAviso(comprimido
        ? `Vídeo guardado: ${megas(blob.size)} (era de ${megas(archivo.size)})`
        : `Vídeo guardado tal cual: ${megas(blob.size)}`);
    } catch (err) {
      console.error(err);
      mostrarAviso(`No se pudo guardar el vídeo: ${err.message ?? err}`);
    }
    setVideo(null);
  };
  const quitarVideo = async () => {
    const anterior = r.video_path;
    await almacen.actualizar('recetas', id, { video_path: null });
    almacen.motor.borrarVideo(anterior).catch(() => {});
  };
  const quitarFoto = async () => {
    const anterior = r.foto_path;
    await almacen.actualizar('recetas', id, { foto_path: null });
    almacen.motor.borrarFoto(anterior).catch(() => {});
  };

  const deLaApp = r.origen === 'app';
  /** Las del recetario de la app no se cambian: se copian a «Mis recetas» y se cambia la copia. */
  const copiarAMias = async () => {
    const nuevoId = crypto.randomUUID();
    await almacen.insertar('recetas', { id: nuevoId, nombre: r.nombre, raciones: r.raciones, tiempo_min: r.tiempo_min, pasos: r.pasos,
      etiquetas: r.etiquetas, favorita: false, origen: 'manual', catalogo_id: null });
    await almacen.insertar('ingredientes', ingredientes.map(({ articulo_id, cantidad, nota, orden, texto }) =>
      ({ receta_id: nuevoId, articulo_id, cantidad, nota, orden, texto: texto ?? null })));
    mostrarAviso('Copiada a «Mis recetas». Cámbiala a tu gusto.');
    onEditar(nuevoId);
  };
  const borrar = async () => {
    await almacen.borrar('ingredientes', ingredientes.map((i) => i.id));
    await almacen.borrar('plan', datos.plan.filter((p) => p.receta_id === id).map((p) => p.id));
    await almacen.borrar('recetas', id);
    if (r.foto_path) almacen.motor.borrarFoto(r.foto_path).catch(() => {});
    if (r.video_path) almacen.motor.borrarVideo(r.video_path).catch(() => {});
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
          ${r.foto_path && !subiendo && html`<${BotonSeguro} texto="Quitar foto" pregunta="¿Quieres quitar la foto de esta receta?" si="Sí, quitarla" onClick=${quitarFoto} />`}
        </div>
      </div>
      <div class="acciones">
        <button class="chip ${r.favorita ? 'activo' : ''}" onClick=${() => almacen.actualizar('recetas', id, { favorita: !r.favorita })}>
          ${r.favorita ? '★ Favorita' : '☆ Favorita'}</button>
        <button class="chip" onClick=${() => setAlPlan(true)}>+ Al plan</button>
        <button class="chip" onClick=${() => compartir({ titulo: r.nombre, texto: textoReceta(r, ingredientes, datos.articulos, raciones), foto: fotoEnviar })}>📤 Enviar</button>
        ${deLaApp
          ? html`<button class="chip" onClick=${copiarAMias}>✏️ Copiar a mis recetas</button>`
          : html`<button class="chip" onClick=${() => onEditar(id)}>Editar</button>`}
        ${!deLaApp && !r.video_path && !video && html`<button class="chip" onClick=${() => entradaVideo.current?.click()}>🎬 Añadir vídeo</button>`}
      </div>
      <input ref=${entradaVideo} type="file" accept="video/*" hidden onChange=${ponerVideo} />
      ${video && html`<p class="leyendo-captura" role="status">⏳ ${video}<br /><small>No cierres la app hasta que termine.</small></p>`}
      ${r.video_path && html`
        <div class="video-receta">
          ${urlVideo
            ? html`<video ref=${reproductor} src=${urlVideo} crossorigin="anonymous" controls playsinline preload="metadata"></video>`
            : html`<p class="meta">${r.video_path.startsWith('local:') ? 'El vídeo de prueba se borra al cerrar la app.' : 'Cargando el vídeo…'}</p>`}
          ${!video && html`<div class="acciones-foto">
            <button class="chip" disabled=${subiendo || !urlVideo} onClick=${portadaDelVideo}>📸 Usar este momento de portada</button>
            <button class="chip" onClick=${() => entradaVideo.current?.click()}>🎬 Cambiar vídeo</button>
            <${BotonSeguro} texto="Quitar vídeo" pregunta="¿Quieres quitar el vídeo de esta receta?" si="Sí, quitarlo" onClick=${quitarVideo} />
          </div>`}
        </div>`}
      <p class="meta">${[r.tiempo_min && `${r.tiempo_min} min`, ...r.etiquetas, r.origen === 'ia' ? 'Propuesta por la IA' : '', deLaApp ? '📖 Recetario de la app' : ''].filter(Boolean).join(' · ')}</p>
      <div class="fila-campo"><label>Raciones</label><${Contador} valor=${raciones} onCambio=${setRaciones} /></div>
      <h3>Ingredientes</h3>
      <ul class="ingredientes">
        ${ingredientes.map((i) => {
          const a = articulo(datos, i.articulo_id);
          const hay = datos.despensa.find((d) => d.articulo_id === i.articulo_id);
          const c = escalar(i.cantidad, r.raciones, raciones);
          // Tal cual se pegó, salvo si se cambian las raciones (entonces la cantidad la calcula la app)
          if (i.texto && raciones === r.raciones) {
            return html`<li class="tal-cual">
              <span>${i.texto}
                <small class="entendido">🛒 ${a?.nombre} · ${c == null ? (i.nota || 'sin cantidad') : `${formatoCantidad(c, a?.unidad)}${i.nota ? ` (${i.nota})` : ''}`}</small></span>
              ${hay && hay.cantidad > 0 && html`<span class="cant"><small class="en-casa" title="En casa">🏠 ${formatoCantidad(hay.cantidad, a?.unidad)}</small></span>`}
            </li>`;
          }
          return html`<li>
            <span>${a?.nombre}${i.nota && c != null ? html` <small>(${i.nota})</small>` : ''}</span>
            <span class="cant">${c == null ? (i.nota || 'al gusto') : formatoCantidad(c, a?.unidad)}
              ${hay && hay.cantidad > 0 && html`<small class="en-casa" title="En casa">🏠 ${formatoCantidad(hay.cantidad, a?.unidad)}</small>`}</span>
          </li>`;
        })}
      </ul>
      <h3>Preparación</h3>
      <div class="pasos">${r.pasos.split('\n').filter((p) => p.trim()).map((p) => html`<${LineaPaso} texto=${p} />`)}</div>
      <div class="botones-cocinar">
        <button class="boton grande" onClick=${() => setCocinando(true)}>👩‍🍳 Modo cocina</button>
        <button class="boton grande secundario" onClick=${() => setCocinado(true)}>✅ La he cocinado</button>
      </div>
      <p class="pie">${deLaApp
        ? html`<${BotonSeguro} texto="Dejar de usarla" pregunta=${`¿Quitar «${r.nombre}» de las que usas? Sigue en el recetario de la app, pero se quita del plan.`} si="Sí, quitarla" onClick=${borrar} />`
        : html`<${BotonSeguro} texto="Borrar receta" pregunta=${`¿Quieres realmente borrar la receta «${r.nombre}»? También se quita del plan.`} onClick=${borrar} />`}</p>
      ${cocinando && html`<${ModoCocina} datos=${datos} receta=${r} raciones=${raciones}
        onCerrar=${() => setCocinando(false)} onTerminar=${() => { setCocinando(false); setCocinado(true); }} />`}
      ${cocinado && html`<${DescontarCocinado} almacen=${almacen} datos=${datos} recetaId=${id} raciones=${raciones}
        onCerrar=${() => setCocinado(false)} />`}
      ${alPlan && html`<${ElegirDia} onCerrar=${() => setAlPlan(false)} onElegir=${(fecha, momento) => {
        almacen.insertar('plan', { fecha, momento, receta_id: id, raciones, cocinado: false });
        setAlPlan(false);
        mostrarAviso(`Añadida al plan: ${nombreDia(fecha)}, ${nombreMomento(momento).toLowerCase()}`);
      }} />`}
    </${Hoja}>`;
}

// ---------------------------------------------------------------------------
// Compartir por WhatsApp, modo cocina y descontar lo cocinado
// ---------------------------------------------------------------------------
/**
 * Abre "Compartir" del móvil (ahí sale WhatsApp) con el texto y, si se puede, la foto.
 * Sin "Compartir" (ordenador) abre WhatsApp Web con el texto.
 */
export async function compartir({ titulo, texto, foto }) {
  try {
    if (foto && navigator.canShare?.({ files: [foto], text: texto })) {
      await navigator.share({ files: [foto], text: texto, title: titulo });
      return;
    }
    if (navigator.share) {
      await navigator.share({ text: texto, title: titulo });
      return;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return;   // lo cerró ella
    console.error(e);
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
}

/** Descarga la foto de portada en cuanto se ve la receta, para que "Enviar" salga al momento con ella. */
export function useFotoParaEnviar(url, nombre) {
  const [foto, setFoto] = useState(null);
  useEffect(() => {
    setFoto(null);
    if (!url) return;
    let vivo = true;
    fetch(url).then((r) => (r.ok ? r.blob() : null)).then((b) => {
      if (!vivo || !b) return;
      const ext = b.type === 'image/png' ? 'png' : b.type === 'image/webp' ? 'webp' : 'jpg';
      const base = normalizar(nombre || 'receta').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'receta';
      setFoto(new File([b], `${base}.${ext}`, { type: b.type || 'image/jpeg' }));
    }).catch(() => {});
    return () => { vivo = false; };
  }, [url]);
  return foto;
}

/** Lo restado al marcar una comida como hecha, para devolverlo exacto si se deshace. */
const leerRestado = (id) => { try { return JSON.parse(localStorage.getItem(`restado-${id}`)); } catch { return null; } };
const guardarRestado = (id, filas) => {
  try { if (filas) localStorage.setItem(`restado-${id}`, JSON.stringify(filas)); else localStorage.removeItem(`restado-${id}`); } catch { /* nada */ }
};

/** La comida del plan que se está cocinando: la de hoy (o la última pendiente de días pasados) de esta receta. */
function comidaPendiente(datos, recetaId) {
  const hoy = fechaISO();
  return datos.plan
    .filter((p) => p.receta_id === recetaId && !p.cocinado && p.fecha <= hoy && p.fecha >= sumarDias(hoy, -3))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null;
}

/**
 * "La he cocinado": enseña lo que se va a restar de la despensa (se puede cambiar o saltar) y lo resta.
 * Si la receta estaba en el plan, la marca como hecha.
 */
function DescontarCocinado({ almacen, datos, recetaId, raciones, comida, onCerrar }) {
  const r = datos.recetas.find((x) => x.id === recetaId);
  const [filas, setFilas] = useState(() => aDescontar(datos, recetaId, raciones).map((f) => ({ ...f, saltar: !f.enDespensa })));
  const cambiar = (k, c) => setFilas((xs) => xs.map((x) => (x.clave === k ? { ...x, ...c } : x)));
  const apuntadas = filas.filter((f) => f.enDespensa);
  const fuera = filas.filter((f) => !f.enDespensa);
  const listas = apuntadas.filter((f) => !f.saltar && f.cantidad > 0);
  const delPlan = comida ?? comidaPendiente(datos, recetaId);
  const sinCantidad = datos.ingredientes.filter((i) => i.receta_id === recetaId && i.cantidad == null).length;

  const terminar = async (restar) => {
    const hechas = restar ? listas : [];
    for (const f of hechas) await almacen.sumarDespensa(f.articulo_id, -Math.min(f.cantidad, f.hay || f.cantidad));
    if (delPlan) {
      await almacen.actualizar('plan', delPlan.id, { cocinado: true });
      guardarRestado(delPlan.id, hechas.map((f) => [f.articulo_id, Math.min(f.cantidad, f.hay || f.cantidad)]));
    }
    mostrarAviso(hechas.length ? `¡Que aproveche! Restado de la despensa: ${hechas.map((f) => f.nombre).join(', ')}` : '¡Que aproveche!');
    onCerrar(true);
  };

  return html`
    <${Hoja} titulo=${`He cocinado ${r?.nombre ?? ''}`} onCerrar=${() => onCerrar(false)}>
      <p class="meta">${raciones} ${raciones === 1 ? 'ración' : 'raciones'}. Esto es lo que se resta de la despensa; cambia lo que no cuadre.</p>
      ${apuntadas.length === 0 && html`<p class="vacio">Ningún ingrediente de esta receta está apuntado en la despensa.</p>`}
      ${apuntadas.map((f) => html`<div class="ing-fila ${f.saltar ? 'saltado' : ''}" key=${f.clave}>
        <div class="ing-cab"><strong>${f.nombre}</strong>
          <button class="enlace" onClick=${() => cambiar(f.clave, { saltar: !f.saltar })}>${f.saltar ? 'Restar' : 'No restar'}</button></div>
        ${!f.saltar && html`<div class="ing-datos">
          <${CampoCantidad} unidad=${f.unidad} valor=${f.cantidad} onCambio=${(c) => cambiar(f.clave, { cantidad: c ?? 0 })} />
          <small class="meta">hay ${formatoCantidad(f.hay, f.unidad)}${f.cantidad > f.hay ? ' (se queda en 0)' : ''}</small>
        </div>`}
      </div>`)}
      ${(fuera.length > 0 || sinCantidad > 0) && html`<p class="meta">${[
        fuera.length && `No están en la despensa: ${fuera.map((f) => f.nombre).join(', ')}.`,
        sinCantidad && `${sinCantidad === 1 ? 'Un ingrediente va' : `${sinCantidad} ingredientes van`} sin cantidad y no se resta${sinCantidad === 1 ? '' : 'n'}.`,
      ].filter(Boolean).join(' ')}</p>`}
      ${delPlan && html`<p class="meta">Se marca como hecha en el plan (${nombreDia(delPlan.fecha).toLowerCase()}, ${nombreMomento(delPlan.momento).toLowerCase()}).</p>`}
      <button class="boton grande" disabled=${!listas.length} onClick=${() => terminar(true)}>
        ${textoBotonRestar(listas)}</button>
      <p class="pie"><button class="enlace" onClick=${() => terminar(false)}>${delPlan ? 'Marcar como hecha sin restar nada' : 'No restar nada'}</button></p>
    </${Hoja}>`;
}

/** Pitido con el altavoz del móvil (sin archivos de sonido). */
let audioCocina = null;
function prepararSonido() {
  try { audioCocina ??= new (window.AudioContext || window.webkitAudioContext)(); audioCocina.resume?.(); } catch { /* sin sonido */ }
}
function pitar() {
  try {
    const ctx = audioCocina;
    if (!ctx) return;
    for (const [t, f] of [[0, 880], [0.25, 880], [0.5, 1175]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    }
  } catch { /* nada */ }
  try { navigator.vibrate?.([300, 150, 300]); } catch { /* nada */ }
}

/** Mantiene la pantalla encendida mientras se ve el modo cocina. Devuelve si lo ha conseguido. */
function usePantallaEncendida() {
  const [activa, setActiva] = useState(null);   // null = probando, true/false
  useEffect(() => {
    let cerrojo = null, vivo = true;
    const pedir = async () => {
      if (!('wakeLock' in navigator)) { setActiva(false); return; }
      try {
        cerrojo = await navigator.wakeLock.request('screen');
        if (!vivo) { cerrojo.release().catch(() => {}); return; }
        setActiva(true);
        cerrojo.addEventListener?.('release', () => vivo && document.visibilityState !== 'visible' && setActiva(null));
      } catch { setActiva(false); }
    };
    // Al salir de la app se suelta solo: se vuelve a pedir al volver.
    const alVolver = () => { if (document.visibilityState === 'visible') pedir(); };
    pedir();
    document.addEventListener('visibilitychange', alVolver);
    return () => { vivo = false; document.removeEventListener('visibilitychange', alVolver); cerrojo?.release().catch(() => {}); };
  }, []);
  return activa;
}

const MINUTOS_RAPIDOS = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];

/** Pasos en grande, pantalla siempre encendida y temporizadores sacados de cada paso. */
function ModoCocina({ datos, receta, raciones, onCerrar, onTerminar }) {
  const pasos = pasosDe(receta);
  const ingredientes = datos.ingredientes.filter((i) => i.receta_id === receta.id).sort((a, b) => a.orden - b.orden);
  const [paso, setPaso] = useState(0);             // 0 = ingredientes; 1..n = pasos
  const [relojes, setRelojes] = useState([]);      // { id, nombre, total, fin, sonando }
  const [ahora, setAhora] = useState(Date.now());
  const [otro, setOtro] = useState(false);
  const [salir, setSalir] = useState(false);
  const [hechos, setHechos] = useState(() => new Set());   // ingredientes ya echados
  const pantalla = usePantallaEncendida();

  useEffect(() => {
    document.body.classList.add('sin-scroll');
    const esc = (e) => { if (e.key === 'ArrowRight') setPaso((p) => Math.min(pasos.length, p + 1)); if (e.key === 'ArrowLeft') setPaso((p) => Math.max(0, p - 1)); };
    document.addEventListener('keydown', esc);
    return () => { document.body.classList.remove('sin-scroll'); document.removeEventListener('keydown', esc); };
  }, []);
  // Un tic por segundo mientras haya temporizadores; al acabar uno, pita hasta que se pare.
  useEffect(() => {
    if (!relojes.length) return;
    const t = setInterval(() => {
      const n = Date.now();
      setAhora(n);
      setRelojes((rs) => {
        let cambia = false;
        const nuevos = rs.map((x) => {
          if (!x.sonando && x.fin <= n) { cambia = true; return { ...x, sonando: n }; }
          return x;
        });
        const suenan = nuevos.filter((x) => x.sonando && n - x.sonando < 120000);
        if (suenan.length && Math.floor(n / 1000) % 2 === 0) pitar();
        return cambia ? nuevos : rs;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [relojes.length > 0]);

  const empezar = (segundos, nombre) => {
    prepararSonido();
    const n = Date.now();
    setAhora(n);
    setRelojes((rs) => [...rs, { id: `${n}-${Math.random()}`, nombre, total: segundos, fin: n + segundos * 1000, sonando: null }]);
    setOtro(false);
  };
  const quitar = (id) => setRelojes((rs) => rs.filter((x) => x.id !== id));
  const sumarMinuto = (id) => setRelojes((rs) => rs.map((x) => (x.id === id
    ? { ...x, fin: Math.max(x.fin, Date.now()) + 60000, sonando: null } : x)));
  const intentarSalir = () => {
    if (relojes.some((x) => !x.sonando) && !salir) { setSalir(true); setTimeout(() => setSalir(false), 5000); return false; }
    onCerrar();
    return true;
  };
  useAtras(intentarSalir);

  const texto = paso > 0 ? pasos[paso - 1] : null;
  const tiempos = texto ? tiemposDePaso(texto) : [];
  const ultimo = paso === pasos.length;

  return html`
    <div class="cocina" role="dialog" aria-label=${`Modo cocina: ${receta.nombre}`}>
      <div class="cocina-cab">
        <div class="cocina-titulo">
          <strong>${receta.nombre}</strong>
          <small>${paso === 0 ? `Ingredientes · ${raciones} rac.` : `Paso ${paso} de ${pasos.length}`}
            ${pantalla === true ? ' · 🔆 pantalla encendida' : pantalla === false ? ' · la pantalla puede apagarse' : ''}</small>
        </div>
        <button class="chip ${salir ? 'peligro' : ''}" onClick=${intentarSalir}>${salir ? 'Hay temporizadores. ¿Salir?' : '✕ Salir'}</button>
      </div>
      <div class="cocina-progreso" aria-hidden="true"><span style=${`width:${pasos.length ? (paso / pasos.length) * 100 : 100}%`}></span></div>

      ${relojes.length > 0 && html`<div class="cocina-relojes">
        ${relojes.map((x) => {
          const queda = Math.ceil((x.fin - ahora) / 1000);
          return html`<div class="reloj ${x.sonando ? 'suena' : ''}" key=${x.id}>
            <span class="reloj-nombre">${x.nombre}</span>
            <b class="reloj-cifra">${x.sonando ? '¡Tiempo!' : reloj(queda)}</b>
            <button class="chip" onClick=${() => sumarMinuto(x.id)}>+1 min</button>
            <button class="chip" onClick=${() => quitar(x.id)}>${x.sonando ? 'Parar' : '✕'}</button>
          </div>`;
        })}
      </div>`}

      <div class="cocina-cuerpo">
        ${paso === 0 ? html`
          <ul class="cocina-ingredientes">
            ${ingredientes.map((i) => {
              const a = articulo(datos, i.articulo_id);
              const c = escalar(i.cantidad, receta.raciones, raciones);
              const hecho = hechos.has(i.id);
              return html`<li key=${i.id} class=${hecho ? 'hecho' : ''}>
                <button onClick=${() => setHechos((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })}>
                  <span class="marca">${hecho ? '✓' : ''}</span>
                  ${i.texto && raciones === receta.raciones
                    ? html`<span class="nombre">${i.texto}</span>`
                    : html`<span class="nombre">${a?.nombre}</span>
                  <span class="cant">${c == null ? (i.nota || 'al gusto') : formatoCantidad(c, a?.unidad)}</span>`}
                </button>
              </li>`;
            })}
          </ul>
          ${ingredientes.length > 0 && html`<p class="meta">Toca cada ingrediente cuando lo tengas preparado.</p>`}
          ${pasos.length === 0 && html`<p class="vacio">Esta receta no tiene pasos escritos.</p>`}`
        : html`
          <p class="cocina-paso"><${LineaPaso} texto=${texto} enLinea /></p>
          <div class="cocina-tiempos">
            ${tiempos.map((t) => html`<button class="boton" onClick=${() => empezar(t.segundos, `Paso ${paso} · ${duracion(t.segundos)}`)}>⏱ ${duracion(t.segundos)}</button>`)}
            <button class="boton secundario" onClick=${() => setOtro(!otro)}>⏱ ${tiempos.length ? 'Otro tiempo' : 'Temporizador'}</button>
          </div>`}
        ${otro && html`<div class="cocina-otro">
          ${MINUTOS_RAPIDOS.map((m) => html`<button class="chip" onClick=${() => empezar(m * 60, `${paso ? `Paso ${paso} · ` : ''}${m} min`)}>${m} min</button>`)}
        </div>`}
      </div>

      <div class="cocina-pie">
        <button class="boton secundario" disabled=${paso === 0} onClick=${() => setPaso(paso - 1)}>‹ Anterior</button>
        ${ultimo
          ? html`<button class="boton" onClick=${onTerminar}>✅ ¡Terminado!</button>`
          : html`<button class="boton" onClick=${() => setPaso(paso + 1)}>${paso === 0 ? 'Empezar ›' : 'Siguiente ›'}</button>`}
      </div>
    </div>`;
}

export function ElegirDia({ onCerrar, onElegir }) {
  const hoy = fechaISO();
  const dias = Array.from({ length: 14 }, (_, i) => sumarDias(hoy, i));
  return html`
    <${Hoja} titulo="¿Qué día?" onCerrar=${onCerrar}>
      <ul class="lista-simple">
        ${dias.map((f) => html`<li class="dia-elegir">
          <span>${nombreDia(f, hoy)}</span>
          <span class="chips-dia">${MOMENTOS.map(([m, nombre]) => html`<button class="chip" onClick=${() => onElegir(f, m)}>${nombre}</button>`)}</span>
        </li>`)}
      </ul>
    </${Hoja}>`;
}

/** Listado para elegir ingredientes: buscar, tocar para añadir (varios seguidos) o crear uno nuevo. */
function ElegirIngredientes({ datos, elegidos, onElegir, onCerrar }) {
  const [buscar, setBuscar] = useState('');
  const n = normalizar(buscar);
  const filtrados = datos.articulos.filter((a) => !n || normalizar(a.nombre).includes(n));
  const exacto = buscarArticulo(datos.articulos, buscar);
  const crear = (unidad) => {
    onElegir({ nombre: mayusculaInicial(buscar.trim()), unidad, categoria: adivinarCategoria(buscar) });
    setBuscar('');
  };
  return html`
    <${Hoja} titulo="Añadir ingredientes" onCerrar=${onCerrar}>
      <input type="search" placeholder="Buscar o escribir uno nuevo" value=${buscar} onInput=${(e) => setBuscar(e.target.value)} />
      ${buscar.trim() && !exacto && html`
        <div class="crear-ingrediente">
          <p>Crear <b>${mayusculaInicial(buscar.trim())}</b>. ¿Cómo se compra?</p>
          <div class="acciones">
            <button class="chip" onClick=${() => crear('ud')}>Por unidades</button>
            <button class="chip" onClick=${() => crear('g')}>Por peso (g / kg)</button>
            <button class="chip" onClick=${() => crear('ml')}>Líquido (ml / l)</button>
          </div>
        </div>`}
      ${agruparPorCategoria(filtrados.map((a) => ({ articulo_id: a.id })), datos.articulos).map(([cat, grupo]) => html`
        <h3 class="categoria"><span class="ico-pasillo" aria-hidden="true">${iconoPasillo(cat)}</span>${cat}</h3>
        <ul class="lista-simple">
          ${grupo.map(({ articulo_id }) => {
            const a = articulo(datos, articulo_id);
            const ya = elegidos.has(normalizar(a.nombre));
            return html`<li><button class=${ya ? 'elegido' : ''} onClick=${() => onElegir({ nombre: a.nombre, unidad: a.unidad, categoria: a.categoria })}>
              ${ya ? '✓ ' : '+ '}${a.nombre}</button></li>`;
          })}
        </ul>`)}
      <button class="boton grande fijo-abajo" onClick=${onCerrar}>Listo</button>
    </${Hoja}>`;
}

// Unidades para elegir en cada ingrediente: las de compra (se suman en la lista) y las caseras (van como nota).
const UNIDAD_FAMILIA = { g: 'g', kg: 'g', ml: 'ml', l: 'ml', ud: 'ud' };
const CASERAS = ['cda', 'cdta', 'taza', 'vaso', 'pizca', 'puñado', 'chorrito', 'loncha', 'al gusto'];
const CASERA_DE = (u) => {
  const n = normalizar(u);
  if (/^(cucharadas?|cdas?)$/.test(n)) return 'cda';
  if (/^(cucharaditas?|cditas?|cdtas?)$/.test(n)) return 'cdta';
  return CASERAS.find((c) => normalizar(c) === n.replace(/s$/, '')) ?? null;
};

/** "1 cdta, picado" -> { medida: '1 cdta', nota: 'picado' } (la medida casera se elige con el desplegable). */
function separarMedida(nota) {
  const t = String(nota ?? '').trim();
  if (/^al gusto\b/i.test(t)) return { medida: 'al gusto', nota: t.replace(/^al gusto\s*,?\s*/i, '') };
  const m = t.match(/^(\d+(?:[.,/]\d+)?|un|una|medio|media)\s+([a-zñ]+)\b\s*,?\s*(.*)$/i);
  const u = m && CASERA_DE(m[2]);
  if (!u) return { medida: '', nota: t };
  const n = { un: '1', una: '1', medio: '1/2', media: '1/2' }[m[1].toLowerCase()] ?? m[1];
  return { medida: `${n} ${u}`, nota: m[3] };
}

/**
 * Cantidad y unidad de un ingrediente de receta. g/kg/ml/l/ud cuentan para la lista de la compra;
 * cucharadas, pizcas… se guardan como nota. Si el artículo ya existe y se compra de otra forma
 * (p. ej. por peso y se elige ml), también va como nota.
 */
function CantidadIngrediente({ ing, existe, onCambio }) {
  const inicial = () => {
    if (ing.medida === 'al gusto') return ['', 'al gusto'];
    if (ing.medida) { const [n, ...u] = ing.medida.split(' '); return [n, u.join(' ')]; }
    return aEntrada(ing.cantidad, ing.unidad);
  };
  const [texto, setTexto] = useState(() => inicial()[0]);
  const [u, setU] = useState(() => inicial()[1]);
  const cambiar = (t, unidad) => {
    setTexto(t); setU(unidad);
    const fam = UNIDAD_FAMILIA[unidad];
    if (unidad === 'al gusto') onCambio({ cantidad: null, medida: 'al gusto' });
    else if (!fam) onCambio({ cantidad: null, medida: `${t} ${unidad}`.trim() });
    else onCambio({ unidad: fam, cantidad: deEntrada(t, unidad), medida: '' });
  };
  const otraForma = existe && UNIDAD_FAMILIA[u] && UNIDAD_FAMILIA[u] !== existe.unidad;
  return html`
    <div class="cantidad-ing">
      <div class="fila-campo">
        <input inputmode="decimal" placeholder="Cantidad" value=${texto} disabled=${u === 'al gusto'}
          onInput=${(e) => cambiar(e.target.value, u)} />
        <select value=${u} aria-label="Unidad" onChange=${(e) => cambiar(texto, e.target.value)}>
          ${Object.keys(UNIDAD_FAMILIA).map((x) => html`<option value=${x}>${x}</option>`)}
          ${CASERAS.map((x) => html`<option value=${x}>${x}</option>`)}
        </select>
      </div>
      ${otraForma && html`<small class="meta">${existe.nombre} se compra por ${UNIDAD_LARGA[existe.unidad]}: irá como nota</small>`}
    </div>`;
}

const ETIQUETAS_BASE = ['Cuchara', 'Rápida', 'Ligera', 'Cena', 'Pescado', 'Carne', 'Pollo', 'Verdura', 'Pasta', 'Arroz', 'Postre', 'Canaria'];

/** Etiquetas para tocar (las que ya se usan y unas cuantas habituales) y un hueco para añadir otra. */
function ElegirEtiquetas({ datos, valor, onCambio }) {
  const [nueva, setNueva] = useState('');
  const elegidas = valor.split(',').map((x) => x.trim()).filter(Boolean);
  const tiene = (e) => elegidas.some((x) => normalizar(x) === normalizar(e));
  const todas = [];
  for (const e of [...datos.recetas.flatMap((r) => r.etiquetas ?? []), ...ETIQUETAS_BASE, ...elegidas]) {
    if (!todas.some((x) => normalizar(x) === normalizar(e))) todas.push(e);
  }
  todas.sort((a, b) => a.localeCompare(b, 'es'));
  const poner = (lista) => onCambio(lista.join(', '));
  const alternar = (e) => poner(tiene(e) ? elegidas.filter((x) => normalizar(x) !== normalizar(e)) : [...elegidas, e]);
  const anadir = () => {
    const e = mayusculaInicial(nueva.trim());
    if (e && !tiene(e)) poner([...elegidas, e]);
    setNueva('');
  };
  return html`
    <div class="etiquetas-editor">
      <span class="etiqueta-titulo">Etiquetas <small>(toca para poner o quitar)</small></span>
      <div class="chips">
        ${todas.map((e) => html`<button type="button" class="chip ${tiene(e) ? 'activo' : ''}" aria-pressed=${tiene(e)} onClick=${() => alternar(e)}>${tiene(e) ? '✓ ' : ''}${e}</button>`)}
      </div>
      <div class="fila-campo">
        <input placeholder="Otra etiqueta" value=${nueva} onInput=${(e) => setNueva(e.target.value)}
          onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); anadir(); } }} />
        <button type="button" class="chip" disabled=${!nueva.trim()} onClick=${anadir}>+ Añadir</button>
      </div>
    </div>`;
}

const mayusculaInicial = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const UNIDAD_LARGA = { g: 'peso', ml: 'líquido', ud: 'unidades' };

function EditarReceta({ almacen, datos, id, capturas, onCerrar }) {
  const original = id ? datos.recetas.find((r) => r.id === id) : null;
  const ingOriginales = id ? datos.ingredientes.filter((i) => i.receta_id === id).sort((a, b) => a.orden - b.orden) : [];
  const [f, setF] = useState({
    nombre: original?.nombre ?? '', raciones: original?.raciones ?? 4, tiempo_min: original?.tiempo_min ?? '',
    etiquetas: (original?.etiquetas ?? []).join(', '), pasos: original?.pasos ?? '',
  });
  const [ings, setIngs] = useState(ingOriginales.map((i) => {
    const a = articulo(datos, i.articulo_id);
    return { clave: i.id, nombre: a?.nombre ?? '', cantidad: i.cantidad, unidad: a?.unidad ?? 'ud', categoria: a?.categoria, texto: i.texto ?? null, ...separarMedida(i.nota) };
  }));
  const [elegir, setElegir] = useState(false);
  const [pegar, setPegar] = useState(null); // texto que se está pegando
  const [guardando, setGuardando] = useState(false);
  const [leyendo, setLeyendo] = useState(null);       // texto del progreso al leer capturas
  const [textoLeido, setTextoLeido] = useState('');
  const [portada, setPortada] = useState(null);       // { blob, url } foto del plato sacada de la captura
  const entradaCaptura = useRef(null);
  const cambiarIng = (k, cambios) => setIngs((xs) => xs.map((x) => (x.clave === k ? { ...x, ...cambios } : x)));
  const elegidos = new Set(ings.map((i) => normalizar(i.nombre)));

  const anadir = (nuevo) => setIngs((xs) => (xs.some((x) => normalizar(x.nombre) === normalizar(nuevo.nombre))
    ? xs.filter((x) => normalizar(x.nombre) !== normalizar(nuevo.nombre))   // tocar otra vez lo quita
    : [...xs, { clave: crypto.randomUUID(), cantidad: null, nota: '', ...nuevo }]));

  const separar = (texto = pegar) => {
    const leidos = entenderIngredientes(texto, datos.articulos);
    if (!leidos.length) return;
    setIngs((xs) => [...xs, ...leidos.map((l) => ({
      clave: crypto.randomUUID(), nombre: l.nombre, unidad: l.unidad, cantidad: l.cantidad, categoria: l.categoria, texto: l.texto, ...separarMedida(l.nota),
    }))]);
    setPegar(null);
    mostrarAviso(`${leidos.length} ingredientes añadidos. Revisa las cantidades.`);
  };

  /** Lee una o varias capturas de la receta y rellena lo que encuentre (luego se revisa). */
  const leerCapturas = async (ficheros) => {
    if (!ficheros?.length) return;
    setLeyendo('Leyendo la captura…');
    try {
      let texto = '';
      const titulos = [];
      let hayPortada = !!portada;
      for (let k = 0; k < ficheros.length; k++) {
        const cual = ficheros.length > 1 ? `Leyendo captura ${k + 1} de ${ficheros.length}` : 'Leyendo la captura';
        setLeyendo(`${cual}…`);
        const leido = await leerRecetaDeImagen(ficheros[k], (p) => setLeyendo(`${cual}… ${p} %`));
        texto += `\n${leido.texto}`;
        titulos.push(...leido.titulos);
        if (leido.portada && !hayPortada) {
          hayPortada = true;
          setPortada({ blob: leido.portada, url: URL.createObjectURL(leido.portada) });
        }
      }
      const r = entenderReceta(texto, { titulos });
      setTextoLeido(texto.trim());
      setF((prev) => ({
        ...prev,
        nombre: prev.nombre.trim() || r.nombre,
        raciones: r.raciones ?? prev.raciones,
        tiempo_min: r.tiempo_min ?? prev.tiempo_min,
        pasos: [prev.pasos.trim(), numerarPasos(r.pasos).join('\n')].filter(Boolean).join('\n'),
      }));
      const leidos = entenderIngredientes(r.ingredientes.join('\n'), datos.articulos);
      setIngs((xs) => [...xs, ...leidos
        .filter((l, k) => !xs.some((x) => normalizar(x.nombre) === normalizar(l.nombre))
          && leidos.findIndex((o) => normalizar(o.nombre) === normalizar(l.nombre)) === k)
        .map((l) => ({ clave: crypto.randomUUID(), nombre: l.nombre, unidad: l.unidad, cantidad: l.cantidad, categoria: l.categoria, texto: l.texto, ...separarMedida(l.nota) }))]);
      mostrarAviso(r.nombre || leidos.length || r.pasos.length
        ? `Leído: ${leidos.length} ingredientes y ${r.pasos.length} pasos. Revísalo antes de guardar.`
        : 'No se ha entendido bien la captura. Abajo tienes el texto leído para copiarlo.');
    } catch (err) {
      console.error(err);
      mostrarAviso(`No se pudo leer la captura: ${err.message ?? err}`);
    }
    setLeyendo(null);
  };
  useEffect(() => { if (capturas?.length) leerCapturas(capturas); }, []);

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
      const a = await obtenerArticulo(almacen, i.nombre, i.unidad, i.categoria ?? adivinarCategoria(i.nombre));
      // Si se eligió una unidad que no es la del artículo (p. ej. ml para algo que se compra por peso), va como nota
      const cantidad = a.unidad === i.unidad ? i.cantidad : null;
      const medida = a.unidad === i.unidad ? i.medida : (i.medida || (i.cantidad != null ? formatoCantidad(i.cantidad, i.unidad) : ''));
      const nota = [medida, i.nota?.trim()].filter(Boolean).join(', ') || null;
      // texto: como se pegó; la receta lo enseña así (lo demás es para la compra y la despensa)
      filas.push({ receta_id: recetaId, articulo_id: a.id, cantidad, nota, orden: orden++, texto: i.texto?.trim() || null });
    }
    if (filas.length) await almacen.insertar('ingredientes', filas);
    if (portada) {
      try {
        const prueba = almacen.motor.modo === 'prueba';
        const blob = prueba ? await reducirFoto(portada.blob, 640, 0.7) : portada.blob;
        const ruta = await almacen.motor.subirFoto(blob);
        await almacen.actualizar('recetas', recetaId, { foto_path: ruta });
        if (original?.foto_path) almacen.motor.borrarFoto(original.foto_path).catch(() => {});
      } catch (err) {
        console.error(err);
        mostrarAviso(`Receta guardada, pero no la foto: ${err.message ?? err}`);
      }
    }
    setGuardando(false);
    onCerrar(recetaId);
  };

  return html`
    <${Hoja} titulo=${id ? 'Editar receta' : 'Nueva receta'} onCerrar=${() => onCerrar(id)}>
      <input ref=${entradaCaptura} type="file" accept="image/*" multiple hidden
        onChange=${(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; leerCapturas(fs); }} />
      ${leyendo
        ? html`<p class="leyendo-captura" role="status">⏳ ${leyendo}<br /><small>La primera vez tarda un poco más.</small></p>`
        : html`<button class="anadir" onClick=${() => entradaCaptura.current?.click()}>📷 Rellenar desde una captura</button>`}
      ${textoLeido && html`<details class="texto-leido">
        <summary>Ver el texto leído de la captura</summary>
        <textarea rows="8" readonly value=${textoLeido}></textarea>
        <small>Si falta algo, cópialo de aquí y pégalo donde toque.</small>
      </details>`}
      ${portada && html`
        <div class="portada-captura">
          <img src=${portada.url} alt="Foto del plato sacada de la captura" />
          <div class="acciones">
            <small class="meta">Portada sacada de la captura${original?.foto_path ? ' (cambiará la que tiene)' : ''}</small>
            <button class="enlace" onClick=${() => { URL.revokeObjectURL(portada.url); setPortada(null); }}>Quitar</button>
          </div>
        </div>`}
      <label>Nombre<input value=${f.nombre} onInput=${(e) => setF({ ...f, nombre: e.target.value })} /></label>
      <div class="dos">
        <label>Raciones<input inputmode="numeric" value=${f.raciones} onInput=${(e) => setF({ ...f, raciones: e.target.value })} /></label>
        <label>Minutos<input inputmode="numeric" value=${f.tiempo_min} onInput=${(e) => setF({ ...f, tiempo_min: e.target.value })} /></label>
      </div>
      <${ElegirEtiquetas} datos=${datos} valor=${f.etiquetas} onCambio=${(etiquetas) => setF((prev) => ({ ...prev, etiquetas }))} />
      <h3>Ingredientes</h3>
      ${ings.length === 0 && html`<p class="meta">Añádelos uno a uno desde el listado, o pega un texto con todos.</p>`}
      ${ings.map((i) => html`
        <div class="ing-fila">
          ${i.texto && html`<div class="ing-tal-cual">
            <input value=${i.texto} aria-label="Cómo se ve en la receta" onInput=${(e) => cambiarIng(i.clave, { texto: e.target.value })} /></div>`}
          <div class="ing-cab">
            ${i.texto ? html`<small class="meta">Para la compra: <strong>${i.nombre}</strong></small>` : html`<strong>${i.nombre}</strong>`}
            ${!buscarArticulo(datos.articulos, i.nombre) && html`<small class="meta">nuevo · ${UNIDAD_LARGA[i.unidad]}</small>`}
            <button class="icono peq" aria-label=${`Quitar ${i.nombre}`} onClick=${() => setIngs(ings.filter((x) => x.clave !== i.clave))}>✕</button>
          </div>
          <div class="ing-datos">
            <${CantidadIngrediente} ing=${i} existe=${buscarArticulo(datos.articulos, i.nombre)} onCambio=${(c) => cambiarIng(i.clave, c)} />
            <input class="ing-nota" placeholder="Nota (picado…)" value=${i.nota} onInput=${(e) => cambiarIng(i.clave, { nota: e.target.value })} />
          </div>
        </div>`)}
      <div class="acciones">
        <button class="anadir" onClick=${() => setElegir(true)}>+ Añadir ingredientes</button>
        <button class="anadir" onClick=${() => setPegar('')}>📋 Pegar de un texto</button>
      </div>
      ${pegar != null && html`
        <div class="pegar">
          <label>Pega o escribe los ingredientes, separados por comas o en líneas
            <textarea rows="4" placeholder="80 g fideos, 1/2 cebolla, 2 tazas de caldo, sal" value=${pegar}
              onInput=${(e) => {
                const nuevo = e.target.value;
                // Al pegar (con el menú o desde el teclado) se separa solo, sin tener que pulsar nada
                const pegado = e.inputType === 'insertFromPaste' || nuevo.length - (pegar ?? '').length > 25;
                setPegar(nuevo);
                if (pegado && nuevo.trim()) separar(nuevo);
              }}></textarea></label>
          <small class="meta">Al pegar, los ingredientes se colocan solos. Si lo escribes a mano, pulsa «Separar ingredientes».</small>
          <div class="acciones">
            <button class="boton" disabled=${!pegar.trim()} onClick=${() => separar()}>Separar ingredientes</button>
            <button class="enlace" onClick=${() => setPegar(null)}>Cancelar</button>
          </div>
        </div>`}
      <p class="meta">Sin cantidad también entran en la lista de la compra (menos sal, aceite y especias, que se controlan con la despensa).</p>
      <label>Preparación<textarea rows="6" value=${f.pasos} onInput=${(e) => setF({ ...f, pasos: e.target.value })}></textarea></label>
      <button class="boton grande" disabled=${guardando || !!leyendo} onClick=${guardar}>${guardando ? 'Guardando…' : 'Guardar'}</button>
      ${elegir && html`<${ElegirIngredientes} datos=${datos} elegidos=${elegidos} onElegir=${anadir} onCerrar=${() => setElegir(false)} />`}
    </${Hoja}>`;
}

// ---------------------------------------------------------------------------
// Despensa
// ---------------------------------------------------------------------------
function PantallaDespensa({ almacen, datos, sesion }) {
  const [buscar, setBuscar] = useState('');
  const [soloFaltan, setSoloFaltan] = useState(false);
  const [editar, setEditar] = useState(null); // articulo_id o 'nuevo'
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [gastado, setGastado] = useState('');
  const [revisar, setRevisar] = useState(null);   // lo gastado, entendido, para confirmar
  const [repasar, setRepasar] = useState(false);
  const [marcas, setMarcas] = useState(null);     // articulo_id cuyas marcas se ven
  const [porFoto, setPorFoto] = useState(null);   // foto de un producto para añadirlo
  const camaraProducto = useRef(null);
  const catalogo = sesion ? obtenerCatalogo(sesion) : null;
  const [, setCatalogoListo] = useState(0);
  useEffect(() => {
    if (!catalogo) return;
    Promise.all([catalogo.cargar(datos.equivalencias.map((e) => e.producto_id)), catalogo.cargarDeTiques()])
      .then(() => setCatalogoListo((n) => n + 1)).catch((e) => console.error(e));
  }, [datos.equivalencias.length]);
  const fotosCasa = useFotos(almacen, datos.equivalencias.map((e) => e.foto_path));
  const restar = (e) => {
    e?.preventDefault();
    const cosas = entenderConsumo(gastado, datos);
    if (!cosas.length) return mostrarAviso('Di o escribe qué habéis gastado');
    setRevisar(cosas);
  };
  const filas = datos.despensa
    .filter((d) => normalizar(nombreArticulo(datos, d.articulo_id)).includes(normalizar(buscar)))
    .filter((d) => !soloFaltan || estaBajo(d));
  const faltanN = datos.despensa.filter(estaBajo).length;
  const buscando = normalizar(buscar).length >= 2;

  return html`
    <section>
      <div class="fila-campo">
        <form class="buscar-despensa" onSubmit=${(e) => {
          e.preventDefault(); e.target.querySelector('input')?.blur();
          if (filas.length === 1) setEditar(filas[0].articulo_id);
        }}>
          <input type="search" enterkeyhint="search" autocomplete="off" placeholder="Buscar en la despensa" value=${buscar}
            onInput=${(e) => setBuscar(e.target.value)} />
        </form>
        <button class="boton" onClick=${() => { setNuevoNombre(''); setEditar('nuevo'); }}>+ Añadir</button>
      </div>
      ${!buscando && html`
      <button class="boton boton-foto" onClick=${() => camaraProducto.current.click()}>📷 Añadir con una foto</button>
      <input ref=${camaraProducto} type="file" accept="image/*" capture="environment" hidden
        onChange=${(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setPorFoto(f); }} />
      <form class="gastado" onSubmit=${restar}>
        <input placeholder="He gastado… (bote de tomate, bolsa de papas)" value=${gastado}
          onInput=${(e) => setGastado(e.target.value)} aria-label="Lo que habéis gastado" />
        <${BotonDictar} onTexto=${(t) => { setGastado(t); setRevisar(entenderConsumo(t, datos)); }} />
        <button class="boton" disabled=${!gastado.trim()}>Restar</button>
      </form>
      <div class="chips">
        <button class="chip" onClick=${() => setRepasar(true)}>📋 Repasar despensa</button>
        <button class="chip ${soloFaltan ? 'activo' : ''}" onClick=${() => setSoloFaltan(!soloFaltan)}>
          Se acaba${faltanN ? ` (${faltanN})` : ''}</button>
      </div>
      ${datos.despensa.length > 0 && html`<p class="meta">Toca la foto para ver sus marcas, y el nombre para cambiar cantidad, unidad, sección o aviso. Para uno nuevo, <b>+ Añadir</b>.</p>`}
      ${datos.despensa.length === 0 && html`<div class="vacio">
        <p>Apunta lo que hay en casa. Si le pones un <b>mínimo</b>, cuando baje de ahí aparecerá en la lista de la compra.</p>
        <p><small>Ejemplo: aceite, mínimo 1 l.</small></p></div>`}`}
      ${buscando && html`<h3 class="titulo-casa">En casa</h3>
        ${!filas.length && html`<p class="vacio">No tenéis «${buscar.trim()}» en la despensa.</p>`}`}
      ${agruparPorCategoria(filas, datos.articulos).map(([cat, grupo]) => html`
        <h3 class="categoria"><span class="ico-pasillo" aria-hidden="true">${iconoPasillo(cat)}</span>${cat}</h3>
        <ul class="filas">
          ${grupo.map((d) => {
            const a = articulo(datos, d.articulo_id);
            const paso = pasoDespensa(a.unidad, d.cantidad);
            const bajo = estaBajo(d);
            const vacio = bajo && d.cantidad <= 0;
            return html`<li class="${bajo ? 'bajo' : ''} ${vacio ? 'no-hay' : ''}">
              <button class="foto-boton" aria-label=${`Abrir ${a.nombre}`} onClick=${() => setEditar(a.id)}>
                <${FotoProducto} url=${fotoDeArticulo(datos, catalogo, a.id, fotosCasa)} emoji=${emojiDe(a)} />
              </button>
              <button class="enlace nombre" onClick=${() => setEditar(d.articulo_id)}>
                <span>${a.nombre} <span class="lapiz" aria-hidden="true">✏️</span></span>
                <small>${vacio ? html`<b class="etiqueta-no-hay">No hay</b> ` : bajo ? '¡Se acaba! · ' : ''}${textoAviso(d, a.unidad)}</small>
              </button>
              <div class="contador">
                <button aria-label=${`Quitar ${paso}`} onClick=${() => almacen.sumarDespensa(a.id, -paso)}>−</button>
                <span>${formatoCantidad(d.cantidad, a.unidad)}</span>
                <button aria-label=${`Sumar ${paso}`} onClick=${() => almacen.sumarDespensa(a.id, paso)}>+</button>
              </div>
            </li>`;
          })}
        </ul>`)}
      ${buscando && html`<${OtrasOpciones} key=${normalizar(buscar.trim())} texto=${buscar.trim()} almacen=${almacen} datos=${datos}
        catalogo=${catalogo} onEscribir=${() => { setNuevoNombre(mayusculaInicial(buscar.trim())); setEditar('nuevo'); }} />`}
      ${editar && html`<${EditarDespensa} almacen=${almacen} datos=${datos} articuloId=${editar === 'nuevo' ? null : editar} nombreInicial=${nuevoNombre}
        sesion=${sesion} onCambiarSuper=${(id) => setMarcas(id)} onCerrar=${() => setEditar(null)} />`}
      ${revisar && html`<${RevisarConsumo} almacen=${almacen} datos=${datos} cosas=${revisar}
        onCerrar=${(hecho) => { setRevisar(null); if (hecho) setGastado(''); }} />`}
      ${repasar && html`<${RepasarDespensa} almacen=${almacen} datos=${datos} onCerrar=${() => setRepasar(false)} />`}
      ${marcas && html`<${MarcasArticulo} almacen=${almacen} datos=${datos} sesion=${sesion} articuloId=${marcas} onCerrar=${() => setMarcas(null)} />`}
      ${porFoto && html`<${AnadirPorFoto} key=${porFoto.name + porFoto.lastModified} almacen=${almacen} datos=${datos} sesion=${sesion}
        foto=${porFoto} onOtra=${() => camaraProducto.current.click()} onCerrar=${() => setPorFoto(null)} />`}
    </section>`;
}

// ---------------------------------------------------------------------------
// Añadir a la despensa con una foto del producto
// ---------------------------------------------------------------------------
/** Lee el código de barras de la foto en el propio móvil (Android/Chrome lo trae de serie). */
async function leerCodigoDeBarras(fichero) {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const admitidos = await window.BarcodeDetector.getSupportedFormats();
    const formatos = ['ean_13', 'ean_8', 'upc_a', 'upc_e'].filter((f) => admitidos.includes(f));
    if (!formatos.length) return null;
    const lector = new window.BarcodeDetector({ formats: formatos });
    const bmp = await createImageBitmap(fichero);
    const leidos = await lector.detect(bmp);
    bmp.close?.();
    const codigo = leidos.map((x) => x.rawValue).find((v) => /^\d{8}$|^\d{12,13}$/.test(v));
    return codigo?.length === 12 ? `0${codigo}` : codigo ?? null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

/** Qué producto es un código de barras, según Open Food Facts (base de datos abierta y gratuita). */
async function fichaPorCodigo(ean) {
  const campos = 'product_name,product_name_es,generic_name_es,brands,quantity,image_front_small_url,image_small_url,categories_tags';
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=${campos}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts respondió ${res.status}`);
  const r = await res.json();
  return r.status === 1 ? fichaDeOpenFoodFacts(r.product) : null;
}

/** Hoja: qué producto es la foto, en qué súper se compró y a qué artículo de la despensa se suma. Nada se guarda sin confirmar. */
function AnadirPorFoto({ almacen, datos, sesion, foto, onOtra, onCerrar }) {
  const [paso, setPaso] = useState('Buscando el código de barras…');
  const [leido, setLeido] = useState(null);  // { ean, ficha, productos, parecidos, exacto, texto }
  const [articuloId, setArticuloId] = useState('');      // '' = nuevo
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [seccion, setSeccion] = useState('Otros');
  const [cantidad, setCantidad] = useState(1);
  const [unidadNuevo, setUnidadNuevo] = useState('ud');
  const [minimo, setMinimo] = useState(null);
  const [supermercado, setSupermercado] = useState(null);
  const [motivo, setMotivo] = useState(null);
  const [productoId, setProductoId] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const urlFoto = useMemo(() => URL.createObjectURL(foto), [foto]);
  useEffect(() => () => URL.revokeObjectURL(urlFoto), [urlFoto]);
  const catalogo = sesion ? obtenerCatalogo(sesion) : null;

  useEffect(() => {
    let vivo = true;
    (async () => {
      const ean = await leerCodigoDeBarras(foto);
      let r = { ean, ficha: null, conocidos: [], parecidos: {}, exacto: null, texto: '' };
      if (ean) {
        setPaso('Buscando qué es por su código…');
        try { r.ficha = await fichaPorCodigo(ean); } catch (e) { console.error(e); }
      }
      const sabido = r.ficha?.nombre || r.conocidos?.[0]?.nombre;
      if (!sabido) {
        // Sin código o sin ficha: se lee el texto de la etiqueta (en el móvil)
        setPaso(ean ? 'No lo conozco por el código. Leyendo la etiqueta…' : 'No veo código de barras. Leyendo la etiqueta…');
        try {
          r.texto = nombreDeEtiqueta(await leerTextoDeImagen(foto, (n) => vivo && setPaso(`Leyendo la etiqueta… ${n}%`)));
        } catch (e) { console.error(e); }
      }
      // Lo que ya habéis comprado con ese nombre, en cada súper (sale de los tiques)
      const buscarPor = r.ficha?.nombre || r.texto;
      if (buscarPor && catalogo) {
        try {
          const [x] = await catalogo.buscar([{ texto: buscarPor, supers: SUPERS_WEB }]);
          r.parecidos = Object.fromEntries(SUPERS_WEB.map((s) => [s, x?.[s] ?? []]));
        } catch (e) { console.error(e); }
      }
      if (!vivo) return;
      // Lo que se sabe del producto
      const productos = [...(r.conocidos ?? []), ...(r.exacto && Array.isArray(r.parecidos?.[r.exacto]) ? r.parecidos[r.exacto] : [])];
      const base = productos[0] ?? null;
      const nombre = r.ficha?.nombre ?? base?.nombre ?? r.texto ?? '';
      const marca = r.ficha?.marca ?? base?.marca ?? null;
      const corto = nombreSencillo(nombre, marca) || nombre;
      const { articulo: a } = elegirArticulo({ nombre: corto, productoIds: productos.map((p) => p.id), datos });
      const sup = superProbable({ marca, nombre, exacto: r.exacto ?? base?.supermercado_id, articuloId: a?.id, datos });
      setLeido({ ...r, nombre, marca, productos });
      setArticuloId(a?.id ?? '');
      setNombreNuevo(corto);
      setSeccion(seccionDe(corto, r.ficha?.categorias ?? []));
      setSupermercado(sup.supermercado);
      setMotivo(sup.motivo);
      const delSuper = productos.find((p) => p.supermercado_id === sup.supermercado);
      setProductoId(delSuper?.id ?? null);
      setCantidad(cantidadASumar(a?.unidad ?? 'ud', delSuper ?? r.ficha ?? base));
      setMinimo(a ? avisoDe(datos.despensa.find((d) => d.articulo_id === a.id)) : null);
      setPaso(null);
    })();
    return () => { vivo = false; };
  }, [foto]);

  const art = articuloId ? articulo(datos, articuloId) : null;
  const unidad = art?.unidad ?? unidadNuevo;
  const opciones = leido && supermercado && Array.isArray(leido.parecidos?.[supermercado])
    ? [...new Map([...leido.productos.filter((p) => p.supermercado_id === supermercado), ...leido.parecidos[supermercado]]
      .map((p) => [p.id, p])).values()].slice(0, 4)
    : [];
  const elegido = opciones.find((p) => p.id === productoId) ?? null;
  const elegirSuper = (s) => {
    setSupermercado(s); setMotivo(null);
    setProductoId(leido?.productos.find((p) => p.supermercado_id === s)?.id ?? null);
  };
  const cambiarArticulo = (id) => {
    setArticuloId(id);
    const a = id ? articulo(datos, id) : null;
    setCantidad(cantidadASumar(a?.unidad ?? unidadNuevo, elegido ?? leido?.ficha));
    setMinimo(a ? avisoDe(datos.despensa.find((d) => d.articulo_id === a.id)) : null);
  };
  const enDespensa = new Set(datos.despensa.map((d) => d.articulo_id));
  const ordenados = [...datos.articulos].sort((x, y) => (enDespensa.has(y.id) - enDespensa.has(x.id)) || x.nombre.localeCompare(y.nombre, 'es'));
  const hay = art ? datos.despensa.find((d) => d.articulo_id === art.id)?.cantidad ?? 0 : 0;

  const guardar = async () => {
    if (!art && !nombreNuevo.trim()) return mostrarAviso('Escribe qué es');
    if (!(cantidad > 0)) return mostrarAviso('Pon cuánto sumar');
    setGuardando(true);
    try {
      const a = art ?? await obtenerArticulo(almacen, mayusculaInicial(nombreNuevo.trim()), unidadNuevo, seccion);
      await almacen.sumarDespensa(a.id, cantidad);
      const avisoAntes = avisoDe(datos.despensa.find((d) => d.articulo_id === a.id));
      if (minimo !== avisoAntes) await almacen.fijarDespensa(a.id, camposAviso(minimo));
      if (elegido) {
        if (!datos.equivalencias.some((e) => e.articulo_id === a.id && e.producto_id === elegido.id)) {
          await almacen.insertar('equivalencias', { articulo_id: a.id, producto_id: elegido.id, auto: false });
        }
        if (!a.foto_producto_id && elegido.imagen_url) await almacen.actualizar('articulos', a.id, { foto_producto_id: elegido.id });
      }
      mostrarAviso(`Añadido a la despensa: ${a.nombre} (+${formatoCantidad(cantidad, a.unidad)})`);
      onCerrar();
    } catch (e) {
      mostrarAviso(`No se pudo guardar: ${e.message ?? e}`);
      setGuardando(false);
    }
  };

  return html`
    <${Hoja} titulo="Añadir con una foto" onCerrar=${onCerrar}>
      <div class="foto-leida">
        <div class="fotos-cabecera">
          <${FotoProducto} url=${elegido?.imagen_url ?? leido?.ficha?.imagen_url ?? urlFoto} emoji="🛒" clase="grande" />
          ${(elegido?.imagen_url || leido?.ficha?.imagen_url) && html`<img class="mini-propia" src=${urlFoto} alt="Tu foto" />`}
        </div>
        ${leido && html`<div>
          <b>${elegido?.nombre ?? (leido.nombre || 'No he sabido leerlo')}</b>
          ${elegido && Number.isFinite(Number(elegido.precio)) && elegido.precio != null && html`<small>${nombreSuper(elegido.supermercado_id)} · ${euros(Number(elegido.precio))}</small>`}
          ${leido.marca && html`<small>${leido.marca}${leido.ficha?.formato ? ` · ${leido.ficha.formato}` : ''}</small>`}
          ${leido.ean && html`<small class="meta">Código ${leido.ean}</small>`}
        </div>`}
      </div>
      ${paso && html`<p class="cargando">${paso}</p>`}
      ${leido && html`
        ${!leido.nombre && html`<p class="texto-suave">No he podido leer qué es. Escríbelo abajo, o haz otra foto más cerca
          del código de barras.</p>`}
        ${!sesion && html`<p class="texto-suave">En el modo de prueba no se busca en los súper: solo se lee la foto.</p>`}

        <label>Va en la despensa como
          <select value=${articuloId} onChange=${(e) => cambiarArticulo(e.target.value)}>
            <option value="">Nuevo producto…</option>
            ${ordenados.map((a) => html`<option value=${a.id}>${a.nombre}${enDespensa.has(a.id) ? '' : ' (no está en la despensa)'}</option>`)}
          </select></label>
        ${!art && html`
          <label>Nombre<input value=${nombreNuevo} onInput=${(e) => setNombreNuevo(e.target.value)} placeholder="Ej.: Patatas fritas" /></label>
          <label>Sección<select value=${seccion} onChange=${(e) => setSeccion(e.target.value)}>
            ${CATEGORIAS.map((c) => html`<option value=${c}>${c}</option>`)}</select></label>`}

        ${!art && html`<label>Se cuenta por
          <select value=${unidadNuevo} onChange=${(e) => { setUnidadNuevo(e.target.value); setCantidad(cantidadASumar(e.target.value, elegido ?? leido?.ficha)); setMinimo(null); }}>
            <option value="ud">unidades (botes, paquetes, piezas…)</option><option value="g">peso (g / kg)</option><option value="ml">líquido (ml / l)</option>
          </select></label>`}
        <label>¿Cuánto añades?</label>
        <div class="ing-datos">
          ${unidad === 'ud'
            ? html`<${Contador} valor=${cantidad ?? 1} min=${1} onCambio=${setCantidad} />`
            : html`<${CampoCantidad} key=${`c-${unidad}-${articuloId}`} unidad=${unidad} valor=${cantidad} onCambio=${setCantidad} placeholder="Cantidad" />`}
          <small class="meta">${art ? `hay ${formatoCantidad(hay, unidad)} → ` : ''}quedará ${formatoCantidad(redondear(hay + (cantidad ?? 0), 3), unidad)}</small>
        </div>
        <label>¿Cuándo os aviso?</label>
        <${CampoAviso} key=${`m-${unidad}-${articuloId}`} unidad=${unidad} valor=${minimo} onCambio=${setMinimo} />

        <label>¿Dónde lo comprasteis?</label>
        <div class="acciones">
          ${[...SUPERS, ['otro', 'Otro']].map(([id, nombre]) => html`<button class="chip ${supermercado === id ? 'activo' : ''}" onClick=${() => elegirSuper(id)}>${nombre}</button>`)}
        </div>
        ${motivo && supermercado && html`<p class="texto-suave">${nombreSuper(supermercado)}: ${motivo}. Si no es, toca otro.</p>`}
        ${!supermercado && html`<p class="texto-suave">Toca el súper (no es obligatorio).</p>`}
        ${opciones.length > 0 && html`
          <p class="texto-suave">¿Es alguno de estos? Así tendrá su foto y su precio.</p>
          <ul class="marcas">
            ${opciones.map((p) => html`<li class=${productoId === p.id ? 'principal' : ''} onClick=${() => setProductoId(productoId === p.id ? null : p.id)}>
              <${FotoProducto} url=${p.imagen_url} emoji="🛒" clase="grande" />
              <div class="marca-datos">
                <b>${p.nombre}</b>
                <small>${nombreSuper(p.supermercado_id)}${formatoDe(p) ? ` · ${formatoDe(p)}` : ''}${p.ean && p.ean === leido.ean ? ' · mismo código ✓' : ''}</small>
                <span>${Number.isFinite(Number(p.precio)) && p.precio != null ? euros(Number(p.precio)) : ''}</span>
                <div class="marca-acciones"><span class="enlace">${productoId === p.id ? '✓ Es este' : 'Es este'}</span></div>
              </div>
            </li>`)}
          </ul>`}

        <button class="boton grande" disabled=${guardando || !!paso} onClick=${guardar}>
          ${guardando ? 'Guardando…' : `Añadir a la despensa`}</button>
        <p class="pie"><button class="enlace" onClick=${onOtra}>📷 Hacer otra foto</button></p>`}
    </${Hoja}>`;
}

/**
 * Al buscar en la despensa: botón «Ver otras …» que, solo si se toca, despliega lo que la casa conoce
 * y lo que ha salido en sus tiques. Se marcan las que hay, con cantidad y aviso, y se añaden de una vez.
 */
function OtrasOpciones({ texto, almacen, datos, catalogo, onEscribir }) {
  const [abierto, setAbierto] = useState(false);
  const [deSuper, setDeSuper] = useState(null);   // productos de los súper (null = sin buscar)
  const [buscandoSuper, setBuscandoSuper] = useState(false);
  const [marcadas, setMarcadas] = useState({});   // clave -> { cantidad, minimo }
  const [guardando, setGuardando] = useState(false);
  const q = normalizar(texto);
  const enDespensa = new Set(datos.despensa.map((d) => d.articulo_id));
  const enlazadoA = new Map(datos.equivalencias.map((e) => [e.producto_id, e.articulo_id]));

  const conocidas = datos.articulos
    .filter((a) => !enDespensa.has(a.id) && !pareceFrase(a.nombre) && normalizar(a.nombre).includes(q))
    .sort((x, y) => normalizar(x.nombre).indexOf(q) - normalizar(y.nombre).indexOf(q) || x.nombre.localeCompare(y.nombre, 'es'))
    .slice(0, 10)
    .map((a) => ({ clave: `a:${a.id}`, articulo: a, nombre: a.nombre, detalle: SECCION_CORTA[a.categoria] ?? a.categoria, unidad: a.unidad, emoji: emojiDe(a) }));
  const nombresConocidos = new Set(conocidas.map((o) => normalizar(o.nombre)));
  const delSuper = (deSuper ?? [])
    // Lo que ya está enlazado con algo de la despensa ya sale en «En casa»
    .filter((p) => !enDespensa.has(enlazadoA.get(p.id)))
    .map((p) => {
      const a = enlazadoA.has(p.id) ? articulo(datos, enlazadoA.get(p.id)) : null;
      return { clave: `p:${p.id}`, producto: p, articulo: a, nombre: p.nombre, unidad: a?.unidad ?? 'ud',
        detalle: [nombreSuper(p.supermercado_id), formatoDe(p), Number.isFinite(p.precio) ? euros(p.precio) : null].filter(Boolean).join(' · ') };
    })
    .filter((o) => !(o.articulo && nombresConocidos.has(normalizar(o.articulo.nombre))));
  const todas = [...conocidas, ...delSuper];
  const elegidas = todas.filter((o) => marcadas[o.clave]);

  const abrir = async () => {
    const nuevo = !abierto;
    setAbierto(nuevo);
    if (!nuevo || deSuper || !catalogo) return;
    setBuscandoSuper(true);
    try {
      const [r] = await catalogo.buscar([{ texto, supers: SUPERS_WEB }]);
      setDeSuper(SUPERS_WEB.flatMap((s) => (Array.isArray(r?.[s]) ? r[s].slice(0, 6) : [])));
    } catch (e) {
      console.error(e);
      setDeSuper([]);
    }
    setBuscandoSuper(false);
  };
  const marcar = (o) => setMarcadas((m) => {
    const x = { ...m };
    if (x[o.clave]) delete x[o.clave];
    else x[o.clave] = { cantidad: o.unidad === 'ud' ? 1 : null, minimo: null };
    return x;
  });
  const cambiar = (clave, cambios) => setMarcadas((m) => ({ ...m, [clave]: { ...m[clave], ...cambios } }));

  const resumen = elegidas.map((o) => {
    const c = marcadas[o.clave].cantidad;
    return `${o.articulo?.nombre ?? nombreSencillo(o.nombre, o.producto?.marca) ?? o.nombre}${c ? (o.unidad === 'ud' ? ` ×${c}` : ` (${formatoCantidad(c, o.unidad)})`) : ''}`;
  });
  const anadir = async () => {
    setGuardando(true);
    try {
      for (const o of elegidas) {
        const { cantidad, minimo } = marcadas[o.clave];
        let a = o.articulo;
        if (!a) {
          const nombre = mayusculaInicial(nombreSencillo(o.nombre, o.producto?.marca) || o.nombre);
          a = await obtenerArticulo(almacen, nombre, 'ud', seccionDe(nombre));
        }
        await almacen.fijarDespensa(a.id, { cantidad: cantidad ?? 0, ...camposAviso(minimo) });
        const p = o.producto;
        if (p) {
          if (!datos.equivalencias.some((e) => e.articulo_id === a.id && e.producto_id === p.id)) {
            await almacen.insertar('equivalencias', { articulo_id: a.id, producto_id: p.id, auto: false });
          }
          if (!a.foto_producto_id && p.imagen_url) await almacen.actualizar('articulos', a.id, { foto_producto_id: p.id });
        }
      }
      mostrarAviso(`Añadido a la despensa: ${resumen.join(', ')}`);
      setMarcadas({});
      setAbierto(false);
    } catch (e) {
      mostrarAviso(`No se pudo guardar: ${e.message ?? e}`);
    }
    setGuardando(false);
  };

  const fila = (o) => {
    const m = marcadas[o.clave];
    return html`<li class="opcion ${m ? 'marcada' : ''}">
      <label class="opcion-cab">
        <input type="checkbox" checked=${!!m} onChange=${() => marcar(o)} />
        ${o.producto ? html`<${FotoProducto} url=${o.producto.imagen_url} emoji="🛒" />` : html`<span class="foto-producto sin" aria-hidden="true">${o.emoji}</span>`}
        <span class="opcion-datos"><b>${o.nombre}</b><small>${o.detalle}</small></span>
      </label>
      ${m && html`<div class="opcion-extra">
        <label>Hay en casa
          ${o.unidad === 'ud'
            ? html`<${Contador} valor=${m.cantidad ?? 1} min=${1} onCambio=${(c) => cambiar(o.clave, { cantidad: c })} />`
            : html`<${CampoCantidad} unidad=${o.unidad} valor=${m.cantidad} onCambio=${(c) => cambiar(o.clave, { cantidad: c })} placeholder="Cantidad" />`}</label>
        <div class="opcion-aviso"><span>¿Cuándo os aviso?</span>
          <${CampoAviso} unidad=${o.unidad} valor=${m.minimo} onCambio=${(c) => cambiar(o.clave, { minimo: c })} /></div>
      </div>`}
    </li>`;
  };

  return html`
    <button class="abrir-otras" aria-expanded=${abierto} onClick=${abrir}>
      <span>${abierto ? `Ocultar otras opciones` : `Ver otras opciones de «${texto}»`}</span><span aria-hidden="true">${abierto ? '▴' : '▾'}</span>
    </button>
    ${abierto && html`
      ${conocidas.length > 0 && html`<h3 class="categoria">Que ya conocéis</h3><ul class="opciones">${conocidas.map(fila)}</ul>`}
      ${catalogo && html`<h3 class="categoria">De vuestros tiques</h3>
        ${buscandoSuper && html`<p class="cargando">Buscando en vuestros tiques…</p>`}
        ${deSuper && !delSuper.length && html`<p class="texto-suave">No he encontrado nada más con ese nombre.</p>`}
        ${delSuper.length > 0 && html`<ul class="opciones">${delSuper.map(fila)}</ul>`}`}
      <button class="enlace escribir-mano" onClick=${onEscribir}>✏️ Ninguna de estas: escribir «${texto}» a mano</button>`}
    ${elegidas.length > 0 && html`<div class="barra-anadir">
      <button class="boton grande" disabled=${guardando} onClick=${anadir}>
        ${guardando ? 'Guardando…' : html`Añadir a la despensa<small>${resumen.join(', ')}</small>`}</button>
    </div>`}`;
}
const SECCION_CORTA = { 'Frutas y verduras': 'fruta y verdura', 'Lácteos y huevos': 'lácteos', 'Charcutería y quesos': 'charcutería' };

/** Confirmar lo gastado antes de restarlo. Lo que no se reconoce se pregunta. */
function RevisarConsumo({ almacen, datos, cosas, onCerrar }) {
  const [filas, setFilas] = useState(cosas.map((c, i) => ({ ...c, clave: i, saltar: false })));
  const cambiar = (k, cambios) => setFilas((xs) => xs.map((x) => (x.clave === k ? { ...x, ...cambios } : x)));
  const elegir = (k, a) => {
    const f = filas.find((x) => x.clave === k);
    cambiar(k, { articulo: a, cantidad: cantidadGastada(f.leido, a, datos), saltar: false });
  };
  const enDespensa = datos.despensa.map((d) => articulo(datos, d.articulo_id)).filter(Boolean)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const listas = filas.filter((f) => !f.saltar && f.articulo && f.cantidad > 0);
  const pendientes = filas.filter((f) => !f.saltar && !f.articulo).length;
  const aplicar = async () => {
    for (const f of listas) await almacen.sumarDespensa(f.articulo.id, -f.cantidad);
    mostrarAviso(`Restado: ${listas.map((f) => `${formatoCantidad(f.cantidad, f.articulo.unidad)} de ${f.articulo.nombre}`).join(', ')}`);
    onCerrar(true);
  };
  return html`
    <${Hoja} titulo="Restar de la despensa" onCerrar=${() => onCerrar(false)}>
      ${filas.map((f) => {
        const hay = f.articulo ? datos.despensa.find((d) => d.articulo_id === f.articulo.id)?.cantidad ?? 0 : 0;
        return html`<div class="ing-fila ${f.saltar ? 'saltado' : ''}">
          <div class="ing-cab">
            <span class="meta">“${f.texto}”</span>
            <button class="enlace" onClick=${() => cambiar(f.clave, { saltar: !f.saltar })}>${f.saltar ? 'Restar' : 'Saltar'}</button>
          </div>
          ${!f.saltar && f.articulo && html`
            <div class="ing-cab"><strong>${f.articulo.nombre}</strong>
              <button class="enlace" onClick=${() => cambiar(f.clave, { articulo: null })}>No es esto</button></div>
            <div class="ing-datos">
              <${CampoCantidad} unidad=${f.articulo.unidad} valor=${f.cantidad} onCambio=${(c) => cambiar(f.clave, { cantidad: c })} />
              <small class="meta">hay ${formatoCantidad(hay, f.articulo.unidad)}${hay === 0 ? ' (no estaba apuntado)' : ''}</small>
            </div>
            ${f.cantidad > hay && hay > 0 && html`<p class="aviso-restar">Solo hay ${formatoCantidad(hay, f.articulo.unidad)}. Si restas ${formatoCantidad(f.cantidad, f.articulo.unidad)}, se quedará en 0.</p>`}`}
          ${!f.saltar && !f.articulo && html`
            <p><b>¿Qué es?</b></p>
            <div class="acciones">
              ${f.sugerencias.map((a) => html`<button class="chip" onClick=${() => elegir(f.clave, a)}>${a.nombre}</button>`)}
            </div>
            <select aria-label="Elegir de la despensa" onChange=${(e) => { const a = articulo(datos, e.target.value); if (a) elegir(f.clave, a); }}>
              <option value="">Elegir de la despensa…</option>
              ${enDespensa.map((a) => html`<option value=${a.id}>${a.nombre}</option>`)}
            </select>`}
        </div>`;
      })}
      ${pendientes > 0 && html`<p class="meta">Elige qué es o pulsa Saltar en ${pendientes === 1 ? 'la que falta' : `las ${pendientes} que faltan`}.</p>`}
      <button class="boton grande" disabled=${!listas.length || pendientes > 0} onClick=${aplicar}>
        ${textoBotonRestar(listas)}</button>
    </${Hoja}>`;
}

/** "Restar 6 ud de Merluza medallón" con una cosa; "Restar 3 productos" con varias. */
function textoBotonRestar(listas) {
  if (!listas.length) return 'Restar';
  if (listas.length === 1) {
    const f = listas[0];
    return `Restar ${formatoCantidad(f.cantidad, f.articulo.unidad)} de ${f.articulo.nombre}`;
  }
  return `Restar ${listas.length} productos`;
}

/** Recorrer la despensa y mandar a la lista lo que falta o queda poco. */
function RepasarDespensa({ almacen, datos, onCerrar }) {
  const [buscar, setBuscar] = useState('');
  const [marcas, setMarcas] = useState({});   // articulo_id -> 'poco' | 'nohay'
  const [guardando, setGuardando] = useState(false);
  const hoy = fechaISO();
  const enLista = new Set([
    ...datos.lista.filter(pendienteManual).map((l) => l.articulo_id),
    ...faltas(datos, hoy, sumarDias(hoy, leerPlazo() - 1)).map((f) => f.articulo_id),
  ]);
  const filas = datos.despensa.filter((d) => normalizar(nombreArticulo(datos, d.articulo_id)).includes(normalizar(buscar)));
  const marcar = (id, m) => setMarcas((x) => ({ ...x, [id]: x[id] === m ? undefined : m }));
  const elegidas = Object.entries(marcas).filter(([, m]) => m);
  const aplicar = async () => {
    setGuardando(true);
    for (const [id, m] of elegidas) {
      const d = datos.despensa.find((x) => x.articulo_id === id);
      if (m === 'nohay') await almacen.fijarDespensa(id, { cantidad: 0 });
      // Con mínimo y sin nada en casa, la lista ya lo pide sola.
      if (m === 'nohay' && tieneAviso(d)) continue;
      await almacen.insertar('lista', { articulo_id: id, cantidad: null, marca: null, origen: 'manual', comprado: false });
    }
    setGuardando(false);
    mostrarAviso(`${elegidas.length} apuntado${elegidas.length === 1 ? '' : 's'} en la lista`);
    onCerrar();
  };
  return html`
    <${Hoja} titulo="Repasar despensa" onCerrar=${onCerrar}>
      <p class="meta">Marca lo que queda poco o ya no hay. Irá a la lista de la compra.</p>
      <input type="search" placeholder="Buscar" value=${buscar} onInput=${(e) => setBuscar(e.target.value)} />
      ${datos.despensa.length === 0 && html`<p class="vacio">La despensa está vacía. Añade primero lo que soléis tener en casa.</p>`}
      ${agruparPorCategoria(filas, datos.articulos).map(([cat, grupo]) => html`
        <h3 class="categoria"><span class="ico-pasillo" aria-hidden="true">${iconoPasillo(cat)}</span>${cat}</h3>
        <ul class="filas repaso">
          ${grupo.map((d) => {
            const a = articulo(datos, d.articulo_id);
            const m = marcas[a.id];
            return html`<li>
              <span class="nombre">${a.nombre}<small>hay ${formatoCantidad(d.cantidad, a.unidad)}</small></span>
              ${enLista.has(a.id) && !m
                ? html`<small class="meta">✓ en la lista</small>`
                : html`<div class="chips-dia">
                    <button class="chip ${m === 'poco' ? 'activo' : ''}" onClick=${() => marcar(a.id, 'poco')}>Queda poco</button>
                    <button class="chip ${m === 'nohay' ? 'activo' : ''}" onClick=${() => marcar(a.id, 'nohay')}>No hay</button>
                  </div>`}
            </li>`;
          })}
        </ul>`)}
      <button class="boton grande fijo-abajo" disabled=${guardando} onClick=${elegidas.length ? aplicar : onCerrar}>
        ${elegidas.length ? `Apuntar ${elegidas.length} en la lista` : 'Cerrar'}</button>
    </${Hoja}>`;
}

function EditarDespensa({ almacen, datos, articuloId, nombreInicial = '', sesion, onCambiarSuper, onCerrar }) {
  const catalogo = sesion ? obtenerCatalogo(sesion) : null;
  const marcasA = articuloId && catalogo ? marcasDe(datos, catalogo, articuloId) : [];
  const fotosMarcas = useFotos(almacen, marcasA.map((m) => m.e.foto_path));
  const a0 = articuloId ? articulo(datos, articuloId) : null;
  const d0 = articuloId ? datos.despensa.find((d) => d.articulo_id === articuloId) : null;
  const [nombre, setNombre] = useState(a0?.nombre ?? nombreInicial);
  const existente = a0 ?? buscarArticulo(datos.articulos, nombre);
  const [unidad, setUnidad] = useState(a0?.unidad ?? 'ud');
  const [categoria, setCategoria] = useState(a0?.categoria ?? 'Otros');
  const [cantidad, setCantidad] = useState(d0?.cantidad ?? null);
  const [minimo, setMinimo] = useState(d0 ? avisoDe(d0) : null);
  const u = unidad;
  const enRecetas = existente ? datos.ingredientes.filter((i) => i.articulo_id === existente.id && i.cantidad != null).length : 0;

  const [clavesCampos, setClavesCampos] = useState(0);
  useEffect(() => {
    if (!existente || a0) return;
    setCategoria(existente.categoria); setUnidad(existente.unidad);
    // Si ya estaba en la despensa, se ven su cantidad y su aviso (y se cambian, no se pierden)
    const d = datos.despensa.find((x) => x.articulo_id === existente.id);
    if (d) { setCantidad(d.cantidad); setMinimo(avisoDe(d)); setClavesCampos((n) => n + 1); }
  }, [existente?.id]);

  const guardar = async () => {
    if (!nombre.trim()) return mostrarAviso('Escribe el nombre');
    let art = existente;
    if (!art) art = await obtenerArticulo(almacen, nombre, unidad, categoria);
    else {
      const cambios = {};
      if (nombre.trim() !== art.nombre && a0) cambios.nombre = nombre.trim();
      if (categoria !== art.categoria) cambios.categoria = categoria;
      if (unidad !== art.unidad) cambios.unidad = unidad;
      if (Object.keys(cambios).length) await almacen.actualizar('articulos', art.id, cambios);
    }
    await almacen.fijarDespensa(art.id, { cantidad: cantidad ?? 0, ...camposAviso(minimo) });
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
      <label>Se cuenta por
        <select value=${unidad} onChange=${(e) => { setUnidad(e.target.value); setCantidad(null); setMinimo(null); }}>
          <option value="ud">unidades (botes, paquetes, piezas…)</option><option value="g">peso (g / kg)</option><option value="ml">líquido (ml / l)</option>
        </select></label>
      ${existente && unidad !== existente.unidad && enRecetas > 0 && html`<p class="meta">Ojo: ${enRecetas === 1 ? '1 receta lo usa' : `${enRecetas} recetas lo usan`} con cantidad en ${UNIDAD_LARGA[existente.unidad]}. Revisa esas cantidades después.</p>`}
      <label>Sección<select value=${categoria} onChange=${(e) => setCategoria(e.target.value)}>
        ${CATEGORIAS.map((c) => html`<option value=${c}>${c}</option>`)}</select></label>
      <label>Hay en casa</label>
      <${CampoCantidad} key=${`c${clavesCampos}${u}`} unidad=${u} valor=${cantidad} onCambio=${setCantidad} placeholder="0" />
      <label>¿Cuándo os aviso?</label>
      <${CampoAviso} key=${`m${clavesCampos}${u}`} unidad=${u} valor=${minimo} onCambio=${setMinimo} />
      <button class="boton grande" onClick=${guardar}>Guardar</button>
      ${a0 && catalogo && (() => {
        const art = articulo(datos, a0.id) ?? a0;
        const m = marcasA.find((x) => x.p.id === art.foto_producto_id) ?? marcasA.find((x) => urlDeMarca(x, fotosMarcas)) ?? marcasA[0];
        return html`<div class="del-super">
          ${m ? html`<${FotoProducto} url=${urlDeMarca(m, fotosMarcas)} emoji=${emojiDe(art)} />
            <span class="del-super-datos"><small>De ${nombreSuper(m.p.supermercado_id)}</small>
              <span>${m.p.nombre}${Number.isFinite(m.p.precio) ? ` · ${euros(m.p.precio)}` : ''}</span></span>`
          : html`<span class="del-super-datos"><small>Sin producto del súper</small><span>Elige cuál compráis para ver su foto y su precio</span></span>`}
          <button class="enlace" onClick=${() => onCambiarSuper?.(a0.id)}>${m ? 'Cambiar' : 'Elegir'}</button>
        </div>`;
      })()}
      ${d0 && html`<p class="pie"><${BotonSeguro} texto="Quitar de la despensa" pregunta=${`¿Quieres quitar «${a0?.nombre ?? 'esto'}» de la despensa?`} si="Sí, quitar" onClick=${quitar} /></p>`}
    </${Hoja}>`;
}

// ---------------------------------------------------------------------------
// Lista de la compra
// ---------------------------------------------------------------------------
const PLAZOS = [[3, '3 días'], [7, '1 semana'], [14, '2 semanas']];
const leerPlazo = () => { try { return Number(localStorage.getItem('plazo-lista')) || 7; } catch { return 7; } };

const leerVista = () => { try { return localStorage.getItem('vista-lista'); } catch { return null; } };

/** Lo que se pasa a "¿Dónde sale más barato?" y al precio de hoy. */
const itemsComparar = (datos, filas) => filas.map((f) => {
  const a = articulo(datos, f.articulo_id);
  return { clave: f.clave, articulo_id: f.articulo_id, nombre: a?.nombre ?? '¿?', unidad: a?.unidad ?? 'ud',
    cantidad: f.cantidad ?? null, detalle: f.marca ?? null };
});

function PantallaLista({ almacen, datos, sesion }) {
  const hoy = fechaISO();
  const [plazo, setPlazo] = useState(leerPlazo());
  const [texto, setTexto] = useState('');
  const [editar, setEditar] = useState(null);
  const [comparar, setComparar] = useState(null); // filas que se comparan
  const [tengo, setTengo] = useState(false);
  const [ficha, setFicha] = useState(null);
  const [compra, setCompraEstado] = useState(leerCompra);
  const setCompra = (c) => { setCompraEstado(c); guardarCompra(c); };
  const [elegirSuper, setElegirSuper] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [coger, setCoger] = useState(false);
  const previa = useMemo(() => (texto.trim() ? entenderDictado(texto, datos.articulos, marcasConocidas()) : []), [texto, datos.articulos]);
  const hasta = sumarDias(hoy, plazo - 1);
  const auto = faltas(datos, hoy, hasta);
  const manual = datos.lista.filter(pendienteManual);
  const descartes = datos.lista.filter((l) => descarteVigente(l, hoy));
  const caducados = datos.lista.filter((l) => esDescarte(l) && !descarteVigente(l, hoy)).map((l) => l.id).join(',');
  // Los "hoy no" de otros días ya no valen: se borran.
  useEffect(() => { if (caducados) almacen.borrar('lista', caducados.split(',')); }, [caducados]);
  const comprado = datos.lista.filter((l) => l.comprado).sort((a, b) => (b.comprado_en ?? '').localeCompare(a.comprado_en ?? ''));

  // Para qué receta hace falta cada cosa (también lo que ya se pasó a "Para hoy").
  const motivos = useMemo(() => new Map(faltas({ ...datos, lista: datos.lista.filter((l) => !l.para_hoy) }, hoy, hasta)
    .map((f) => [f.articulo_id, f])), [datos, hoy, hasta]);

  const filasHoy = manual.filter((l) => l.para_hoy).map((l) => ({ ...l, tipo: 'manual', clave: l.id }));
  const filasLuego = [
    ...auto.map((f) => ({ ...f, tipo: 'auto', clave: `auto-${f.articulo_id}` })),
    ...manual.filter((l) => !l.para_hoy).map((l) => ({ ...l, tipo: 'manual', clave: l.id })),
  ];
  const [vista, setVista] = useState(() => leerVista() ?? (filasHoy.length ? 'hoy' : 'luego'));
  const elegirVista = (v) => { setVista(v); try { localStorage.setItem('vista-lista', v); } catch { /* nada */ } };
  const enHoy = vista === 'hoy';
  const catalogo = useCatalogo(datos, sesion, [...filasHoy, ...filasLuego].map((f) => f.articulo_id));
  const comprando = enHoy && compra;
  const carro = datos.lista.filter((l) => l.comprado && l.por_pagar);
  const pendientes = enHoy ? filasHoy : filasLuego;
  const tachados = comprado.filter((l) => !!l.para_hoy === enHoy).map((l) => ({ ...l, tipo: 'comprado', clave: l.id }));

  const enListaIds = new Set([...filasHoy, ...filasLuego].map((f) => f.articulo_id).concat(descartes.map((l) => l.articulo_id)));
  const sugeridas = sugerirCompra(datos, enListaIds);
  const hoyNo = (f) => almacen.insertar('lista', { articulo_id: f.articulo_id, cantidad: null, origen: 'auto', comprado: false,
    creado_en: new Date().toISOString() });
  const apuntar = (id) => almacen.insertar('lista', { articulo_id: id, cantidad: null, marca: null, origen: 'manual', comprado: false,
    para_hoy: enHoy });

  /** Pasa cosas a "Para hoy". Lo que sale de las recetas se apunta con lo que falta en ese momento. */
  const aHoy = async (filas) => {
    const nuevas = filas.filter((f) => f.tipo === 'auto').map((f) => ({ articulo_id: f.articulo_id, cantidad: f.cantidad,
      marca: null, origen: 'manual', comprado: false, para_hoy: true }));
    if (nuevas.length) await almacen.insertar('lista', nuevas);
    for (const f of filas.filter((x) => x.tipo === 'manual')) await almacen.actualizar('lista', f.id, { para_hoy: true });
  };
  const aLuego = (f) => almacen.actualizar('lista', f.id, { para_hoy: false });
  const enviarLista = () => compartir({ titulo: enHoy ? 'Compra de hoy' : 'Falta en casa',
    texto: textoLista(enHoy ? 'Compra de hoy' : 'Falta en casa', pendientes, datos.articulos) });

  const elegirPlazo = (p) => { setPlazo(p); try { localStorage.setItem('plazo-lista', String(p)); } catch { /* nada */ } };

  const anadir = async (e) => {
    e?.preventDefault();
    const frase = texto.trim();
    if (!frase) return;
    // "Necesito aceite, sal, tomate triturado y 2 kilos de papas" -> cinco cosas
    const cosas = entenderDictado(frase, datos.articulos, marcasConocidas());
    if (!cosas.length) return;
    const nombres = await anadirCosas(cosas, enHoy);
    setTexto('');
    if (cosas.length > 1) mostrarAviso(`Añadido: ${nombres.join(', ')}`);
  };

  const anadirCosas = async (cosas, paraHoy = false) => {
    const nombres = [];
    for (const c of cosas) {
      const a = c.articulo ?? await obtenerArticulo(almacen, c.nombre, unidadNueva(c), 'Otros');
      await almacen.insertar('lista', { articulo_id: a.id, cantidad: cantidadParaArticulo(c, a.unidad),
        marca: c.detalle, origen: 'manual', comprado: false, para_hoy: paraHoy });
      nombres.push(c.detalle ? `${a.nombre} (${c.detalle})` : a.nombre);
    }
    return nombres;
  };

  // Líneas antiguas con una frase dictada entera ("Necesito aceite sal tomate…"): se separan en cosas sueltas.
  const juntas = manual.filter((l) => pareceFrase(articulo(datos, l.articulo_id)?.nombre ?? ''));
  const separar = async () => {
    const nombres = [];
    for (const l of juntas) {
      const a = articulo(datos, l.articulo_id);
      const cosas = entenderDictado(a.nombre, almacen.datos.articulos, marcasConocidas());
      if (!cosas.length) continue;
      nombres.push(...await anadirCosas(cosas, !!l.para_hoy));
      const enUso = almacen.datos.despensa.some((x) => x.articulo_id === a.id)
        || almacen.datos.ingredientes.some((x) => x.articulo_id === a.id);
      if (enUso) await almacen.borrar('lista', l.id);
      else await almacen.borrar('articulos', a.id); // también quita la línea de la lista
    }
    mostrarAviso(`Separado en: ${nombres.join(', ')}`);
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

  /** En el súper: al carro con su producto, cantidad y precio (a la despensa al pagar). */
  const alCarro = async (f, elegido) => {
    const a = articulo(datos, f.articulo_id);
    const item = itemsComparar(datos, [f])[0];
    const o = elegido ?? (() => { const x = opcionEn(datos, catalogo, item, compra.super); return x ? { producto: x.producto, envases: x.envases, precioEnvase: x.producto.precio } : {}; })();
    const envases = o.envases ?? 1;
    await almacen.actualizar('lista', f.id, {
      comprado: true, comprado_en: new Date().toISOString(), por_pagar: true, super_id: compra.super,
      producto_id: o.producto?.id ?? null, envases,
      precio: o.precioEnvase != null ? redondear(o.precioEnvase * envases) : null,
      cantidad: cantidadDeEnvases(a, o.producto, envases, f.cantidad),
    });
    setFicha(null);
  };

  const deshacer = async (l) => {
    if (l.por_pagar) {
      await almacen.actualizar('lista', l.id, { comprado: false, comprado_en: null, por_pagar: false, super_id: null,
        producto_id: null, envases: null, precio: null });
      return;
    }
    if (l.cantidad) await almacen.sumarDespensa(l.articulo_id, -l.cantidad);
    if (l.origen === 'auto') await almacen.borrar('lista', l.id);
    else await almacen.actualizar('lista', l.id, { comprado: false, comprado_en: null });
  };

  const vaciarComprado = () => almacen.borrar('lista', [...comprado.filter((l) => !l.por_pagar), ...descartes].map((l) => l.id));
  const precioEn = (f) => (comprando && catalogo ? opcionEn(datos, catalogo, itemsComparar(datos, [f])[0], compra.super) : null);

  const motivoDe = (f) => {
    if (f.tipo === 'auto') {
      const casa = enCasa(datos, f.articulo_id);
      const a = datos.articulos.find((x) => x.id === f.articulo_id);
      const tenemos = casa.hay > 0 ? `tenemos ${formatoCantidad(casa.hay, a?.unidad)}` : null;
      return [f.recetas.length && f.recetas.join(', '), tenemos, f.bajoMinimo && 'se acaba'].filter(Boolean).join(' · ');
    }
    const m = motivos.get(f.articulo_id);
    const porque = m ? [m.recetas.length && m.recetas.join(', '), m.bajoMinimo && 'se acaba'].filter(Boolean).join(' · ') : '';
    return porque || 'a mano';
  };

  const fila = (f) => {
    const a = articulo(datos, f.articulo_id);
    if (f.tipo === 'comprado') {
      return html`<li key=${f.clave} class="hecho">
        <button class="marcar marcado" aria-label=${`Desmarcar: ${a?.nombre}`} onClick=${() => deshacer(f)}>✓</button>
        <button class="enlace nombre" onClick=${() => (f.por_pagar ? setFicha(f) : setEditar(f))}>
          <span class="tachar">${a?.nombre}</span>${f.marca && html` <span class="detalle">${f.marca}</span>`}<small>${f.por_pagar
            ? `en el carro${f.envases > 1 ? ` · ${f.envases} ×` : ''}` : 'en el carro · toca ✓ para desmarcar'}</small>
        </button>
        <span class="cant">${f.por_pagar && f.precio != null ? euros(f.precio) : f.cantidad != null ? formatoCantidad(f.cantidad, a?.unidad) : ''}</span>
      </li>`;
    }
    const o = precioEn(f);
    return html`<li key=${f.clave}>
      <button class="marcar" aria-label=${`Comprado: ${a?.nombre}`} onClick=${() => (comprando ? alCarro(f) : comprar(f))}></button>
      <button class="enlace nombre" onClick=${() => setFicha(f)}>
        ${a?.nombre}${f.marca && html` <span class="detalle">${f.marca}</span>`}<small>${comprando ? (o ? o.producto.nombre : 'toca para elegir el producto') : motivoDe(f)}</small>
      </button>
      <span class="cant">${f.cantidad != null ? formatoCantidad(f.cantidad, a?.unidad) : ''}${o && html`<b class="precio-fila">${o.aprox ? '≈ ' : ''}${euros(o.total)}</b>`}</span>
      ${comprando ? null : enHoy
        ? html`<button class="mover" aria-label=${`Dejar para otro día: ${a?.nombre}`} onClick=${() => aLuego(f)}>Otro día</button>`
        : html`<button class="mover hoy" aria-label=${`Pasar a hoy: ${a?.nombre}`} onClick=${() => aHoy([f])}>Hoy</button>
          ${f.tipo === 'manual'
            ? html`<button class="icono peq" aria-label=${`Quitar ${a?.nombre}`} onClick=${() => almacen.borrar('lista', f.id)}>✕</button>`
            : html`<button class="icono peq" aria-label=${`No hace falta hoy: ${a?.nombre}`} onClick=${() => hoyNo(f)}>✕</button>`}`}
    </li>`;
  };

  return html`
    <section>
      <div class="partes" role="tablist">
        <button role="tab" aria-selected=${enHoy} class=${enHoy ? 'activa' : ''} onClick=${() => elegirVista('hoy')}>
          🛒 Compra de hoy${filasHoy.length > 0 && html` <b>${filasHoy.length}</b>`}</button>
        <button role="tab" aria-selected=${!enHoy} class=${!enHoy ? 'activa' : ''} onClick=${() => elegirVista('luego')}>
          📝 Falta en casa${filasLuego.length > 0 && html` <b>${filasLuego.length}</b>`}</button>
      </div>
      <form class="fila-campo" onSubmit=${anadir}>
        <datalist id="articulos-compra">${datos.articulos.map((a) => html`<option value=${a.nombre} />`)}</datalist>
        <input list="articulos-compra" placeholder=${enHoy ? 'Añadir para hoy (o dictar)' : 'Añadir (o dictar: leche, 2 kg de papas…)'} value=${texto}
          onInput=${(e) => setTexto(e.target.value)} />
        <${BotonDictar} onTexto=${(t) => setTexto((x) => (x ? `${x}, ${t}` : t))} />
        <button class="boton" type="submit">Añadir</button>
      </form>
      ${juntas.length > 0 && html`<div class="separar">
        <span>${juntas.length === 1 ? 'Hay una línea con varias cosas juntas.' : `Hay ${juntas.length} líneas con varias cosas juntas.`}</span>
        <button class="boton" onClick=${separar}>Separarlas</button></div>`}
      ${previa.length > 1 && html`<p class="previa">Se añadirán ${previa.length}: ${previa.map((c) => c.detalle ? `${c.nombre} (${c.detalle})` : c.nombre).join(' · ')}</p>`}
      <button class="boton secundario tengo" onClick=${() => setTengo(true)}>🍳 ¿Tengo todo para…?</button>

      ${enHoy ? html`
        ${compra ? html`<div class="en-super">
            <span>🛒 Comprando en <b>${nombreSuper(compra.super)}</b><small>Tocad cada cosa para ver su foto, cuántas y el precio.</small></span>
            <button class="chip" onClick=${() => setElegirSuper(true)}>Cambiar</button>
          </div>
          <button class="boton secundario coger" onClick=${() => setCoger(true)}>+ Coger otra cosa</button>`
          : pendientes.length > 0 && html`
          <${PrecioHoy} datos=${datos} sesion=${sesion} items=${itemsComparar(datos, pendientes)} onDetalle=${() => setComparar(pendientes)} />
          <button class="boton grande empezar" onClick=${() => setElegirSuper(true)}>🛒 Empezar la compra</button>
          <button class="boton secundario enviar-lista" onClick=${enviarLista}>📤 Enviar la lista por WhatsApp</button>`}
        ${pendientes.length === 0 && tachados.length > 0 && html`<p class="vacio">Todo en el carro. 🎉</p>`}
        ${pendientes.length === 0 && tachados.length === 0 && html`<div class="vacio">
          <p>Aún no hay nada en la compra de hoy.</p>
          <p><small>En «Falta en casa» toca <b>Hoy</b> en lo que vayáis a comprar ahora, o usa «¿Tengo todo para…?» con una receta.</small></p>
          ${filasLuego.length > 0 && html`<button class="boton" onClick=${() => elegirVista('luego')}>Ver lo que falta (${filasLuego.length})</button>`}
        </div>`}
      ` : html`
        <div class="chips">
          <span class="chips-label">Recetas de:</span>
          ${PLAZOS.map(([p, t]) => html`<button class="chip ${plazo === p ? 'activo' : ''}" onClick=${() => elegirPlazo(p)}>${t}</button>`)}
        </div>
        ${pendientes.length > 1 && html`<div class="todo-hoy">
          <button class="chip" onClick=${async () => { await aHoy(pendientes); mostrarAviso('Todo pasado a la compra de hoy'); elegirVista('hoy'); }}>Todo a la compra de hoy</button>
          <button class="chip" onClick=${() => setComparar(pendientes)}>💶 Comparar precios</button>
          <button class="chip" onClick=${enviarLista}>📤 Enviar</button>
        </div>`}
        ${pendientes.length === 0 && tachados.length === 0 && html`<div class="vacio"><p>No falta nada. 🎉</p>
          <p><small>Esta lista se llena sola con las recetas del plan y con lo que baje del aviso en la despensa.</small></p></div>`}
      `}

      ${agruparPorCategoria([...pendientes, ...tachados], datos.articulos).map(([cat, grupo]) => html`
        <h3 class="categoria"><span class="ico-pasillo" aria-hidden="true">${iconoPasillo(cat)}</span>${cat}</h3>
        <ul class="filas compra">
          ${[...grupo.filter((f) => f.tipo !== 'comprado'), ...grupo.filter((f) => f.tipo === 'comprado')].map(fila)}
        </ul>`)}
      ${!enHoy && descartes.length > 0 && html`
        <div class="quitado">
          <p class="meta">Quitado de la lista de hoy (toca para volver a ponerlo):</p>
          <div class="acciones">
            ${descartes.map((l) => html`<button class="chip" onClick=${() => almacen.borrar('lista', l.id)}>↩ ${nombreArticulo(datos, l.articulo_id)}</button>`)}
          </div>
        </div>`}
      ${sugeridas.length > 0 && html`
        <div class="quitado">
          <p class="meta">¿Os hace falta? Lo soléis comprar y no está en la lista:</p>
          <div class="acciones">
            ${sugeridas.map((id) => html`<button class="chip" onClick=${() => apuntar(id)}>+ ${nombreArticulo(datos, id)}</button>`)}
          </div>
        </div>`}
      ${comprando && html`<div class="barra-pagar">
        ${carro.length > 0
          ? html`<button class="boton grande" onClick=${() => setPagando(true)}>Ya hemos pagado · ${carro.length} ${carro.length === 1 ? 'cosa' : 'cosas'} · ${euros(redondear(carro.reduce((t, l) => t + (l.precio ?? 0), 0)))}</button>`
          : html`<p class="meta">Marcad el círculo de lo que vayáis cogiendo.</p>`}
        <button class="enlace" onClick=${() => setCompra(null)}>Salir del modo compra</button>
      </div>`}
      ${comprado.filter((l) => !l.por_pagar).length > 0 && !comprando && html`
        <div class="terminar">
          <p class="texto-suave">${comprado.length === 1 ? 'Hay 1 cosa marcada' : `Hay ${comprado.length} cosas marcadas`} como ${comprado.length === 1 ? 'comprada' : 'compradas'}. Se quedan tachadas hasta que terminéis la compra.</p>
          <${BotonSeguro} texto="Terminar la compra (quitar lo tachado)" pregunta="¿Terminar la compra? Se quita de la lista todo lo tachado." si="Sí, terminar" onClick=${vaciarComprado} />
        </div>`}
      ${editar && html`<${CantidadLista} almacen=${almacen} datos=${datos} fila=${editar} onCerrar=${() => setEditar(null)} />`}
      ${comparar && html`<${Comparar} almacen=${almacen} datos=${datos} sesion=${sesion} onCerrar=${() => setComparar(null)}
        items=${itemsComparar(datos, comparar)} />`}
      ${ficha && html`<${FichaLista} almacen=${almacen} datos=${datos} sesion=${sesion} catalogo=${catalogo} fila=${ficha}
        compra=${comprando ? compra : null} onCerrar=${() => setFicha(null)} onCarro=${alCarro} onHoy=${(f) => aHoy([f])} />`}
      ${elegirSuper && html`<${ElegirSuper} almacen=${almacen} datos=${datos} catalogo=${catalogo} items=${itemsComparar(datos, filasHoy)} actual=${compra?.super}
        onCerrar=${() => setElegirSuper(false)} onElegir=${(su) => { setCompra({ super: su, desde: new Date().toISOString() }); setElegirSuper(false); }} />`}
      ${coger && html`<${CogerOtraCosa} almacen=${almacen} datos=${datos} sesion=${sesion} onCerrar=${() => setCoger(false)}
        onListo=${(f) => { setCoger(false); setFicha(f); }} />`}
      ${pagando && html`<${Pagar} almacen=${almacen} datos=${datos} sesion=${sesion} catalogo=${catalogo} compra=${compra} carro=${carro}
        onCerrar=${() => setPagando(false)} onListo=${() => { setPagando(false); setCompra(null); }} />`}
      ${tengo && html`<${TengoTodo} almacen=${almacen} datos=${datos} onCerrar=${() => setTengo(false)}
        onListo=${() => { setTengo(false); elegirVista('hoy'); }} />`}
    </section>`;
}

/**
 * Cuánto sale lo de "Para hoy" en cada súper de la casa, con los precios de vuestros tiques.
 * Respeta lo que no os gusta.
 */
let deTiquesCargado = false;
/** Catálogo de precios con los productos enlazados a estos artículos (y los de los tiques) ya cargados. */
function useCatalogo(datos, sesion, articuloIds) {
  const [, setCargado] = useState(0);
  const catalogo = sesion ? obtenerCatalogo(sesion) : null;
  const ids = datos.equivalencias.filter((e) => articuloIds.includes(e.articulo_id)).map((e) => e.producto_id);
  const clave = [...new Set(ids)].sort().join(',');
  useEffect(() => {
    if (!catalogo || !clave) return;
    let vivo = true;
    catalogo.cargar(clave.split(',')).then(() => vivo && setCargado((n) => n + 1)).catch((e) => console.error(e));
    return () => { vivo = false; };
  }, [clave]);
  // Los precios salen de vuestros tiques.
  useEffect(() => {
    if (!catalogo) return;
    let vivo = true;
    const listo = () => vivo && setCargado((n) => n + 1);
    if (deTiquesCargado) listo();
    else catalogo.cargarDeTiques().then(() => { deTiquesCargado = true; listo(); }).catch((e) => console.error(e));
    return () => { vivo = false; };
  }, []);
  return catalogo;
}

/** Lo que costaría una cosa de la lista en un súper (el producto elegido o el más barato que encaja). */
function opcionEn(datos, catalogo, item, s) {
  if (!catalogo) return null;
  const linea = calcularCesta([{ ...item, candidatos: { [s]: candidatosDe(datos, catalogo, item, s) } }], [s]).lineas[0];
  return linea.porSuper[s] ?? null;
}

/** Cuánto entra en la despensa al coger `envases` de un producto. */
function cantidadDeEnvases(articulo, producto, envases, porDefecto) {
  if (producto?.cantidad > 0 && producto.unidad === articulo?.unidad) return redondear(producto.cantidad * envases, 3);
  if (articulo?.unidad === 'ud') return envases;
  return porDefecto ?? null;
}

function PrecioHoy({ datos, sesion, items, onDetalle }) {
  const catalogo = useCatalogo(datos, sesion, items.map((i) => i.articulo_id));
  if (!catalogo) return null;

  const conCandidatos = items.map((item) => ({
    ...item,
    candidatos: Object.fromEntries(SUPERS.map(([s]) => [s, candidatosDe(datos, catalogo, item, s)])),
  }));
  const cesta = calcularCesta(conCandidatos, SUPERS.map(([s]) => s));
  const r = cesta.recomendacion;
  // Sin precios todavía: no se enseña nada (los precios llegan con los tiques).
  if (r.tipo === 'sin_datos') return null;
  const orden = [...cesta.activos].sort((a, b) => cesta.totales[a] - cesta.totales[b]);
  return html`<button class="precio-hoy" onClick=${onDetalle}>
    <span class="ph-titulo">Lo de hoy, aproximado</span>
    <span class="ph-supers">
      ${orden.map((s, i) => html`<span class=${i === 0 && orden.length > 1 && cesta.totales[s] < cesta.totales[orden[1]] ? 'ph-mejor' : ''}>
        <small>${nombreSuper(s)}</small><b>${euros(cesta.totales[s])}</b></span>`)}
    </span>
    <span class="ph-veredicto">${r.tipo === 'repartir'
      ? `Repartiendo la compra ahorras ${euros(cesta.ahorro)}`
      : orden.length > 1 && cesta.totales[orden[0]] === cesta.totales[orden[1]] ? 'Sale igual'
      : orden.length > 1 ? `Más barato en ${nombreSuper(r.supermercado)}${r.diferencia > 0 ? `: ${euros(r.diferencia)} menos` : ''}`
        : `Solo hay precios de ${nombreSuper(r.supermercado)}`}</span>
    <small>Con lo que pagasteis la última vez · ${cesta.comunes} de ${items.length} cosas · Ver detalle ›</small>
  </button>`;
}

/** "¿Tengo todo para…?": elegir receta y ver qué hay en casa y qué falta. */
function TengoTodo({ almacen, datos, onCerrar, onListo }) {
  const hoy = fechaISO();
  const [receta, setReceta] = useState(null);
  const [raciones, setRaciones] = useState(2);
  const [buscar, setBuscar] = useState('');
  const delPlan = [...new Map(datos.plan
    .filter((c) => !c.cocinado && c.fecha >= hoy && c.fecha <= sumarDias(hoy, 7))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((c) => [c.receta_id, c])).values()]
    .map((c) => ({ comida: c, receta: datos.recetas.find((r) => r.id === c.receta_id) }))
    .filter((x) => x.receta);
  const lista = datos.recetas
    .filter((r) => normalizar(r.nombre).includes(normalizar(buscar)))
    .sort((a, b) => (b.favorita - a.favorita) || a.nombre.localeCompare(b.nombre, 'es'));
  const fotos = useFotos(almacen, (receta ? [] : [...delPlan.map((x) => x.receta), ...lista]).map((r) => r.foto_path));
  const elegir = (r, n) => { setReceta(r); setRaciones(n ?? leerRaciones() ?? r.raciones ?? 2); };

  if (!receta) {
    const tarjeta = (r, extra, n) => html`<li><button class="tarjeta con-foto" onClick=${() => elegir(r, n)}>
      <${Miniatura} receta=${r} url=${r.foto_path ? fotos[r.foto_path] : null} />
      <span class="texto-tarjeta"><strong>${r.favorita ? '★ ' : ''}${r.nombre}</strong><small>${extra}</small></span>
    </button></li>`;
    return html`<${Hoja} titulo="¿Tengo todo para…?" onCerrar=${onCerrar}>
      ${delPlan.length > 0 && !buscar && html`<h3>Del plan de estos días</h3>
        <ul class="lista-recetas">${delPlan.map(({ comida, receta: r }) => tarjeta(r,
          `${nombreDia(comida.fecha, hoy)} · ${nombreMomento(comida.momento)} · ${comida.raciones} raciones`, comida.raciones))}</ul>
        <h3>Otra receta</h3>`}
      <input type="search" placeholder="Buscar receta" value=${buscar} onInput=${(e) => setBuscar(e.target.value)} />
      ${lista.length === 0 && html`<p class="vacio">No hay recetas con ese nombre.</p>`}
      <ul class="lista-recetas">${lista.map((r) => tarjeta(r, [r.tiempo_min && `${r.tiempo_min} min`, ...r.etiquetas].filter(Boolean).join(' · ')))}</ul>
    </${Hoja}>`;
  }

  const filas = tengoTodo(datos, receta.id, raciones);
  const faltan = filas.filter((f) => f.estado === 'falta');
  const enLista = filas.filter((f) => f.estado === 'en_lista');
  const listaLuego = (f) => datos.lista.filter((l) => pendienteManual(l) && !l.para_hoy && l.articulo_id === f.articulo_id);
  const porMover = enLista.flatMap(listaLuego);
  const anadir = async () => {
    if (faltan.length) {
      await almacen.insertar('lista', faltan.map((f) => ({ articulo_id: f.articulo_id, cantidad: f.falta, marca: null,
        origen: 'manual', comprado: false, para_hoy: true })));
    }
    for (const l of porMover) await almacen.actualizar('lista', l.id, { para_hoy: true });
    const n = faltan.length + porMover.length;
    mostrarAviso(`${n === 1 ? 'Pasada 1 cosa' : `Pasadas ${n} cosas`} a la compra de hoy`);
    onListo();
  };
  const icono = { hay: '✅', basico: '🧂', en_lista: '📝', falta: '🛒' };
  const texto = (f) => {
    const cuanto = (n) => formatoCantidad(n, f.unidad);
    // Si lo que hay es otra variante ("Huevos medianos m"), se dice cuál.
    const variantes = f.casa.length && (f.casa.length > 1 || f.casa[0].nombre !== f.nombre)
      ? f.casa.map((c) => `${c.nombre} ${formatoCantidad(c.cantidad, c.unidad)}`).join(', ') : null;
    if (f.estado === 'hay') {
      if (variantes) return f.necesita != null ? `Hace falta ${cuanto(f.necesita)} · en casa: ${variantes}` : `En casa: ${variantes}`;
      return f.necesita != null ? `Hace falta ${cuanto(f.necesita)} · en casa ${cuanto(f.hay)}` : `En casa ${cuanto(f.hay)}`;
    }
    if (f.estado === 'basico') return 'No está en la despensa; se da por hecho que hay';
    // Sin ser tajante: lo que pide, lo que tenemos y lo que falta.
    const tenemos = variantes ? `tenemos ${variantes}` : f.hay > 0 ? `tenemos ${cuanto(f.hay)}` : 'en la despensa no queda';
    const partes = f.falta != null
      ? [`Hace falta ${cuanto(f.necesita)}`, tenemos, `faltan ${cuanto(f.falta)}`]
      : [f.hay > 0 || variantes ? tenemos : 'No aparece en la despensa'];
    if (f.estado === 'en_lista') partes.push('ya está en la lista');
    return partes.join(' · ');
  };
  return html`<${Hoja} titulo=${receta.nombre} onCerrar=${onCerrar}>
    <button class="enlace" onClick=${() => setReceta(null)}>‹ Otra receta</button>
    <div class="fila-campo"><label>Raciones</label><${Contador} valor=${raciones} onCambio=${setRaciones} /></div>
    <div class="veredicto ${faltan.length ? 'falta' : ''}">
      <b>${faltan.length === 0 ? (enLista.length ? 'Lo que falta ya está en la lista' : 'Tenéis todo 🎉')
        : faltan.length === 1 ? 'Hay que comprar 1 cosa' : `Hay que comprar ${faltan.length} cosas`}</b>
    </div>
    <ul class="filas tengo-todo">
      ${filas.map((f) => html`<li class=${`tt-${f.estado}`}>
        <span class="tt-ico" aria-hidden="true">${icono[f.estado]}</span>
        <span class="nombre">${f.nombre}<small>${texto(f)}</small></span>
      </li>`)}
    </ul>
    ${(faltan.length > 0 || porMover.length > 0) && html`<button class="boton grande" onClick=${anadir}>
      Añadir lo que falta a la compra de hoy (${faltan.length + porMover.length})</button>`}
    <p class="meta">Mira la despensa tal como está ahora; no descuenta otras comidas del plan.</p>
  </${Hoja}>`;
}

// ---------------------------------------------------------------------------
// En el súper: elegir súper, ficha de cada cosa, al carro y «Ya hemos pagado»
// ---------------------------------------------------------------------------
const leerCompra = () => { try { return JSON.parse(localStorage.getItem('compra-en-curso')) || null; } catch { return null; } };
const guardarCompra = (c) => { try { if (c) localStorage.setItem('compra-en-curso', JSON.stringify(c)); else localStorage.removeItem('compra-en-curso'); } catch { /* nada */ } };

/** "¿En qué súper estáis?": con lo que costaría lo de hoy en cada uno. */
function ElegirSuper({ almacen, datos, catalogo, items, actual, onElegir, onCerrar }) {
  const total = (s) => {
    let suma = 0, n = 0;
    for (const item of items) {
      const o = opcionEn(datos, catalogo, item, s);
      if (o) { suma += o.total; n++; }
    }
    return { suma: redondear(suma), n };
  };
  const filas = SUPERS.map(([s, nombre]) => ({ s, nombre, ...total(s) }));
  const conTodo = filas.filter((f) => f.n === items.length);
  const mejor = conTodo.length > 1 ? conTodo.reduce((a, b) => (b.suma < a.suma ? b : a)).s : null;
  return html`<${Hoja} titulo="¿En qué súper estáis?" onCerrar=${onCerrar}>
    <p class="meta">Lo que cojáis se apunta a ese súper, con su precio. Al pagar, pasa a la despensa y a Gastos.</p>
    <div class="supers-elegir">
      ${filas.map((f) => html`<button class="super-boton ${actual === f.s ? 'activo' : ''}" onClick=${() => onElegir(f.s)}>
        <b>${f.nombre}</b>
        <span>${f.n ? `${f.n < items.length ? '≈ ' : ''}${euros(f.suma)}` : 'Sin precios aún'}</span>
        <small>${f.n === items.length ? `Todo lo de hoy${mejor === f.s ? ' · el más barato' : ''}` : f.n ? `Precio de ${f.n} de ${items.length} cosas` : 'Los precios salen de vuestros tiques'}</small>
      </button>`)}
    </div>
    ${!filas.length && html`<p class="vacio">Todavía no tenéis súper apuntados. Escribe dónde estáis comprando:</p>`}
    <${NuevoSuper} almacen=${almacen} datos=${datos} texto=${filas.length ? 'Otro súper' : 'Empezar aquí'} onAnadido=${onElegir} />
  </${Hoja}>`;
}

/**
 * Ficha de una cosa de la lista: lo que cuesta en cada súper y, si estáis comprando,
 * el producto de ese súper con su foto, cuántos cogéis y a qué precio.
 */
function FichaLista({ almacen, datos, sesion, catalogo, fila, compra, onCerrar, onCarro, onHoy }) {
  const a = articulo(datos, fila.articulo_id);
  const item = { clave: fila.clave, articulo_id: fila.articulo_id, nombre: a?.nombre ?? '¿?', unidad: a?.unidad ?? 'ud',
    cantidad: fila.cantidad ?? null, detalle: fila.marca ?? null };
  const [cambiar, setCambiar] = useState(null); // súper en el que elegir otro producto
  const s = compra?.super;
  const opcion = s ? opcionEn(datos, catalogo, item, s) : null;
  const producto = opcion?.producto ?? null;
  const [envases, setEnvases] = useState(fila.envases ?? opcion?.envases ?? 1);
  const [precio, setPrecio] = useState(() => {
    const p = fila.precio != null && fila.envases ? fila.precio / fila.envases : producto?.precio;
    return p != null ? p.toFixed(2).replace('.', ',') : '';
  });
  // Al cambiar de producto, su precio.
  const idProducto = producto?.id;
  const primera = useRef(true);
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    setPrecio(producto?.precio != null ? producto.precio.toFixed(2).replace('.', ',') : '');
    setEnvases(opcion?.envases ?? 1);
  }, [idProducto]);
  const precioNum = leerImporte(precio);
  const total = Number.isFinite(precioNum) ? redondear(precioNum * envases) : null;
  const cambiado = producto && Number.isFinite(precioNum) && Math.abs(precioNum - producto.precio) > 0.004;

  const otros = catalogo ? SUPERS.map(([id, nombre]) => ({ id, nombre, o: opcionEn(datos, catalogo, item, id) })) : [];
  const conPrecio = otros.filter((x) => x.o);
  const masBarato = conPrecio.length ? conPrecio.reduce((m, x) => (x.o.total < m.o.total ? x : m)) : null;

  const alCarro = () => onCarro(fila, { producto, envases, precioEnvase: Number.isFinite(precioNum) ? precioNum : null });

  return html`<${Hoja} titulo=${a?.nombre ?? ''} onCerrar=${onCerrar}>
    ${compra && html`
      <div class="en-este">
        <p class="meta">En ${nombreSuper(s)}</p>
        ${producto ? html`<div class="producto-ficha">
            <${FotoProducto} url=${producto.imagen_url} clase="grande" />
            <div><b>${producto.nombre}</b><small>${[formatoDe(producto), Number.isFinite(precioUnidad(producto)) && `${precioUnidad(producto).toFixed(2).replace('.', ',')} ${etiquetaUnidad(producto.unidad)}`].filter(Boolean).join(' · ')}</small></div>
          </div>`
          : html`<p class="nota">Aún no hay precio de esto en ${nombreSuper(s)}. Poned el de la etiqueta, o se guardará con el tique.</p>`}
        <div class="acciones">
          <button class="chip" onClick=${() => setCambiar(s)}>${producto ? '¿Es otro? Elegir' : 'Elegir de lo comprado aquí'}</button>
        </div>
        <div class="dos">
          <label>Cuántos cogéis<${Contador} valor=${envases} onCambio=${setEnvases} /></label>
          <label>Precio${producto ? '' : ' (opcional)'}
            <input inputmode="decimal" value=${precio} placeholder="0,00" onInput=${(e) => setPrecio(e.target.value)} /></label>
        </div>
        ${cambiado && html`<p class="nota">Precio distinto al guardado (${euros(producto.precio)}): se guardará el nuevo.</p>`}
        ${producto?.cantidad > 0 && html`<p class="meta">${envases} × ${formatoDe(producto) ?? formatoCantidad(producto.cantidad, producto.unidad)} = ${formatoCantidad(producto.cantidad * envases, producto.unidad)}</p>`}
        <button class="boton grande" onClick=${alCarro}>${fila.comprado ? 'Guardar' : 'Al carro'}${total != null ? ` · ${euros(total)}` : ''}</button>
      </div>`}

    <h3>Precio en cada súper</h3>
    ${!catalogo && html`<p class="meta">En la versión de prueba no hay precios.</p>`}
    ${catalogo && conPrecio.length === 0 && html`<p class="meta">Todavía no hay precios para esto. Llegan solos al guardar los tiques.</p>`}
    ${conPrecio.length > 0 && html`<ul class="filas comparar-ficha">
      ${otros.map(({ id, nombre, o }) => html`<li class=${masBarato?.id === id && conPrecio.length > 1 ? 'mejor' : ''}>
        <${FotoProducto} url=${o?.producto.imagen_url} clase="mini" />
        <button class="enlace nombre" onClick=${() => setCambiar(id)}>${nombre}
          <small>${o ? `${o.envases > 1 ? `${o.envases} × ` : ''}${o.producto.nombre}` : 'Sin precio todavía'}</small></button>
        <span class="cant">${o ? html`<b>${o.aprox ? '≈ ' : ''}${euros(o.total)}</b>${masBarato && masBarato.id !== id
          ? html`<small>+${euros(redondear(o.total - masBarato.o.total))}</small>` : conPrecio.length > 1 ? html`<small>el más barato</small>` : ''}` : '–'}</span>
      </li>`)}
    </ul>`}

    ${!compra && fila.tipo === 'auto' && html`<button class="boton grande" onClick=${() => { onHoy(fila); onCerrar(); }}>Pasar a la compra de hoy</button>`}
    ${!compra && fila.tipo === 'manual' && html`<${CamposLista} almacen=${almacen} datos=${datos} fila=${fila} onCerrar=${onCerrar} />`}

    ${cambiar && catalogo && html`<${ElegirProducto} almacen=${almacen} datos=${datos} catalogo=${catalogo} item=${item}
      linea=${{ mejor: cambiar, porSuper: Object.fromEntries(otros.filter((x) => x.o).map((x) => [x.id, x.o])) }}
      onCerrar=${() => setCambiar(null)} onCambio=${() => setCambiar(null)} />`}
  </${Hoja}>`;
}

/** «Ya hemos pagado»: lo del carro pasa a la despensa y la compra queda en Gastos. Con el tique, se coteja todo. */
function Pagar({ almacen, datos, sesion, catalogo, compra, carro, onCerrar, onListo }) {
  const [guardando, setGuardando] = useState(false);
  const [leyendo, setLeyendo] = useState(null); // texto de progreso
  const [tique, setTique] = useState(null);     // { total, lineas, cotejo }
  const [quitar, setQuitar] = useState({});     // id de fila del carro -> true (no venía en el tique y no se lleva)
  const [extra, setExtra] = useState({});       // índice de línea de más -> articulo_id ('' = no va a la despensa)
  const nombreProducto = (l) => (l.producto_id && catalogo?.productos.get(l.producto_id)?.nombre) || null;
  const suma = redondear(carro.reduce((t, l) => t + (l.precio ?? 0), 0));
  const [total, setTotal] = useState(suma.toFixed(2).replace('.', ','));
  const sinPrecio = carro.filter((l) => l.precio == null);

  const leerElTique = async (texto) => {
    const leido = leerTique(texto);
    const cotejo = cotejarTique(carro.map((l) => ({ ...l, nombre: nombreArticulo(datos, l.articulo_id), producto: nombreProducto(l) })), leido.lineas);
    const sugeridos = {};
    cotejo.soloTique.forEach((l, i) => { sugeridos[i] = emparejarArticulo(l.texto, datos.articulos)?.id ?? ''; });
    setExtra(sugeridos);
    setQuitar({});
    const t = leido.total ?? redondear(leido.lineas.reduce((s, l) => s + pagado(l), 0));
    setTotal(t.toFixed(2).replace('.', ','));
    setTique({ ...leido, total: t, cotejo });
  };
  const porFoto = async (fichero) => {
    try {
      setLeyendo('Leyendo el tique…');
      const texto = await leerTextoDeImagen(fichero, (n) => setLeyendo(`Leyendo el tique… ${n}%`));
      await leerElTique(texto);
    } catch (e) {
      console.error(e);
      mostrarAviso(`No se pudo leer el tique: ${e.message ?? e}`);
    }
    setLeyendo(null);
  };

  const pagar = async () => {
    setGuardando(true);
    try {
      const t = Number.isFinite(leerImporte(total)) ? leerImporte(total) : suma;
      const ahora = new Date().toISOString();
      // Lo que se lleva a casa: el carro (con el precio del tique si lo hay) y lo de más del tique con artículo.
      const precioTique = new Map((tique?.cotejo.pares ?? []).map(({ fila, linea }) => [fila.id, linea]));
      const llevados = carro.filter((l) => !quitar[l.id]);
      const lineas = tique
        ? tique.lineas.map((l) => {
          const par = tique.cotejo.pares.find((p) => p.linea === l);
          const i = tique.cotejo.soloTique.indexOf(l);
          return { texto: l.texto, cantidad: l.cantidad ?? null, precio_unidad: l.precio_unidad ?? null, importe: l.importe,
            descuento: l.descuento ?? 0, kg: !!l.kg, articulo_id: par?.fila.articulo_id ?? (i >= 0 ? extra[i] || null : null) };
        })
        : llevados.filter((l) => l.precio != null).map((l) => ({
          texto: nombreProducto(l) ?? nombreArticulo(datos, l.articulo_id), cantidad: l.envases ?? 1,
          precio_unidad: l.envases ? redondear(l.precio / l.envases) : l.precio, importe: l.precio, descuento: 0, kg: false,
          articulo_id: l.articulo_id,
        }));
      // Precio por envase visto (en la estantería o en el tique, sin el descuento)
      const precioEnvase = (l) => {
        const lt = precioTique.get(l.id);
        const importe = lt ? Number(lt.importe) : l.precio;
        if (importe == null) return null;
        const n = lt?.cantidad && !lt.kg ? lt.cantidad : l.envases ?? 1;
        return redondear(lt?.precio_unidad ?? importe / n);
      };
      if (sesion?.hogarId && sesion.hogarId !== 'demo') {
        const { error } = await sesion.cliente.rpc('guardar_tique', {
          p_hogar: sesion.hogarId, p_super: compra.super, p_fecha: ahora, p_total: t, p_lineas: lineas,
        });
        if (error) throw error;
        // Los precios de cada línea los guarda guardar_tique; aquí solo se refresca lo que se ve.
        for (const l of llevados) {
          const p = l.producto_id && catalogo?.productos.get(l.producto_id);
          const precio = precioEnvase(l);
          if (p && precio != null) catalogo.productos.set(p.id, { ...p, precio, visto_en: ahora });
        }
        catalogo?.cargarDeTiques().catch(() => {});
      } else {
        const [nuevo] = await almacen.insertar('tiques', { supermercado_id: compra.super, fecha: ahora, total: t, estado: 'revisado' });
        await almacen.insertar('tique_lineas', lineas.map((f) => ({ ...f, tique_id: nuevo.id })));
        for (const l of llevados) {
          const p = l.producto_id && catalogo?.productos.get(l.producto_id);
          const precio = precioEnvase(l);
          if (p && precio != null) catalogo.productos.set(p.id, { ...p, precio });
        }
      }
      for (const l of llevados) if (l.cantidad) await almacen.sumarDespensa(l.articulo_id, l.cantidad);
      if (tique) {
        for (const [i, l] of tique.cotejo.soloTique.entries()) {
          const a = extra[i] && articulo(datos, extra[i]);
          if (!a) continue;
          const n = l.kg && a.unidad === 'g' ? redondear(l.cantidad * 1000) : a.unidad === 'ud' ? l.cantidad ?? 1 : null;
          if (n) await almacen.sumarDespensa(a.id, n);
        }
      }
      // Lo que no se llevó vuelve a la compra de hoy.
      for (const l of carro.filter((x) => quitar[x.id])) {
        await almacen.actualizar('lista', l.id, { comprado: false, comprado_en: null, por_pagar: false, super_id: null,
          producto_id: null, envases: null, precio: null });
      }
      await almacen.borrar('lista', llevados.map((l) => l.id));
      mostrarAviso(`Compra guardada: ${euros(t)} en ${nombreSuper(compra.super)}. La despensa ya está al día.`);
      onListo();
    } catch (e) {
      console.error(e);
      mostrarAviso(`No se pudo guardar: ${e.message ?? e}`);
      setGuardando(false);
    }
  };

  const totalNum = Number.isFinite(leerImporte(total)) ? leerImporte(total) : suma;
  const c = tique?.cotejo;
  const descuentos = tique ? redondear(tique.lineas.reduce((s, l) => s + Number(l.descuento ?? 0), 0)) : 0;
  return html`<${Hoja} titulo=${`Pagar en ${nombreSuper(compra.super)}`} onCerrar=${onCerrar}>
    ${!tique && html`
      <div class="subir-tique">
        <b>¿Tenéis el tique?</b>
        <small>Lo comparo con el carro: precios reales, descuentos y si falta o sobra algo.</small>
        ${leyendo ? html`<p class="cargando">${leyendo}</p>` : html`<div class="acciones">
          <label class="boton secundario foto-chip">📷 Hacer foto<input type="file" accept="image/*" capture="environment" hidden
            onChange=${(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) porFoto(f); }} /></label>
          <label class="boton secundario foto-chip">🖼 De la galería<input type="file" accept="image/*" hidden
            onChange=${(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) porFoto(f); }} /></label>
          ${globalThis.TIQUE_DEMO && html`<button class="boton secundario" onClick=${() => leerElTique(globalThis.TIQUE_DEMO(carro, datos, catalogo))}>Usar un tique de ejemplo</button>`}
        </div>`}
      </div>
      <h3>En el carro</h3>
      <ul class="filas">
        ${carro.map((l) => html`<li>
          <span class="nombre">${nombreArticulo(datos, l.articulo_id)}<small>${[l.envases > 1 && `${l.envases} ×`, nombreProducto(l)].filter(Boolean).join(' ')}</small></span>
          <span class="cant">${l.precio != null ? euros(l.precio) : 'sin precio'}</span>
        </li>`)}
      </ul>
      ${sinPrecio.length > 0 && html`<p class="nota">Sin precio: ${sinPrecio.map((l) => nombreArticulo(datos, l.articulo_id)).join(', ')}. Pasan a la despensa pero no suman en Gastos.</p>`}`}

    ${tique && html`
      <div class="veredicto ${c.soloCarro.length || c.soloTique.length ? 'falta' : ''}">
        <b>${c.soloCarro.length || c.soloTique.length
          ? [c.soloCarro.length && `${c.soloCarro.length} sin cobrar`, c.soloTique.length && `${c.soloTique.length} de más en el tique`].filter(Boolean).join(' · ')
          : 'Todo cuadra con el carro 🎉'}</b>
        <span>Tique: ${euros(tique.total)} · Apuntado: ${euros(suma)}${descuentos > 0 ? ` · Descuentos: ${euros(descuentos)}` : ''}</span>
      </div>
      ${c.pares.length > 0 && html`<h3>✅ En el carro y en el tique</h3>
        <ul class="filas cotejo">
          ${c.pares.map(({ fila, linea }) => {
            const real = pagado(linea);
            const dif = fila.precio != null ? redondear(real - fila.precio) : null;
            return html`<li>
              <span class="nombre">${nombreArticulo(datos, fila.articulo_id)}<small>${linea.texto}${linea.descuento > 0 ? ` · descuento ${euros(linea.descuento)}` : ''}</small></span>
              <span class="cant"><b>${euros(real)}</b>${dif ? html`<small class=${dif > 0 ? 'sube' : 'baja'}>${dif > 0 ? '+' : ''}${euros(dif)} vs apuntado</small>` : ''}</span>
            </li>`;
          })}
        </ul>`}
      ${c.soloCarro.length > 0 && html`<h3>⚠️ En el carro pero no en el tique</h3>
        <p class="meta">Puede que no lo cobraran o que el tique no se lea bien. Desmarcad lo que no os habéis llevado: vuelve a la compra de hoy.</p>
        <ul class="filas">
          ${c.soloCarro.map((f) => html`<li>
            <input type="checkbox" id=${`lleva-${f.id}`} checked=${!quitar[f.id]} onChange=${(e) => setQuitar({ ...quitar, [f.id]: !e.target.checked })} />
            <label class="nombre" for=${`lleva-${f.id}`}>${nombreArticulo(datos, f.articulo_id)}<small>${quitar[f.id] ? 'No nos lo llevamos' : 'Sí nos lo llevamos'}</small></label>
            <span class="cant">${f.precio != null ? euros(f.precio) : ''}</span>
          </li>`)}
        </ul>`}
      ${c.soloTique.length > 0 && html`<h3>➕ En el tique pero no en el carro</h3>
        <p class="meta">Decid qué es para que pase a la despensa (o dejadlo en «Solo en Gastos»).</p>
        <ul class="filas extra">
          ${c.soloTique.map((l, i) => html`<li>
            <span class="nombre">${l.texto}<small>${l.cantidad ? `${l.cantidad}${l.kg ? ' kg' : ' ×'} · ` : ''}${euros(pagado(l))}</small></span>
            <select aria-label=${`Qué es ${l.texto}`} value=${extra[i] ?? ''} onChange=${(e) => setExtra({ ...extra, [i]: e.target.value })}>
              <option value="">Solo en Gastos</option>
              ${[...datos.articulos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((a) => html`<option value=${a.id}>${a.nombre}</option>`)}
            </select>
          </li>`)}
        </ul>`}
      <p><button class="enlace" onClick=${() => setTique(null)}>Quitar el tique</button></p>`}

    <label>Total pagado${tique ? ' (del tique)' : ' (cámbialo si el tique dice otra cosa)'}
      <input inputmode="decimal" value=${total} onInput=${(e) => setTotal(e.target.value)} /></label>
    <p class="meta">Al confirmar: lo que os lleváis pasa a la despensa, la compra queda en Gastos${tique ? ' con las líneas del tique' : ''} y los precios nuevos se guardan.</p>
    <button class="boton grande" disabled=${guardando || !!leyendo} onClick=${pagar}>${guardando ? 'Guardando…' : `Ya hemos pagado · ${euros(totalNum)}`}</button>
  </${Hoja}>`;
}

/** Coger algo que no estaba en la lista: se apunta en la compra de hoy y se abre su ficha. */
function CogerOtraCosa({ almacen, datos, sesion, onCerrar, onListo }) {
  const [texto, setTexto] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const apuntar = async (a, marca = null) => {
    const [fila] = await almacen.insertar('lista', { articulo_id: a.id, cantidad: null, marca, origen: 'manual', comprado: false, para_hoy: true });
    onListo({ ...fila, tipo: 'manual', clave: fila.id });
  };
  const porTexto = async (e) => {
    e?.preventDefault();
    const [c] = entenderDictado(texto.trim(), datos.articulos, marcasConocidas());
    if (!c) return;
    const a = c.articulo ?? await obtenerArticulo(almacen, c.nombre, unidadNueva(c), adivinarCategoria(c.nombre));
    await apuntar(a, c.detalle);
  };
  const porFoto = async (fichero) => {
    if (!sesion || sesion.hogarId === 'demo') { mostrarAviso('En la versión de prueba la cámara no busca productos: escribid el nombre.'); return; }
    setLeyendo(true);
    try {
      const ean = await leerCodigoDeBarras(fichero);
      if (!ean) { mostrarAviso('No veo el código de barras. Escribid el nombre.'); return; }
      const r = await preguntarPorCodigo(sesion, ean);
      const productos = [...(r.conocidos ?? []), ...(r.exacto && Array.isArray(r.parecidos?.[r.exacto]) ? r.parecidos[r.exacto] : [])];
      const nombre = r.ficha?.nombre ?? productos[0]?.nombre;
      if (!nombre) { mostrarAviso('No conozco ese código. Escribid el nombre.'); return; }
      const corto = nombreSencillo(nombre, r.ficha?.marca ?? productos[0]?.marca) || nombre;
      const { articulo: conocido } = elegirArticulo({ nombre: corto, productoIds: productos.map((p) => p.id), datos });
      const a = conocido ?? await obtenerArticulo(almacen, corto, 'ud', seccionDe(corto, r.ficha?.categorias ?? []));
      const nuevos = productos.filter((p) => !datos.equivalencias.some((e) => e.articulo_id === a.id && e.producto_id === p.id))
        .map((p) => ({ articulo_id: a.id, producto_id: p.id, auto: false }));
      if (nuevos.length) await almacen.insertar('equivalencias', nuevos);
      await apuntar(a);
    } catch (e) {
      console.error(e);
      mostrarAviso(`No se pudo leer: ${e.message ?? e}`);
    } finally {
      setLeyendo(false);
    }
  };
  return html`<${Hoja} titulo="Coger otra cosa" onCerrar=${onCerrar}>
    <p class="meta">Algo que no estaba en la lista. Después elegís el producto, cuántos y el precio.</p>
    <form class="fila-campo" onSubmit=${porTexto}>
      <input list="articulos-compra" placeholder="Qué es (leche, galletas…)" value=${texto} onInput=${(e) => setTexto(e.target.value)} autoFocus />
      <button class="boton" type="submit">Seguir</button>
    </form>
    <label class="boton secundario grande foto-chip centrado">${leyendo ? 'Leyendo…' : '📷 Foto del código de barras'}
      <input type="file" accept="image/*" capture="environment" hidden onChange=${(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) porFoto(f); }} /></label>
  </${Hoja}>`;
}

/** Cantidad y marca de una cosa apuntada a mano (dentro de la ficha). */
function CamposLista({ almacen, datos, fila, onCerrar }) {
  const a = articulo(datos, fila.articulo_id);
  const [cantidad, setCantidad] = useState(fila.cantidad);
  const [marca, setMarca] = useState(fila.marca ?? '');
  const guardar = async () => {
    await almacen.actualizar('lista', fila.id, { cantidad, marca: marca.trim() || null });
    onCerrar();
  };
  return html`<h3>En la lista</h3>
    <label>Cantidad</label>
    <${CampoCantidad} unidad=${a?.unidad} valor=${cantidad} onCambio=${setCantidad} placeholder="Sin indicar" />
    <label>Marca o tipo (opcional)
      <input placeholder="Por ejemplo: Puleva, sin lactosa…" value=${marca} onInput=${(e) => setMarca(e.target.value)} /></label>
    <button class="boton grande" onClick=${guardar}>Guardar</button>`;
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

// Tamaño del envase, si se sabe (los productos de tiques casi nunca lo traen aparte).
const formatoDe = (p) => p.formato ?? null;

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

  /** Carga los productos enlazados y busca entre lo comprado (tiques) lo que aún no tenga producto. */
  const completar = async () => {
    try {
      setEstado('cargando');
      await catalogo.cargar(almacen.datos.equivalencias.map((e) => e.producto_id));
      await catalogo.cargarDeTiques();
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
        setMensaje(`Buscando en vuestros tiques… ${i} de ${consultas.length}`);
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
      <p>Comparar precios solo funciona con cuenta: los precios salen de los tiques guardados.</p>
    </${Hoja}>`;
  }

  const cesta = calcularCesta(items.map((item) => ({
    ...item,
    candidatos: Object.fromEntries(SUPERS.map(([s]) => [s, candidatosDe(datos, catalogo, item, s)])),
  })));
  // Columnas: los súper con algún precio de vuestros tiques.
  const columnas = SUPERS.filter(([s]) => cesta.lineas.some((l) => l.porSuper[s]));
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
                  ? `Repartiendo ahorrarías ${euros(cesta.ahorro)}: no compensa ir a dos sitios (menos de ${AHORRO_MINIMO_PARA_REPARTIR} €).`
                  : 'Repartiendo no se ahorra nada.'}</span>`}
          <small>Comparando ${cesta.comunes} de ${items.length} cosas, las que tienen precio en ${cesta.activos.map(nombreSuper).join(' y ')}.</small>
          ${sueltos.map(([s, n]) => html`<small>${n}: solo ${cesta.lineas.filter((l) => l.porSuper[s]).length} precios de vuestros tiques; cuenta en "Si repartes".</small>`)}
        </div>`}
      ${r.tipo === 'sin_datos' && !ocupado && html`<p class="vacio">Aún no hay precios para comparar. Llegan solos al guardar tiques en Gastos.</p>`}

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
      <p class="meta">Precios de vuestros tiques${dias != null ? (dias < 1 ? ', de hoy' : `, el más antiguo de hace ${dias} día${dias === 1 ? '' : 's'}`) : ''}.
        Cada tique nuevo los pone al día.</p>

      ${elegir && html`<${ElegirProducto} almacen=${almacen} datos=${datos} catalogo=${catalogo} item=${elegir}
        linea=${lineaDe(elegir)} onCerrar=${() => setElegir(null)}
        onCambio=${(rebuscar) => { setElegir(null); if (rebuscar) completar(); }} />`}
    </${Hoja}>`;
}

function ElegirProducto({ almacen, datos, catalogo, item, linea, onCerrar, onCambio }) {
  const [s, setS] = useState(linea?.mejor ?? SUPERS[0]?.[0] ?? null);
  const [texto, setTexto] = useState(() => textoBusqueda(item.nombre, item.detalle, s));
  useEffect(() => { setTexto(textoBusqueda(item.nombre, item.detalle, s)); }, [s]);

  const vale = filtroGustos(datos);
  const enlaces = datos.equivalencias.filter((e) => e.articulo_id === item.articulo_id)
    .filter((e) => catalogo.productos.get(e.producto_id)?.supermercado_id === s);
  const elegidoAMano = enlaces.some((e) => !e.auto);
  const actual = linea?.porSuper[s]?.producto;
  const resultados = (s ? catalogo.deTiques(s, texto) : []).filter(Boolean);
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
      <p><small>Aquí salen los productos de vuestros tiques de ${s ? nombreSuper(s) : 'cada súper'}.</small></p>
      <form class="fila-campo" onSubmit=${(e) => e.preventDefault()}>
        <input type="search" value=${texto} onInput=${(e) => setTexto(e.target.value)} />
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
        ${resultados.length === 0 && html`<li class="vacio">Nada con ese nombre en vuestros tiques. Prueba con otras palabras, como sale en el tique.</li>`}
      </ul>
      ${disgustos.length > 0 && html`
        <h3>No le gusta</h3>
        <div class="chips">${disgustos.map((x) => html`<button class="chip" onClick=${() => almacen.borrar('preferencias', x.id)}>
          ${x.marca ?? catalogo.productos.get(x.producto_id)?.nombre ?? 'producto'} ✕</button>`)}</div>
        <p><small>Toca una para volver a permitirla.</small></p>`}
    </${Hoja}>`;
}

// ---------------------------------------------------------------------------
// Supermercados de la casa: los conocidos de España y los que se escriben a mano
// ---------------------------------------------------------------------------

/** Añade un súper a los de la casa si no está (por su nombre) y devuelve su clave. */
async function anadirSuper(almacen, datos, nombre) {
  const limpio = mayusculaInicial(nombre.trim());
  if (!limpio) return null;
  const clave = claveDeNombre(limpio);
  if (!(datos.supers ?? []).some((s) => s.clave === clave)) {
    const cadena = CADENAS.find((c) => c[0] === clave);
    await almacen.insertar('supers', { clave, nombre: cadena ? cadena[1] : limpio, orden: (datos.supers ?? []).length });
  }
  return clave;
}

/** Campo para escribir un súper (con sugerencias de cadenas conocidas) y añadirlo. */
function NuevoSuper({ almacen, datos, onAnadido, texto = 'Añadir' }) {
  const [nombre, setNombre] = useState('');
  const ya = new Set(SUPERS.map((s) => s[0]));
  const sugeridas = CADENAS.filter(([id]) => !ya.has(id));
  const anadir = async (e) => {
    e?.preventDefault();
    const clave = await anadirSuper(almacen, datos, nombre);
    if (clave) { setNombre(''); onAnadido?.(clave); }
  };
  return html`<form class="fila-campo nuevo-super" onSubmit=${anadir}>
    <input list="cadenas-super" value=${nombre} placeholder="Nombre del súper o tienda" aria-label="Nombre del súper"
      onInput=${(e) => setNombre(e.target.value)} />
    <datalist id="cadenas-super">${sugeridas.map(([, n]) => html`<option value=${n} />`)}</datalist>
    <button class="boton" disabled=${!nombre.trim()}>${texto}</button>
  </form>`;
}

/** Chips para elegir el súper (de los de la casa) y, si no está, escribirlo. */
function ChipsSuper({ almacen, datos, valor, onCambio, conNinguno = false }) {
  const [escribir, setEscribir] = useState(false);
  const lista = valor && !SUPERS.some((s) => s[0] === valor) ? [...SUPERS, [valor, nombreSuper(valor)]] : SUPERS;
  return html`<div class="chips chips-super">
      ${lista.map(([id, n]) => html`<button type="button" class="chip ${valor === id ? 'activo' : ''}" onClick=${() => onCambio(id)}>${n}</button>`)}
      ${conNinguno && html`<button type="button" class="chip ${!valor ? 'activo' : ''}" onClick=${() => onCambio('')}>No lo sé</button>`}
      <button type="button" class="chip" onClick=${() => setEscribir(!escribir)}>+ Otro súper</button>
    </div>
    ${escribir && html`<${NuevoSuper} almacen=${almacen} datos=${datos} texto="Usar"
      onAnadido=${(clave) => { setEscribir(false); onCambio(clave); }} />`}`;
}

/** Ajustes → Mis supermercados. */
function MisSupers({ almacen, datos }) {
  const propios = [...(datos.supers ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const deTiques = SUPERS.filter(([id]) => !propios.some((s) => s.clave === id));
  return html`
    <h3>Mis supermercados</h3>
    <p class="texto-suave">Salen al revisar un tique y al ir a comprar. Los que aparecen en vuestros tiques se añaden solos.</p>
    <ul class="filas">
      ${propios.map((s) => html`<li><span class="nombre">${s.nombre}</span>
        <${BotonSeguro} texto="Quitar" pregunta=${`¿Quitar ${s.nombre} de tus súper? Sus tiques no se borran.`} si="Sí, quitar"
          onClick=${() => almacen.borrar('supers', [s.id])} /></li>`)}
      ${deTiques.map(([id, n]) => html`<li><span class="nombre">${n}<small> · de vuestros tiques</small></span></li>`)}
    </ul>
    ${!propios.length && !deTiques.length && html`<p class="vacio">Aún no hay ninguno. Añade donde soléis comprar.</p>`}
    <${NuevoSuper} almacen=${almacen} datos=${datos} />`;
}

// ---------------------------------------------------------------------------
// Ajustes / casa
// ---------------------------------------------------------------------------
function PantallaAjustes({ almacen, datos, sesion, onCerrar }) {
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
        <${BotonSeguro} texto="Borrar datos de prueba" pregunta="¿Quieres borrar todos los datos de prueba de este móvil?" onClick=${borrarPrueba} />
      `}
      <${MisSupers} almacen=${almacen} datos=${datos} />
      <${Apariencia} />
      <${AjustesAvisos} datos=${datos} sesion=${sesion} />
      <h3>Instalar en el móvil</h3>
      <p>En Chrome para Android: menú ⋮ → <b>Añadir a pantalla de inicio</b> (o <b>Instalar aplicación</b>).</p>
      <p class="meta">Versión ${VERSION_APP}</p>
    </${Hoja}>`;
}

// ---------------------------------------------------------------------------
// Fotos y marcas de cada cosa de la despensa
// ---------------------------------------------------------------------------
/** Productos (marcas) enlazados con un artículo, con lo que se sabe de ellos. Lo comprado y lo elegido, primero. */
function marcasDe(datos, catalogo, articuloId) {
  if (!catalogo) return [];
  const veces = new Map();
  for (const l of datos.tique_lineas) if (l.producto_id) veces.set(l.producto_id, (veces.get(l.producto_id) ?? 0) + 1);
  return datos.equivalencias
    .filter((e) => e.articulo_id === articuloId)
    .map((e) => ({ e, p: catalogo.productos.get(e.producto_id), veces: veces.get(e.producto_id) ?? 0 }))
    .filter((x) => x.p && x.p.activo !== false)
    .sort((a, b) => b.veces - a.veces || (a.e.auto === b.e.auto ? 0 : a.e.auto ? 1 : -1)
      || (a.p.precio ?? 1e9) - (b.p.precio ?? 1e9));
}

/** La foto que representa al artículo: la elegida, o la de la marca que más compran. */
function fotoDeArticulo(datos, catalogo, articuloId, fotosCasa) {
  const marcas = marcasDe(datos, catalogo, articuloId);
  const a = datos.articulos.find((x) => x.id === articuloId);
  const elegida = a?.foto_producto_id && marcas.find((m) => m.p.id === a.foto_producto_id);
  for (const m of elegida ? [elegida, ...marcas] : marcas) {
    const url = urlDeMarca(m, fotosCasa);
    if (url) return url;
  }
  return null;
}
const urlDeMarca = (m, fotosCasa) => (m.e.foto_path ? fotosCasa[m.e.foto_path] : null) ?? m.p.imagen_url ?? null;

function FotoProducto({ url, clase = '', emoji = '🛒' }) {
  const [mal, setMal] = useState(false);
  useEffect(() => setMal(false), [url]);
  return url && !mal
    ? html`<img class="foto-producto ${clase}" src=${url} alt="" loading="lazy" referrerpolicy="no-referrer" onError=${() => setMal(true)} />`
    : html`<span class="foto-producto sin ${clase}" aria-hidden="true">${emoji}</span>`;
}

const emojiDe = (a) => iconoPasillo(a?.categoria);

/** Hoja con las marcas de un artículo: sus fotos, precio, veces compradas; buscar entre lo comprado y foto propia. */
function MarcasArticulo({ almacen, datos, sesion, articuloId, onCerrar }) {
  const a = articulo(datos, articuloId);
  const catalogo = sesion ? obtenerCatalogo(sesion) : null;
  const [, setListo] = useState(0);
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [texto, setTexto] = useState(a?.nombre ?? '');
  const [subiendo, setSubiendo] = useState(null);
  const [abierto, setAbierto] = useState(null);   // producto cuya ficha se ve
  const camara = useRef(null);
  const paraFoto = useRef(null);
  const marcas = marcasDe(datos, catalogo, articuloId);
  const fotosCasa = useFotos(almacen, marcas.map((m) => m.e.foto_path));
  const enTiques = useMemo(() => {
    const tiques = new Map(datos.tiques.map((t) => [t.id, t]));
    const vistos = new Map();
    for (const l of datos.tique_lineas) {
      if (l.articulo_id !== articuloId || l.producto_id) continue;
      const t = tiques.get(l.tique_id);
      const k = `${t?.supermercado_id}|${normalizar(l.texto)}`;
      const previo = vistos.get(k);
      if (!previo || (t?.fecha ?? '') > previo.fecha) vistos.set(k, { texto: l.texto, s: t?.supermercado_id, fecha: t?.fecha ?? '', pagado: pagado(l), veces: (previo?.veces ?? 0) + 1 });
      else previo.veces++;
    }
    return [...vistos.values()].sort((x, y) => y.fecha.localeCompare(x.fecha));
  }, [datos.tique_lineas, articuloId]);

  useEffect(() => {
    if (!catalogo) return;
    Promise.all([catalogo.cargar(datos.equivalencias.map((e) => e.producto_id)), catalogo.cargarDeTiques()])
      .then(() => setListo((n) => n + 1)).catch((e) => console.error(e));
  }, [datos.equivalencias.length]);

  if (!a) return null;
  const principal = (a.foto_producto_id && marcas.some((m) => m.p.id === a.foto_producto_id) ? a.foto_producto_id : null)
    ?? marcas.find((m) => urlDeMarca(m, fotosCasa))?.p.id;

  const buscar = async () => {
    if (!texto.trim()) return;
    setBuscando(true);
    try {
      const [r] = await catalogo.buscar([{ texto: texto.trim(), supers: SUPERS_WEB }]);
      const lista = SUPERS_WEB.flatMap((s) => (Array.isArray(r?.[s]) ? r[s] : []))
        .filter((p) => !marcas.some((m) => m.p.id === p.id)).slice(0, 16);
      setResultados(lista);
    } catch (e) {
      mostrarAviso(`No se pudo buscar: ${e.message ?? e}`);
    }
    setBuscando(false);
  };
  const enlazar = async (p) => {
    await almacen.insertar('equivalencias', { articulo_id: articuloId, producto_id: p.id, auto: false });
    setResultados((xs) => xs.filter((x) => x.id !== p.id));
    mostrarAviso(`${p.nombre} añadido a ${a.nombre}`);
  };
  const quitar = (m) => almacen.borrar('equivalencias', m.e.id);
  const hacerFoto = (m) => { paraFoto.current = m; camara.current.click(); };
  const guardarFoto = async (ev) => {
    const archivo = ev.target.files?.[0];
    ev.target.value = '';
    const m = paraFoto.current;
    if (!archivo || !m) return;
    setSubiendo(m.e.id);
    try {
      const blob = await reducirFoto(archivo, 640, 0.8);
      const ruta = await almacen.motor.subirFoto(blob);
      const anterior = m.e.foto_path;
      await almacen.actualizar('equivalencias', m.e.id, { foto_path: ruta });
      if (anterior) almacen.motor.borrarFoto(anterior).catch(() => {});
      mostrarAviso('Foto guardada');
    } catch (e) {
      mostrarAviso(`No se pudo guardar la foto: ${e.message ?? e}`);
    }
    setSubiendo(null);
  };

  return html`
    <${Hoja} titulo=${a.nombre} onCerrar=${onCerrar}>
      ${!sesion && html`<p class="texto-suave">Las fotos y marcas de los súper se ven con la cuenta de la casa (no en el modo de prueba).</p>`}
      ${sesion && !marcas.length && html`<p class="texto-suave">Todavía no hay marcas de ${a.nombre}. Se irán añadiendo al guardar tiques,
        o búscala abajo entre lo que habéis comprado.</p>`}
      <ul class="marcas">
        ${marcas.map((m) => {
          const url = urlDeMarca(m, fotosCasa);
          const propia = !m.p.imagen_url;
          const ver = abierto === m.p.id;
          return html`<li class="${principal === m.p.id ? 'principal' : ''} ${ver ? 'abierta' : ''}"
            onClick=${(ev) => { if (!ev.target.closest('button, a')) setAbierto(ver ? null : m.p.id); }}>
            <${FotoProducto} url=${url} emoji=${emojiDe(a)} clase=${ver ? 'enorme' : 'grande'} />
            <div class="marca-datos">
              <b>${m.p.nombre}</b>
              ${ver && html`<div class="ficha-marca">
                ${Number.isFinite(m.p.precio_por_unidad) && m.p.cantidad && html`<small>${euros(m.p.precio_por_unidad).replace(' €', '')} ${etiquetaUnidad(m.p.unidad)}</small>`}
                ${m.p.visto_en && html`<small>Precio visto el ${fechaCorta(m.p.visto_en)}</small>`}
              </div>`}
              <small>${nombreSuper(m.p.supermercado_id)}${m.p.marca ? ` · ${m.p.marca}` : ''}${formatoDe(m.p) ? ` · ${formatoDe(m.p)}` : ''}</small>
              <span>${Number.isFinite(m.p.precio) ? euros(m.p.precio) : ''}${m.veces ? html` <small>· comprado ${m.veces} ${m.veces === 1 ? 'vez' : 'veces'}</small>` : !m.e.auto ? html` <small>· elegido</small>` : html` <small>· para comparar</small>`}</span>
              <div class="marca-acciones">
                ${principal !== m.p.id && url && html`<button class="enlace" onClick=${() => almacen.actualizar('articulos', a.id, { foto_producto_id: m.p.id })}>⭐ Foto principal</button>`}
                ${propia && html`<button class="enlace" disabled=${subiendo === m.e.id} onClick=${() => hacerFoto(m)}>
                  ${subiendo === m.e.id ? 'Guardando…' : m.e.foto_path ? '📷 Cambiar foto' : '📷 Hacer foto'}</button>`}
                <${BotonSeguro} texto="Quitar" pregunta="¿Quieres quitar esta marca de este artículo?" si="Sí, quitar" onClick=${() => quitar(m)} />
              </div>
            </div>
          </li>`;
        })}
      </ul>
      <input ref=${camara} type="file" accept="image/*" capture="environment" hidden onChange=${guardarFoto} />
      ${enTiques.length > 0 && html`
        <h3 class="categoria">En vuestros tiques</h3>
        <ul class="lista-simple">
          ${enTiques.slice(0, 8).map((x) => html`<li>${x.texto} <small class="meta">· ${nombreSuper(x.s) ?? 'Otro'} · ${euros(x.pagado)}${x.veces > 1 ? ` · ${x.veces} veces` : ''}</small></li>`)}
        </ul>`}
      ${sesion && html`
        <h3 class="categoria">Añadir una marca</h3>
        <form class="fila-campo" onSubmit=${(e) => { e.preventDefault(); buscar(); }}>
          <input value=${texto} onInput=${(e) => setTexto(e.target.value)} aria-label="Buscar en vuestros tiques" />
          <button class="boton" disabled=${buscando}>${buscando ? 'Buscando…' : 'Buscar'}</button>
        </form>
        <p class="texto-suave">Busca entre lo que ha salido en vuestros tiques. La foto la hacéis con el móvil.</p>
        ${resultados && !resultados.length && html`<p class="vacio">No he encontrado nada más con ese nombre.</p>`}
        ${resultados?.length > 0 && html`<ul class="marcas">
          ${resultados.map((p) => html`<li>
            <${FotoProducto} url=${p.imagen_url} emoji=${emojiDe(a)} clase="grande" />
            <div class="marca-datos">
              <b>${p.nombre}</b>
              <small>${nombreSuper(p.supermercado_id)}${formatoDe(p) ? ` · ${formatoDe(p)}` : ''}</small>
              <span>${Number.isFinite(p.precio) ? euros(p.precio) : ''}</span>
              <div class="marca-acciones"><button class="boton" onClick=${() => enlazar(p)}>+ Es de las nuestras</button></div>
            </div>
          </li>`)}
        </ul>`}`}
    <//>`;
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

/** ¿Es una captura en modo oscuro? (poca zona clara; un trozo negro abajo de la pantalla no cuenta como oscuro) */
function esOscura(ctx, lienzo) {
  const { data } = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  let claros = 0, n = 0;
  for (let i = 0; i < data.length; i += 4 * 37) { if (data[i] > 160) claros++; n++; }
  return n > 0 && claros / n < 0.2;
}

let progresoOCR = null;
async function lectorDeTexto(onProgreso) {
  progresoOCR = onProgreso;
  if (!window.Tesseract) await cargarScript(`${OCR}tesseract.min.js`);
  lectorOCR ??= window.Tesseract.createWorker('spa', 1, {
    workerPath: `${OCR}worker.min.js`, corePath: OCR, langPath: OCR, gzip: true, workerBlobURL: false,
    logger: (m) => m.status === 'recognizing text' && progresoOCR?.(Math.round(m.progress * 100)),
  });
  return lectorOCR;
}

/** Dibuja la foto en gris y con más contraste, a `escala` de 2000 px de ancho como mucho. */
function lienzoParaLeer(bmp, escala = 1) {
  const e = Math.min(1, 2000 / bmp.width) * escala;
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bmp.width * e);
  lienzo.height = Math.round(bmp.height * e);
  const ctx = lienzo.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.3)';
  ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  // Capturas en modo oscuro (letra clara sobre fondo negro): se invierten, el lector lee mejor negro sobre blanco
  if (esOscura(ctx, lienzo)) {
    ctx.filter = 'grayscale(1) invert(1) contrast(1.3)';
    ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  }
  return lienzo;
}

/** Lee el texto de una foto en el propio móvil (sin mandar la foto a nadie). */
async function leerTextoDeImagen(fichero, onProgreso) {
  const lector = await lectorDeTexto(onProgreso);
  const bmp = await createImageBitmap(fichero);
  const { data } = await lector.recognize(lienzoParaLeer(bmp));
  return data.text;
}

/** Líneas con la posición de cada palabra, como las usa receta-texto.js. */
function lineasDe(data) {
  const lineas = [];
  for (const b of data.blocks ?? []) for (const p of b.paragraphs ?? []) for (const l of p.lines ?? []) {
    lineas.push({
      y0: l.bbox.y0, y1: l.bbox.y1, confianza: l.confidence,
      palabras: l.words.map((w) => ({ texto: w.text, x0: w.bbox.x0, x1: w.bbox.x1, conf: w.confidence })),
    });
  }
  return lineas;
}

/**
 * Lee una captura de receta: una lectura normal y otra a la mitad de tamaño (pilla los títulos grandes),
 * sin las zonas de foto y con las columnas rehechas.
 */
async function leerRecetaDeImagen(fichero, onProgreso) {
  const lector = await lectorDeTexto((p) => onProgreso?.(Math.round(p * 0.8)));
  const bmp = await createImageBitmap(fichero);
  const grande = lienzoParaLeer(bmp);
  const { data } = await lector.recognize(grande, {}, { blocks: true, text: true });
  progresoOCR = (p) => onProgreso?.(80 + Math.round(p * 0.2));
  // Los títulos muy grandes (y con letra de adorno) se leen mejor con la captura pequeña: a 420 y a 280 px
  let lineas = lineasDe(data);
  for (const ancho of [420, 280]) {
    const pequeno = lienzoParaLeer(bmp, Math.min(1, ancho / grande.width));
    const { data: dataPeq } = await lector.recognize(pequeno, {}, { blocks: true });
    lineas = juntarLecturas(lineas, lineasDe(dataPeq), pequeno.width / grande.width);
  }
  // Portada: la foto del plato que haya en la captura (lo que no es texto), recortada a 4:3
  // Texto seguro (palabras, no líneas enteras: una línea puede cruzar la foto con letras inventadas)
  const cajas = lineasDe(data).flatMap((l) => l.palabras.filter((p) => p.conf >= 75 && /[a-záéíóúñ0-9]{2}/i.test(p.texto))
    .map((p) => ({ x0: p.x0, x1: p.x1, y0: l.y0, y1: l.y1 })));
  const portada = await portadaDeCaptura(bmp, cajas, grande.width).catch(() => null);
  if (!lineas.length) return { texto: data.text, titulos: [], portada };
  return { texto: textoPorColumnas(lineas, grande.height), titulos: tituloPorTamano(lineas, grande.height), portada };
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

/** Último precio pagado por un envase de ese artículo en un súper (el más barato de los enlazados). */
function precioEnSuper(datos, catalogo) {
  return (articulo_id, s) => {
    if (!catalogo) return null;
    const ps = candidatosDe(datos, catalogo, { articulo_id }, s).map((p) => p.precio).filter(Number.isFinite);
    return ps.length ? Math.min(...ps) : null;
  };
}

// Un color por súper, en el orden de los de la casa.
const COLORES_SUPER = ['var(--c-super1)', 'var(--c-super2)', 'var(--c-super3)', 'var(--c-super4)', 'var(--c-super5)', 'var(--c-super6)'];
const colorSuper = (s) => {
  const i = SUPERS.findIndex((x) => x[0] === s);
  return i >= 0 && i < COLORES_SUPER.length ? COLORES_SUPER[i] : 'var(--c-otro)';
};

/** Barras de los últimos periodos, cada súper con su color. */
function GraficaGasto({ grupos, periodo }) {
  const barras = barrasPorSuper(grupos, 6, SUPERS.map((x) => x[0]));
  if (barras.length < 2) return null;
  const supers = [...new Set(barras.flatMap((b) => b.trozos.map((t) => t.s)))];
  return html`<div class="grafica-gasto">
    <div class="leyenda">${supers.map((s) => html`<span><i style=${`background:${colorSuper(s)}`}></i>${nombreDe(s)}</span>`)}</div>
    ${barras.map((b) => html`<div class="barra-gasto">
      <div class="rotulo"><span>${tituloPeriodo(b.inicio, periodo)}</span><b>${euros(b.total)}</b></div>
      <div class="barra" role="img" aria-label=${b.trozos.map((t) => `${nombreDe(t.s)} ${euros(t.valor)}`).join(', ')}>
        ${b.trozos.map((t) => html`<span style=${`width:${t.ancho}%;background:${colorSuper(t.s)}`}
          title=${`${nombreDe(t.s)}: ${euros(t.valor)}`}></span>`)}
      </div>
    </div>`)}
  </div>`;
}

const ANTERIOR = { semana: 'la semana pasada', mes: 'el mes pasado', anio: 'el año pasado' };

function PantallaGastos({ almacen, datos, sesion }) {
  // Siempre abre en «Mes»: si cada móvil recordara su periodo, uno vería la semana y otro el mes,
  // y parecería que los gastos no coinciden.
  const [periodo, setPeriodo] = useState('mes');
  const [leyendo, setLeyendo] = useState(null); // null | número (progreso) | 'cargando'
  const [revisar, setRevisar] = useState(null);
  const [ver, setVer] = useState(null);
  const [preciosListos, setPreciosListos] = useState(false);
  // Tiques leídos antes de saber quitar las líneas del pago ("ENTREGA", "IMP.:"): se limpian solos.
  useEffect(() => {
    const sobran = lineasQueSobran(datos.tiques, datos.tique_lineas);
    if (!sobran.length) return;
    almacen.borrar('tique_lineas', sobran.map((l) => l.id))
      .then(() => mostrarAviso(`Quitadas ${sobran.length} líneas que eran del pago, no productos (${[...new Set(sobran.map((l) => l.texto))].join(', ')}).`));
  }, [datos.tique_lineas.length]);
  const fichero = useRef(null);
  const camara = useRef(null);
  const catalogo = sesion ? obtenerCatalogo(sesion) : null;

  useEffect(() => {
    if (!catalogo) return;
    Promise.all([catalogo.cargar(datos.equivalencias.map((e) => e.producto_id)), catalogo.cargarDeTiques()])
      .then(() => setPreciosListos(true)).catch((e) => console.error(e));
  }, [datos.equivalencias.length, datos.tiques.length]);

  const tiques = [...datos.tiques].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const grupos = gastosPorPeriodo(tiques, periodo);
  // Arriba, siempre el periodo de hoy (aunque vaya a 0 €), no el último con tiques: así no se confunde
  // «esta semana» con una semana pasada.
  const hoyInicio = inicioPeriodo(fechaISO(), periodo);
  const actual = !tiques.length ? null
    : grupos.find((g) => g.inicio === hoyInicio) ?? { inicio: hoyInicio, total: 0, porSuper: {}, tiques: 0 };
  const comparado0 = actual ? comparaConAnterior(tiques, periodo, fechaISO(), inicioPeriodo) : null;
  const comparado = comparado0 && (comparado0.antes > 0 || comparado0.ahora > 0) ? comparado0 : null;
  const ahorro = useMemo(() => {
    if (!actual) return null;
    const ids = new Set(tiques.filter((t) => inicioPeriodo(t.fecha, periodo) === actual.inicio).map((t) => t.id));
    const superDe = new Map(tiques.map((t) => [t.id, t.supermercado_id]));
    const lineas = datos.tique_lineas.filter((l) => ids.has(l.tique_id)).map((l) => ({ ...l, supermercado_id: superDe.get(l.tique_id) }));
    return ahorroPosible(lineas, precioEnSuper(datos, catalogo), SUPERS.map(([s]) => s));
  }, [datos, periodo, preciosListos]);

  const categorias = useMemo(() => {
    if (!actual) return [];
    const ids = new Set(tiques.filter((t) => inicioPeriodo(t.fecha, periodo) === actual.inicio).map((t) => t.id));
    return gastoPorCategoria(datos.tique_lineas.filter((l) => ids.has(l.tique_id)), datos.articulos);
  }, [datos, periodo]);

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
        ${leyendo != null
          ? html`<button class="boton grande" disabled>${leyendo === 'cargando' ? 'Preparando el lector…' : `Leyendo el tique… ${leyendo}%`}</button>`
          : html`<div class="dos-botones">
              <button class="boton grande" onClick=${() => camara.current.click()}>📷 Hacer foto</button>
              <button class="boton grande" onClick=${() => fichero.current.click()}>🖼 De la galería</button>
            </div>`}
        <input ref=${camara} type="file" accept="image/*" capture="environment" hidden onChange=${elegirFoto} />
        <input ref=${fichero} type="file" accept="image/*" hidden onChange=${elegirFoto} />
        <button class="enlace" onClick=${() => setRevisar({ supermercado: null, fecha: null, total: null, lineas: [] })}>o escribirlo a mano</button>
      </div>
      <p class="texto-suave">Vale para cualquier súper: haz una foto al tique de papel, o elige de la galería una foto o una captura
        del tique de la app del súper. El texto se lee en el móvil; la foto no se guarda.</p>

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
          ${comparado && Math.abs(comparado.diferencia) >= 1 && html`<span class="comparado ${comparado.diferencia > 0 ? 'mas' : 'menos'}">
            ${euros(Math.abs(comparado.diferencia))} ${comparado.diferencia > 0 ? 'más' : 'menos'} que ${ANTERIOR[periodo]} a estas alturas (${euros(comparado.antes)})</span>`}
          ${comparado && Math.abs(comparado.diferencia) < 1 && html`<span class="comparado">Igual que ${ANTERIOR[periodo]} a estas alturas</span>`}
          <div class="por-super">
            ${Object.entries(actual.porSuper).sort((a, b) => b[1] - a[1]).map(([s, v]) => html`
              <div><span>${nombreDe(s)}</span><b>${euros(v)}</b></div>`)}
          </div>
          ${ahorro && (ahorro.ahorro >= 0.5
            ? html`<p class="ahorro">Con lo que os costó en otros súper, comprando cada cosa donde salió más barata habríais pagado <b>${euros(ahorro.ahorro)}</b> menos.</p>
                <ul class="lista-simple ahorro-detalle">
                  ${ahorro.detalle.slice(0, 5).map((x) => html`<li>${x.texto}: ${euros(x.pagado)} → ${euros(x.precio)} en ${nombreSuper(x.en)}</li>`)}
                </ul>`
            : ahorro.pagado > 0 && SUPERS.length > 1 && html`<p class="ahorro bien">Buena compra: por lo que os costó en otros súper, no habríais ahorrado casi nada.</p>`)}
        </div>`}
      ${categorias.length > 0 && html`
        <h3 class="categoria">En qué se va</h3>
        <div class="filas">
          ${categorias.slice(0, 8).map(([c, v]) => html`
            <div class="fila-gasto"><span>${c}</span><b>${euros(v)}</b></div>`)}
        </div>`}

      ${grupos.length > 1 && html`
        <h3 class="categoria">${periodo === 'mes' ? 'Por mes' : periodo === 'semana' ? 'Por semana' : 'Por año'} y súper</h3>
        <${GraficaGasto} grupos=${grupos} periodo=${periodo} />
        ${grupos.length > 6 && html`<div class="filas">
          ${grupos.slice(6, 13).map((g) => html`
            <div class="fila-gasto"><span>${tituloPeriodo(g.inicio, periodo)}</span><b>${euros(g.total)}</b></div>`)}
        </div>`}`}

      ${tiques.length > 0 && html`
        <h3 class="categoria">Tiques</h3>
        <p><button class="enlace" onClick=${() => descargarGastos(datos)}>⬇ Descargar todos los gastos (para Excel)</button></p>
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

/** Un archivo CSV (se abre en Excel) con una fila por cada cosa comprada. */
function descargarGastos(datos) {
  const tiques = new Map(datos.tiques.map((t) => [t.id, t]));
  const filas = datos.tique_lineas.filter((l) => tiques.has(l.tique_id)).map((l) => {
    const t = tiques.get(l.tique_id);
    const a = datos.articulos.find((x) => x.id === l.articulo_id);
    return [t.fecha.slice(0, 10), nombreDe(t.supermercado_id), l.texto, a?.nombre ?? '', a?.categoria ?? '',
      l.cantidad ?? '', l.kg ? 'kg' : '', l.importe, l.descuento ?? 0, pagado(l)];
  }).sort((a, b) => b[0].localeCompare(a[0]));
  const csv = textoCSV([['Fecha', 'Supermercado', 'En el tique', 'Artículo', 'Sección', 'Cantidad', 'Unidad', 'Importe', 'Descuento', 'Pagado'], ...filas]);
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  enlace.download = `gastos-super-${fechaISO()}.csv`;
  document.body.appendChild(enlace);
  enlace.click();
  setTimeout(() => { URL.revokeObjectURL(enlace.href); enlace.remove(); }, 1000);
}

function RevisarTique({ almacen, datos, sesion, leido, onCerrar }) {
  const [superId, setSuper] = useState(leido.supermercado ?? '');
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
  const [hora, setHora] = useState(leido.hora ?? '');
  const repetido = useMemo(() => tiqueRepetido(
    { supermercado: superId || null, fecha, hora: hora || null, total: totalNum ?? suma, lineas },
    datos.tiques, datos.tique_lineas,
  ), [superId, fecha, hora, totalNum, suma, lineas, datos.tiques]);
  const [aunAsi, setAunAsi] = useState(false);
  const fechaHora = () => `${fecha}T${hora || '12:00'}:00`;

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
          p_hogar: sesion.hogarId, p_super: superId || null, p_fecha: fechaHora(), p_total: t, p_lineas: filas,
        });
        if (error) throw error;
        await almacen.cargar();
      } else {
        const [tique] = await almacen.insertar('tiques', { supermercado_id: superId || null, fecha: fechaHora(), total: t, estado: 'revisado' });
        await almacen.insertar('tique_lineas', filas.map((f) => ({ ...f, tique_id: tique.id })));
      }
      if (marcar) {
        const comprados = new Set(filas.map((f) => f.articulo_id).filter(Boolean));
        for (const l of almacen.datos.lista.filter((x) => pendienteManual(x) && comprados.has(x.articulo_id))) {
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
      <label class="meta">¿De qué súper es?</label>
      <${ChipsSuper} almacen=${almacen} datos=${datos} valor=${superId} onCambio=${setSuper} conNinguno=${true} />
      <div class="fila-campo">
        <input type="date" value=${fecha} onInput=${(e) => setFecha(e.target.value)} aria-label="Fecha" />
        <input type="time" class="hora" value=${hora} onInput=${(e) => setHora(e.target.value)} aria-label="Hora" />
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
      <label class="casilla"><input type="checkbox" checked=${marcar} onChange=${(e) => setMarcar(e.target.checked)} />
        Tachar de la lista lo que ya está comprado</label>
      ${superId && html`<p class="nota">Los precios de este tique se guardan para saber lo que os cuesta cada cosa en ${nombreSuper(superId)}.</p>`}
      <div class="pie">
        ${repetido && html`<div class="repetido">
          <b>⚠ Este tique parece que ya está guardado</b>
          <span>${nombreDe(repetido.supermercado_id)} · ${fechaCorta(repetido.fecha)}${repetido.fecha.slice(11, 16) !== '12:00' ? ` · ${repetido.fecha.slice(11, 16)}` : ''} · ${euros(Number(repetido.total))}</span>
          <span>Si lo guardas otra vez, el gasto contará doble.</span>
        </div>`}
        ${repetido && !aunAsi
          ? html`<button class="boton grande" onClick=${onCerrar}>No guardar (ya lo tenía)</button>
              <button class="enlace" onClick=${() => setAunAsi(true)}>Es otro tique distinto, guardarlo igualmente</button>`
          : html`<button class="boton grande" disabled=${guardando || !lineas.length} onClick=${guardar}>${guardando ? 'Guardando…' : 'Guardar tique'}</button>`}
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
            <button class="icono peq" aria-label=${`Quitar ${l.texto}`} onClick=${() => almacen.borrar('tique_lineas', l.id)}>✕</button>
          </div>`)}
        ${Math.abs(redondear(lineas.reduce((x, l) => x + pagado(l), 0)) - Number(t.total ?? 0)) > 0.05 && html`
          <p class="texto-suave aviso-suave">Las líneas suman ${euros(redondear(lineas.reduce((x, l) => x + pagado(l), 0)))} y el total es ${euros(Number(t.total ?? 0))}: quita con ✕ lo que no sea un producto.</p>`}
        <div class="fila-gasto total"><span>Total</span><b>${euros(t.total ?? 0)}</b></div>
      </div>
      <div class="pie">
        <${BotonSeguro} texto="Borrar este tique" pregunta="¿Quieres realmente borrar este tique?"
          onClick=${async () => { await almacen.borrar('tiques', id); onCerrar(); }} />
      </div>
    <//>`;
}

// ---------------------------------------------------------------------------
// Proponer el menú de la semana
// ---------------------------------------------------------------------------
export function ProponerSemana({ almacen, datos, sesion, desde, onCerrar }) {
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
                    <small class="meta">${nombreDia(p.fecha, hoy)} · ${nombreMomento(p.momento)}</small>
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
const PESTANAS = [['inicio', 'Inicio', '🏠'], ['plan', 'Plan', '📅'], ['recetas', 'Recetas', '📖'], ['despensa', 'Despensa', '🧺'], ['lista', 'Lista', '🛒'], ['gastos', 'Gastos', '💶']];

function App({ almacen, sesion }) {
  const [datos, setDatos] = useState(almacen.datos);
  // Al abrir la app se empieza en Inicio (o en la pestaña que pida un aviso del móvil).
  const [pestana, setPestana] = useState(() => {
    const pedida = new URLSearchParams(location.search).get('pestana');
    return PESTANAS.some((p) => p[0] === pedida) ? pedida : 'inicio';
  });
  const [receta, setReceta] = useState(null); // { id, raciones, cocinar }
  const [editando, setEditando] = useState(undefined); // undefined = cerrado, null = nueva, id = editar
  const [capturas, setCapturas] = useState(null);      // capturas de una receta para leer al abrir el editor
  const [ajustes, setAjustes] = useState(false);
  // Fuera de Inicio, el botón atrás del móvil vuelve a Inicio en vez de salir de la app.
  useAtras(() => setPestana('inicio'), pestana !== 'inicio');

  useEffect(() => { setDatos(almacen.datos); return almacen.escuchar(setDatos); }, []);
  useEffect(() => { try { localStorage.setItem('pestana', pestana); } catch { /* nada */ } window.scrollTo(0, 0); }, [pestana]);

  const hoy = fechaISO();
  const nLista = useMemo(() => faltas(datos, hoy, sumarDias(hoy, leerPlazo() - 1)).length
    + datos.lista.filter(pendienteManual).length, [datos, pestana]);

  // Súper de la casa (los elegidos y los de sus tiques), antes de pintar nada.
  ponerSupers(datos);

  const props = {
    almacen, datos, sesion,
    abrirReceta: (id, raciones, { cocinar = false } = {}) => setReceta({ id, raciones, cocinar }),
    irA: setPestana,
    editarReceta: (id, fotos = null) => { setCapturas(fotos); setEditando(id); },
  };
  return html`
    <header class="cabecera">
      <h1>${PESTANAS.find((p) => p[0] === pestana)[1]}</h1>
      ${!sesion && html`<span class="modo-prueba">Prueba</span>`}
      <button class="icono" aria-label="Ajustes" onClick=${() => setAjustes(true)}>⚙</button>
    </header>
    <main>
      ${!almacen.cargado ? html`<p class="vacio">Cargando…</p>`
        : pestana === 'inicio' ? html`<${PantallaInicio} ...${props} nLista=${nLista} />`
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
    ${receta && html`<${VerReceta} key=${receta.id} ...${props} id=${receta.id} racionesIniciales=${receta.raciones} cocinarYa=${receta.cocinar}
      onCerrar=${() => setReceta(null)} onEditar=${(id) => { setReceta(null); setEditando(id); }} />`}
    ${editando !== undefined && html`<${EditarReceta} ...${props} id=${editando} capturas=${capturas}
      onCerrar=${(id) => { setEditando(undefined); setCapturas(null); if (id) setReceta({ id }); }} />`}
    ${ajustes && html`<${PantallaAjustes} almacen=${almacen} datos=${datos} sesion=${sesion} onCerrar=${() => setAjustes(false)} />`}
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
      <div class="marca"><img src="icono.svg" alt="" width="88" height="88" /><h1>Menuda</h1><p>Menú, compra y despensa en un solo sitio</p></div>
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
      ponerClienteRecetario(cliente);
      const almacen = crearAlmacen(motor);
      almacen.onError = (e) => mostrarAviso(`No se pudo guardar: ${e.message ?? e}`);
      pintar(html`<${App} almacen=${almacen} sesion=${{ cliente, hogarId, email: session.user.email }} />`);
      await almacen.cargar();
      motor.escucharCambios(() => almacen.cargar());
      // Casa nueva con recetas copiadas: pasar sus fotos y vídeos a la carpeta propia (en segundo plano)
      motor.adoptarArchivos(almacen.datos.recetas).catch((e) => console.error(e));
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

aplicarApariencia();
iniciarAtras((texto) => mostrarAviso(texto));
const raiz = document.getElementById('app');
raiz.textContent = '';
const prueba = new URLSearchParams(location.search).has('prueba') || config.MODO === 'prueba' || !config.SUPABASE_URL;
(prueba ? arrancarPrueba(raiz) : arrancarSupabase(raiz)).catch((e) => {
  console.error(e);
  raiz.textContent = `Error al arrancar: ${e.message}`;
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // Al publicar una versión nueva: se busca al abrir o volver a la app y, cuando llega, se recarga sola.
  const habia = !!navigator.serviceWorker.controller;
  let recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (habia && !recargado) { recargado = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
