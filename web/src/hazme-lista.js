// "Hazme la lista": se eligen una o varias recetas (o un menú guardado, como el de Navidad), para cuántas
// personas, y se repasa en 10 segundos qué hay ya en casa. Lo demás va a la lista, ya sumado.
// Los menús se guardan como etiqueta de las recetas ("Menú: Navidad"), así se ven en los dos móviles.
import { html, useState, useMemo } from '../vendor/preact-htm.js';
import { listaDeRecetas, formatoCantidad, normalizar, pendienteManual } from './logica.js';
import { Hoja, Contador, Miniatura, useFotos, leerRaciones, mostrarAviso } from './app.js';

const PREFIJO = 'Menú: ';
const esMenu = (e) => normalizar(e).startsWith('menu:');
const nombreMenu = (e) => e.replace(/^\s*men[uú]:\s*/i, '');

/** Menús guardados: { nombre, recetas: [id] } */
export function menusDe(datos) {
  const menus = new Map();
  for (const r of datos.recetas) {
    for (const e of r.etiquetas ?? []) {
      if (!esMenu(e)) continue;
      const n = nombreMenu(e);
      if (!menus.has(n)) menus.set(n, { nombre: n, etiqueta: e, recetas: [] });
      menus.get(n).recetas.push(r.id);
    }
  }
  return [...menus.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

const ICONO_MENU = [[/navidad|nochebuena|nochevieja|reyes/, '🎄'], [/cumple/, '🎂'], [/domingo|familia/, '🥘'],
  [/verano|playa/, '☀️'], [/fiesta|cena/, '🥂']];
const iconoMenu = (n) => ICONO_MENU.find(([re]) => re.test(normalizar(n)))?.[1] ?? '🍽️';

export function HazmeLista({ almacen, datos, paraHoy, onCerrar, onListo }) {
  const [personas, setPersonas] = useState(leerRaciones() ?? 4);
  const [elegidas, setElegidas] = useState([]);   // [{ recetaId, raciones }]
  const [buscar, setBuscar] = useState('');
  const [menu, setMenu] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [repaso, setRepaso] = useState(null);     // filas de listaDeRecetas con loTengo editable

  const menus = menusDe(datos);
  const elegida = (id) => elegidas.find((e) => e.recetaId === id);
  const alternar = (r) => setElegidas((xs) => (xs.some((e) => e.recetaId === r.id)
    ? xs.filter((e) => e.recetaId !== r.id) : [...xs, { recetaId: r.id, raciones: personas }]));
  const racionesDe = (id, n) => setElegidas((xs) => xs.map((e) => (e.recetaId === id ? { ...e, raciones: n } : e)));
  const cambiarPersonas = (n) => { setElegidas((xs) => xs.map((e) => (e.raciones === personas ? { ...e, raciones: n } : e))); setPersonas(n); };
  const elegirMenu = (m) => {
    if (menu === m.nombre) { setMenu(null); setElegidas([]); return; }
    setMenu(m.nombre);
    setElegidas(m.recetas.map((id) => ({ recetaId: id, raciones: personas })));
  };

  const guardarMenu = async () => {
    const n = nombreNuevo.trim();
    if (!n) return;
    const etiqueta = `${PREFIJO}${n}`;
    for (const { recetaId } of elegidas) {
      const r = datos.recetas.find((x) => x.id === recetaId);
      if (!r || r.etiquetas.some((e) => normalizar(e) === normalizar(etiqueta))) continue;
      await almacen.actualizar('recetas', r.id, { etiquetas: [...r.etiquetas, etiqueta] });
    }
    setGuardando(false); setNombreNuevo(''); setMenu(n);
    mostrarAviso(`Menú «${n}» guardado`);
  };

  const lista = datos.recetas
    .filter((r) => !buscar || normalizar(r.nombre).includes(normalizar(buscar)) || r.etiquetas.some((e) => normalizar(e).includes(normalizar(buscar))))
    .sort((a, b) => (!!elegida(b.id) - !!elegida(a.id)) || (b.favorita - a.favorita) || a.nombre.localeCompare(b.nombre, 'es'));
  const arriba = lista.filter((r) => elegida(r.id));
  const resto = lista.filter((r) => !elegida(r.id));
  const fotos = useFotos(almacen, repaso ? [] : lista.slice(0, 40).map((r) => r.foto_path));

  if (repaso) return html`<${Repaso} almacen=${almacen} datos=${datos} filas=${repaso} paraHoy=${paraHoy}
    onAtras=${() => setRepaso(null)} onCerrar=${onCerrar} onListo=${onListo} />`;

  const fila = (r) => {
    const e = elegida(r.id);
    return html`<li class="hl-receta ${e ? 'elegida' : ''}">
      <button class="hl-elegir" aria-pressed=${!!e} onClick=${() => alternar(r)}>
        <span class="caja ${e ? 'si' : ''}" aria-hidden="true">${e ? '✓' : ''}</span>
        <${Miniatura} receta=${r} url=${r.foto_path ? fotos[r.foto_path] : null} />
        <span class="texto-tarjeta"><strong>${r.nombre}</strong>
          <small>${[r.tiempo_min && `${r.tiempo_min} min`, ...r.etiquetas.filter((x) => !esMenu(x))].filter(Boolean).slice(0, 3).join(' · ')}</small></span>
      </button>
      ${e && html`<div class="hl-personas"><span>Para</span><${Contador} valor=${e.raciones} onCambio=${(n) => racionesDe(r.id, n)} /><span>👤</span></div>`}
    </li>`;
  };

  return html`<${Hoja} titulo="Hazme la lista" onCerrar=${onCerrar}>
    <p class="meta">Elige una receta, varias o un menú entero. Te preparo la lista con todo sumado.</p>
    <div class="fila-campo"><label>¿Para cuántas personas?</label><${Contador} valor=${personas} onCambio=${cambiarPersonas} /></div>
    ${menus.length > 0 && html`<h3>Menús guardados</h3>
      <div class="chips">${menus.map((m) => html`<button class="chip ${menu === m.nombre ? 'activo' : ''}" onClick=${() => elegirMenu(m)}>
        ${iconoMenu(m.nombre)} ${m.nombre}</button>`)}</div>`}
    <input type="search" placeholder="Buscar receta…" value=${buscar} onInput=${(e) => setBuscar(e.target.value)} />
    ${arriba.length > 0 && html`<h3>Elegidas${menu ? ` · ${menu}` : ''}</h3><ul class="lista-recetas">${arriba.map(fila)}</ul>`}
    ${elegidas.length > 1 && !guardando && html`<button class="enlace" onClick=${() => setGuardando(true)}>＋ Guardar estas recetas como menú (Navidad, cumpleaños…)</button>`}
    ${guardando && html`<form class="fila-campo hl-guardar" onSubmit=${(e) => { e.preventDefault(); guardarMenu(); }}>
      <input placeholder="Nombre del menú (Navidad…)" value=${nombreNuevo} autoFocus onInput=${(e) => setNombreNuevo(e.target.value)} />
      <button class="boton" type="submit">Guardar</button></form>`}
    ${resto.length > 0 && html`<h3>${arriba.length ? 'Añadir otra' : 'Tus recetas'}</h3><ul class="lista-recetas">${resto.slice(0, 60).map(fila)}</ul>`}
    ${lista.length === 0 && html`<p class="vacio">${datos.recetas.length ? 'No hay recetas con ese nombre.' : 'Aún no tienes recetas guardadas. Añádelas en la pestaña Recetas.'}</p>`}
    <div class="fijo-abajo hl-pie">
      <button class="boton grande" disabled=${!elegidas.length}
        onClick=${() => setRepaso(listaDeRecetas(datos, elegidas))}>
        ${elegidas.length ? `Preparar la lista · ${elegidas.length} ${elegidas.length === 1 ? 'receta' : 'recetas'}` : 'Elige alguna receta'}</button>
    </div>
  </${Hoja}>`;
}

/** "¿Ya tienes esto?": casillas para quitar lo que ya hay en casa. */
function Repaso({ almacen, datos, filas: iniciales, paraHoy, onAtras, onCerrar, onListo }) {
  const [filas, setFilas] = useState(iniciales);
  const alternar = (id) => setFilas((xs) => xs.map((f) => (f.articulo_id === id ? { ...f, loTengo: !f.loTengo } : f)));
  const comprar = filas.filter((f) => !f.loTengo);
  const grupos = useMemo(() => [
    ['Para comprar', iniciales.filter((f) => !f.loTengo).map((f) => f.articulo_id)],
    ['Esto lo sueles tener', iniciales.filter((f) => f.loTengo).map((f) => f.articulo_id)],
  ], [iniciales]);

  const anadir = async () => {
    let n = 0;
    for (const f of comprar) {
      const ya = datos.lista.find((l) => pendienteManual(l) && l.articulo_id === f.articulo_id);
      if (ya) {
        // Ya estaba apuntado: se suma lo de las recetas si los dos tienen cantidad.
        if (ya.cantidad != null && f.necesita != null) await almacen.actualizar('lista', ya.id, { cantidad: ya.cantidad + f.necesita, para_hoy: paraHoy || ya.para_hoy });
        else if (paraHoy && !ya.para_hoy) await almacen.actualizar('lista', ya.id, { para_hoy: true });
      } else {
        await almacen.insertar('lista', { articulo_id: f.articulo_id, cantidad: f.necesita, marca: null, origen: 'manual',
          comprado: false, para_hoy: paraHoy });
      }
      n++;
    }
    mostrarAviso(n === 1 ? 'Añadida 1 cosa a la lista' : `Añadidas ${n} cosas a la lista`);
    onListo();
  };

  const porId = new Map(filas.map((f) => [f.articulo_id, f]));
  return html`<${Hoja} titulo="¿Ya tienes esto?" onCerrar=${onCerrar}>
    <button class="enlace" onClick=${onAtras}>‹ Cambiar recetas</button>
    <p class="nota-verde">Toca lo que <b>ya tengas en casa</b> y no lo apunto. Lo demás va a la lista, ya sumado.</p>
    ${grupos.map(([titulo, ids]) => ids.length > 0 && html`
      <h3>${titulo} <span class="meta">${ids.length}</span></h3>
      <ul class="filas hl-repaso">
        ${ids.map((id) => porId.get(id)).map((f) => html`<li>
          <button class="hl-fila ${f.loTengo ? 'tengo' : ''}" aria-pressed=${f.loTengo} onClick=${() => alternar(f.articulo_id)}>
            <span class="caja ${f.loTengo ? 'si' : ''}" aria-hidden="true">${f.loTengo ? '✓' : ''}</span>
            <span class="nombre"><span class=${f.loTengo ? 'tachar' : ''}>${f.nombre}</span><small>${f.recetas.join(' · ')}</small></span>
            ${f.loTengo
              ? html`<span class="etiqueta-v">${f.motivo ?? 'lo tengo'}</span>`
              : f.necesita != null && html`<span class="cant">${formatoCantidad(f.necesita, f.unidad)}</span>`}
          </button>
        </li>`)}
      </ul>`)}
    <div class="fijo-abajo hl-pie">
      <button class="boton grande" disabled=${!comprar.length} onClick=${anadir}>
        ${comprar.length ? `Añadir ${comprar.length} a la lista` : 'Lo tienes todo 🎉'}</button>
    </div>
  </${Hoja}>`;
}
