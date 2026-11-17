// Plan semanal visual: cada día con sus comidas y fotos; las recetas se arrastran a un día
// (o una comida ya puesta a otro día) manteniéndolas pulsadas.
import { html, useState, useRef, useEffect } from '../vendor/preact-htm.js';
import { fechaISO, sumarDias, nombreDia, nombreMomento } from './logica.js';
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

  // Recetas a mano: favoritas y las más puestas en el plan.
  const usos = new Map();
  for (const p of datos.plan) usos.set(p.receta_id, (usos.get(p.receta_id) ?? 0) + 1);
  const aMano = [...datos.recetas]
    .sort((a, b) => (b.favorita - a.favorita) || ((usos.get(b.id) ?? 0) - (usos.get(a.id) ?? 0)) || a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, 12);
  const fotos = useFotos(almacen, [...aMano, ...delaSemana.map((p) => datos.recetas.find((r) => r.id === p.receta_id))]
    .filter(Boolean).map((r) => r.foto_path));
  const urlDe = (r) => (r?.foto_path ? fotos[r.foto_path] : null);

  const { vivo, sobre, empezar } = useArrastre(async (carga, hueco) => {
    if (!hueco) return;
    const texto = `${nombreDia(hueco.fecha, hoy)}, ${nombreMomento(hueco.momento).toLowerCase()}`;
    if (carga.receta) {
      const raciones = leerRaciones() ?? 2;
      await almacen.insertar('plan', { fecha: hueco.fecha, momento: hueco.momento, receta_id: carga.receta.id, raciones, cocinado: false });
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
          <p class="meta">Mantén pulsada una receta y arrástrala a un día</p>
          <div class="bandeja-recetas">
            ${aMano.map((r) => html`
              <div class="receta-arrastrable ${vivo?.carga.receta?.id === r.id ? 'levantada' : ''}"
                onPointerDown=${(e) => empezar(e, { receta: r }, r.nombre, urlDe(r))}>
                <${Miniatura} receta=${r} url=${urlDe(r)} />
                <span>${r.favorita ? '★ ' : ''}${r.nombre}</span>
              </div>`)}
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
