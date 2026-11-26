// Plan semanal visual: cada día con sus comidas y fotos; las recetas se arrastran a un día
// (o una comida ya puesta a otro día) manteniéndolas pulsadas.
import { html, useState, useRef, useEffect, useMemo } from '../vendor/preact-htm.js';
import { fechaISO, sumarDias, nombreDia, nombreMomento, normalizar } from './logica.js';
import { useRecetario } from './recetario-vista.js';
import { esDeLaCasa, recetaGuardada, guardarDelRecetario, buscarEnRecetario, tiposDe } from './recetario.js';
import { FotoIdea } from './inicio.js';
import { recetaDelDia, filasDeIdeas, enCasa, conLoDeCasa } from './sugerencias.js';
import {
  Miniatura, useFotos, ElegirReceta, ProponerSemana, guardarRaciones, leerRaciones, useCocinar, mostrarAviso,
} from './app.js';

const LETRA_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const diaSemana = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d).getDay(); };
const numeroDia = (iso) => Number(iso.slice(8));
const FIJOS = ['comida', 'cena'];
const EXTRA = ['postre', 'tentempie'];

/**
 * Arrastrar con el dedo: hay que mantener pulsado un momento (así deslizar sigue moviendo la pantalla).
 * onSoltar(carga, hueco) recibe lo arrastrado y el hueco ({ fecha, momento }) donde se soltó, o null.
 */
function useArrastre(onSoltar) {
  const [vivo, setVivo] = useState(null); // { carga, etiqueta, foto, x, y }
  const [sobre, setSobre] = useState(null); // 'fecha|momento'
  const ref = useRef(null);

  const limpiar = () => {
    const r = ref.current;
    if (!r) return;
    clearTimeout(r.temporizador);
    cancelAnimationFrame(r.desplazar);
    for (const [ev, fn, op] of r.oyentes) window.removeEventListener(ev, fn, op);
    ref.current = null;
    setVivo(null);
    setSobre(null);
    document.body.classList.remove('arrastrando');
  };
  useEffect(() => limpiar, []);

  const huecoEn = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-hueco]');
    return el ? el.dataset.hueco : null;
  };

  const empezar = (e, carga, etiqueta, foto) => {
    if (e.button > 0 || ref.current) return;
    const r = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, activo: false, carga, oyentes: [] };
    ref.current = r;
    const escuchar = (ev, fn, op) => { window.addEventListener(ev, fn, op); r.oyentes.push([ev, fn, op]); };
    // Cerca del borde de arriba o de abajo, la pantalla se mueve sola.
    const bucle = () => {
      const alto = window.innerHeight;
      const v = r.y < 90 ? -12 : r.y > alto - 120 ? 12 : 0;
      if (v) { window.scrollBy(0, v); setSobre(huecoEn(r.x, r.y)); }
      r.desplazar = requestAnimationFrame(bucle);
    };
    r.temporizador = setTimeout(() => {
      r.activo = true;
      navigator.vibrate?.(25);
      document.body.classList.add('arrastrando');
      setVivo({ carga, etiqueta, foto, x: r.x, y: r.y });
      r.desplazar = requestAnimationFrame(bucle);
    }, e.pointerType === 'mouse' ? 120 : 320);

    escuchar('pointermove', (ev) => {
      r.x = ev.clientX; r.y = ev.clientY;
      if (!r.activo) {
        if (Math.hypot(r.x - r.x0, r.y - r.y0) > 10) limpiar(); // se está deslizando la pantalla
        return;
      }
      setVivo((v) => v && { ...v, x: r.x, y: r.y });
      setSobre(huecoEn(r.x, r.y));
    });
    // Mientras se arrastra, que el dedo no mueva la pantalla.
    escuchar('touchmove', (ev) => { if (r.activo && ev.cancelable) ev.preventDefault(); }, { passive: false });
    escuchar('pointerup', () => {
      if (r.activo) {
        const hueco = huecoEn(r.x, r.y);
        // El toque que acaba el arrastre no debe abrir nada.
        const tragar = (c) => { c.stopPropagation(); c.preventDefault(); };
        window.addEventListener('click', tragar, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', tragar, { capture: true }), 400);
        onSoltar(carga, hueco ? { fecha: hueco.split('|')[0], momento: hueco.split('|')[1] } : null);
      }
      limpiar();
    });
    escuchar('pointercancel', limpiar);
    escuchar('contextmenu', (ev) => ev.preventDefault());
  };

  return { vivo, sobre, empezar };
}

const POR_TANDA = 30;
const leerGrupo = () => { try { return localStorage.getItem('grupo-bandeja'); } catch { return null; } };

/**
 * Grupos de la bandeja del plan: todas las recetas, no solo unas pocas.
 * Las vuestras, ideas del día, con lo que hay en casa y cada tipo del recetario de la app.
 */
function useBandeja(datos, sesion, hoy) {
  const { recetas: recetario } = useRecetario(sesion?.cliente ?? null);
  const [grupo, setGrupoEstado] = useState(leerGrupo);
  const [buscar, setBuscar] = useState('');
  const setGrupo = (g) => { setGrupoEstado(g); try { localStorage.setItem('grupo-bandeja', g); } catch { /* nada */ } };
  const tiene = useMemo(() => enCasa(datos), [datos.despensa, datos.articulos]);
  const grupos = useMemo(() => {
    const usos = new Map();
    for (const p of datos.plan) usos.set(p.receta_id, (usos.get(p.receta_id) ?? 0) + 1);
    const conFotoPrimero = (l) => [...l].sort((a, b) => (!!(b.foto || b.foto_path) - !!(a.foto || a.foto_path)) || a.nombre.localeCompare(b.nombre, 'es'));
    const vuestras = datos.recetas.filter(esDeLaCasa)
      .sort((a, b) => (b.favorita - a.favorita) || ((usos.get(b.id) ?? 0) - (usos.get(a.id) ?? 0)) || a.nombre.localeCompare(b.nombre, 'es'));
    const base = (recetario ?? []).filter((r) => !r.oculta);
    // Del recetario, las que la casa ya usa salen como la copia de la casa (así no se copian dos veces).
    const deApp = (l) => l.map((r) => recetaGuardada(datos, r.id) ?? r);
    const l = [];
    if (vuestras.length) l.push({ id: 'vuestras', nombre: '🏠 Las vuestras', recetas: vuestras });
    const usadas = datos.recetas.filter((r) => !esDeLaCasa(r) && usos.get(r.id));
    if (usadas.length) l.push({ id: 'usadas', nombre: '🔁 Ya hechas', recetas: usadas.sort((a, b) => (usos.get(b.id) ?? 0) - (usos.get(a.id) ?? 0)) });
    if (base.length) {
      const delDia = recetaDelDia(base, hoy);
      const ideas = [delDia, ...filasDeIdeas(base, hoy, tiene, { excluir: [delDia?.id] }).flatMap((f) => f.recetas)].filter(Boolean);
      l.push({ id: 'ideas', nombre: '✨ Ideas de hoy', recetas: deApp(ideas) });
      const casa = conLoDeCasa(base, tiene);
      if (casa.length) l.push({ id: 'casa', nombre: '🧺 Con lo de casa', recetas: deApp(casa) });
      for (const { tipo } of tiposDe(base)) l.push({ id: `tipo:${tipo}`, nombre: tipo, recetas: deApp(conFotoPrimero(base.filter((r) => r.tipo === tipo))) });
    }
    return l;
  }, [datos.recetas, datos.plan, recetario, tiene, hoy]);
  const actual = grupos.find((g) => g.id === grupo) ?? grupos[0];
  const enBandeja = useMemo(() => {
    if (normalizar(buscar).trim().length < 2) return actual?.recetas ?? [];
    const q = normalizar(buscar).trim();
    const mias = datos.recetas.filter((r) => esDeLaCasa(r) && normalizar(r.nombre).includes(q));
    return [...mias, ...buscarEnRecetario(recetario ?? [], buscar).map((r) => recetaGuardada(datos, r.id) ?? r)];
  }, [buscar, actual, recetario, datos.recetas]);
  return { recetario, grupos, grupo: actual?.id, setGrupo, buscar, setBuscar, enBandeja };
}

export function PantallaPlan({ almacen, datos, sesion, abrirReceta }) {
  const hoy = fechaISO();
  const [semana, setSemana] = useState(0);
  const [elegir, setElegir] = useState(null); // { fecha, momento }
  const [proponer, setProponer] = useState(false);
  const { cocinar, hoja } = useCocinar(almacen, datos);
  const [extras, setExtras] = useState(new Set()); // días con postre/tentempié a la vista
  const inicio = sumarDias(hoy, semana * 7);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i));
  const delaSemana = datos.plan.filter((p) => p.fecha >= dias[0] && p.fecha <= dias[6]);

  // Bandeja de recetas para arrastrar: por grupos (las vuestras, ideas, con lo de casa y cada tipo del recetario).
  const { recetario, grupos, grupo, setGrupo, buscar, setBuscar, enBandeja } = useBandeja(datos, sesion, hoy);
  const [cuantas, setCuantas] = useState(POR_TANDA);
  useEffect(() => setCuantas(POR_TANDA), [grupo, buscar]);
  const bandejaRef = useRef(null);
  useEffect(() => { if (bandejaRef.current) bandejaRef.current.scrollLeft = 0; }, [grupo, buscar]);
  const aMano = enBandeja.slice(0, cuantas);
  const masAlDeslizar = (e) => {
    const el = e.currentTarget;
    if (cuantas < enBandeja.length && el.scrollLeft + el.clientWidth > el.scrollWidth - 400) setCuantas((n) => n + POR_TANDA);
  };
  const fotos = useFotos(almacen, [...aMano, ...delaSemana.map((p) => datos.recetas.find((r) => r.id === p.receta_id))]
    .filter(Boolean).map((r) => r.foto_path));
  const urlDe = (r) => (r?.foto ?? (r?.foto_path ? fotos[r.foto_path] : null));

  const { vivo, sobre, empezar } = useArrastre(async (carga, hueco) => {
    if (!hueco) return;
    const texto = `${nombreDia(hueco.fecha, hoy)}, ${nombreMomento(hueco.momento).toLowerCase()}`;
    if (carga.receta) {
      const raciones = leerRaciones() ?? 2;
      // Una receta del recetario se copia a la casa al ponerla en el plan.
      const receta = carga.app ? await guardarDelRecetario(almacen, carga.receta) : carga.receta;
      await almacen.insertar('plan', { fecha: hueco.fecha, momento: hueco.momento, receta_id: receta.id, raciones, cocinado: false });
      mostrarAviso(`${carga.receta.nombre}: ${texto} (${raciones} rac.)`);
    } else if (carga.comida && (carga.comida.fecha !== hueco.fecha || carga.comida.momento !== hueco.momento)) {
      await almacen.actualizar('plan', carga.comida.id, { fecha: hueco.fecha, momento: hueco.momento });
      mostrarAviso(`Movido a ${texto.charAt(0).toLowerCase()}${texto.slice(1)}`);
    }
  });

  const irADia = (fecha) => document.getElementById(`dia-${fecha}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const tarjetaComida = (c) => {
    const r = datos.recetas.find((x) => x.id === c.receta_id);
    return html`
      <div class="comida-plan ${c.cocinado ? 'hecha' : ''} ${vivo?.carga.comida?.id === c.id ? 'levantada' : ''}"
        onPointerDown=${(e) => r && empezar(e, { comida: c }, r.nombre, urlDe(r))}>
        <button class="foto-boton" aria-label=${`Ver ${r?.nombre ?? 'receta'}`} onClick=${() => r && abrirReceta(r.id, c.raciones)}>
          ${r ? html`<${Miniatura} receta=${r} url=${urlDe(r)} />` : html`<span class="miniatura sin-foto">?</span>`}
        </button>
        <button class="comida-texto" onClick=${() => r && abrirReceta(r.id, c.raciones)}>
          <strong>${r?.nombre ?? 'Receta borrada'}</strong>
          <small class="meta">${c.raciones} rac.</small>
        </button>
        <button class="chip ${c.cocinado ? 'activo' : ''}" title="Marcar como cocinado"
          onClick=${() => cocinar(c, !c.cocinado)}>${c.cocinado ? '✓' : 'Hecho'}</button>
        <button class="icono peq" aria-label="Quitar del plan" onClick=${() => almacen.borrar('plan', c.id)}>✕</button>
      </div>`;
  };

  return html`
    <section class="plan">
      <div class="barra-semana">
        <button class="icono" aria-label="Semana anterior" onClick=${() => setSemana(semana - 1)}>‹</button>
        <strong>${semana === 0 ? 'Próximos 7 días' : `${nombreDia(dias[0], hoy)} – ${nombreDia(dias[6], hoy)}`}</strong>
        <button class="icono" aria-label="Semana siguiente" onClick=${() => setSemana(semana + 1)}>›</button>
      </div>
      <div class="tira-dias" role="list">
        ${dias.map((f) => {
          const n = delaSemana.filter((p) => p.fecha === f).length;
          return html`<button role="listitem" class="dia-chip ${f === hoy ? 'hoy' : ''}" onClick=${() => irADia(f)}>
            <small>${LETRA_DIA[diaSemana(f)]}</small><b>${numeroDia(f)}</b>
            <span class="puntos">${Array.from({ length: Math.min(n, 3) }, () => html`<i></i>`)}</span>
          </button>`;
        })}
      </div>

      ${datos.recetas.length === 0 && html`<p class="vacio">Primero carga o crea alguna receta en la pestaña Recetas.</p>`}
      ${datos.recetas.length > 0 && html`
        <div class="bandeja">
          <div class="bandeja-cabeza">
            <strong>Recetas</strong>
            <input type="search" class="buscar-bandeja" placeholder=${recetario?.length ? `Buscar entre ${datos.recetas.filter(esDeLaCasa).length + recetario.length}…` : 'Buscar…'}
              value=${buscar} onInput=${(e) => setBuscar(e.currentTarget.value)} />
          </div>
          ${!buscar && html`<div class="chips grupos-bandeja">
            ${grupos.map((g) => html`<button class="chip ${grupo === g.id ? 'activo' : ''}"
              onClick=${(e) => { setGrupo(g.id); e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }}>
              ${g.nombre} <small>${g.recetas.length}</small></button>`)}
          </div>`}
          <p class="meta">${enBandeja.length === 0 ? 'No hay recetas con ese nombre.'
            : `${enBandeja.length} ${enBandeja.length === 1 ? 'receta' : 'recetas'} · desliza para ver más y mantén pulsada una para llevarla a un día`}</p>
          <div class="bandeja-recetas" ref=${bandejaRef} onScroll=${masAlDeslizar}>
            ${aMano.map((r) => {
              const app = Array.isArray(r.ingredientes); // del recetario de la app, aún sin copiar a la casa
              return html`
              <div class="receta-arrastrable ${vivo?.carga.receta?.id === r.id ? 'levantada' : ''}" key=${r.id}
                onPointerDown=${(e) => empezar(e, { receta: r, app }, r.nombre, urlDe(r))}>
                <${FotoIdea} receta=${r} url=${urlDe(r)} />
                <span>${r.favorita ? '★ ' : ''}${r.nombre}</span>
                ${r.tiempo_min && html`<small>${r.tiempo_min} min</small>`}
              </div>`;
            })}
          </div>
        </div>
        <button class="boton proponer" onClick=${() => setProponer(true)}>✨ Proponer el menú de estos 7 días</button>`}

      ${dias.map((fecha) => {
        const momentos = [...FIJOS, ...EXTRA.filter((m) => extras.has(fecha) || delaSemana.some((p) => p.fecha === fecha && p.momento === m))];
        return html`
          <div class="dia ${fecha === hoy ? 'hoy' : ''}" id=${`dia-${fecha}`}>
            <h3>${nombreDia(fecha, hoy)}</h3>
            ${momentos.map((momento) => {
              const comidas = delaSemana.filter((p) => p.fecha === fecha && p.momento === momento);
              const clave = `${fecha}|${momento}`;
              return html`
                <div class="hueco ${sobre === clave ? 'sobre' : ''} ${comidas.length ? '' : 'libre'}" data-hueco=${clave}>
                  <span class="etiqueta-momento">${nombreMomento(momento)}</span>
                  ${comidas.map(tarjetaComida)}
                  <button class="anadir" onClick=${() => setElegir({ fecha, momento })}>
                    ${comidas.length ? '+ Otra' : vivo ? 'Suelta aquí' : '+ Elegir receta'}</button>
                </div>`;
            })}
            ${!EXTRA.every((m) => momentos.includes(m)) && html`
              <button class="enlace mas-momentos" onClick=${() => setExtras(new Set([...extras, fecha]))}>+ Postre o tentempié</button>`}
          </div>`;
      })}

      ${vivo && html`<div class="fantasma" style=${`left:${vivo.x}px;top:${vivo.y}px`}>
        ${vivo.foto ? html`<img src=${vivo.foto} alt="" />` : null}<span>${vivo.etiqueta}</span></div>`}

      ${hoja}
      ${elegir && html`<${ElegirReceta} almacen=${almacen} datos=${datos} titulo=${`${nombreDia(elegir.fecha, hoy)}, ${nombreMomento(elegir.momento).toLowerCase()}`} momento=${elegir.momento}
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
