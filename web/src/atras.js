// Botón "atrás" del móvil.
// Sin esto, en la app instalada el botón (o el gesto) atrás de Android cierra la app entera.
// Con esto, cada ventana abierta deja una marca en el historial del navegador: al pulsar atrás
// se cierra la ventana de arriba; si no hay ninguna, se vuelve a Inicio; y en Inicio avisa
// "Vuelve a pulsar atrás para salir" antes de dejar salir.
import { useEffect, useRef } from '../vendor/preact-htm.js';

/**
 * Lleva la cuenta de las ventanas abiertas. Cada una tiene una "profundidad" que coincide con
 * history.state.atras de su marca en el historial.
 *  - Marca original de la página: sin estado (profundidad -1).
 *  - Guarda de Inicio: profundidad 0 (es la que hace que el primer atrás en Inicio no salga).
 *  - Ventanas: 1, 2, 3… según se abren una encima de otra.
 * Si una ventana se cierra con su botón ✕ (y no con atrás) su marca se queda en el historial
 * como "vieja"; el siguiente atrás se la salta sin que se note.
 */
export function crearAtras({ historial, esperar = (f) => setTimeout(f, 300), alSalir = () => {} }) {
  let niveles = [];   // { prof, cerrar, vivo, montado }
  const prof = () => historial.state?.atras ?? -1;
  const marcar = (p) => historial.pushState({ ...(historial.state || {}), atras: p }, '');

  /** Pone la guarda de Inicio si no está (al abrir la app o tras el aviso de salir). */
  function armar() { if (prof() < 0) marcar(0); }

  function poner(n) { armar(); n.prof = prof() + 1; n.vivo = true; marcar(n.prof); niveles.push(n); }

  /** Una ventana se abre. Devuelve su nivel para soltarlo al cerrarse. */
  function abrir(cerrar) {
    const n = { prof: 0, cerrar, vivo: true, montado: true };
    poner(n);
    return n;
  }

  /** La ventana se ha cerrado por su cuenta (✕, Guardar…): su marca queda vieja. */
  function soltar(n) { n.montado = false; n.vivo = false; }

  /** El usuario ha pulsado atrás. */
  function alVolver(estado) {
    const d = estado?.atras ?? -1;
    const quitar = niveles.filter((n) => n.prof > d).reverse();
    niveles = niveles.filter((n) => n.prof <= d);
    const vivos = quitar.filter((n) => n.vivo);
    if (vivos.length) {
      // cerrar() devuelve false si la ventana no quiere cerrarse todavía (por ejemplo, pide confirmar):
      // entonces vuelve a dejar su marca. Por si acaso, se comprueba también un poco después.
      vivos.forEach((n) => { n.vivo = false; if (n.cerrar() === false) poner(n); });
      esperar(() => vivos.forEach((n) => { if (n.montado && !n.vivo) poner(n); }));
      return;
    }
    if (d >= 0) { historial.back(); return; }   // solo había marcas viejas o la guarda: un paso más
    alSalir();                                    // ya en la marca original: el próximo atrás sale
  }

  return { abrir, soltar, alVolver, armar, niveles: () => niveles };
}

let atras = null;
let avisar = () => {};

/** Se llama una vez al arrancar la app. `aviso` muestra un mensaje corto en pantalla. */
export function iniciarAtras(aviso) {
  if (atras || typeof window === 'undefined') return;
  avisar = aviso;
  atras = crearAtras({ historial: window.history, alSalir: () => avisar('Vuelve a pulsar atrás para salir') });
  atras.armar();
  window.addEventListener('popstate', (e) => atras.alVolver(e.state));
  // Tras el aviso de salir, en cuanto se toca la pantalla vuelve a poner la guarda.
  window.addEventListener('pointerdown', () => atras.armar(), true);
}

/**
 * Para ventanas y pantallas: mientras `activo` sea verdadero, el botón atrás llama a `cerrar`
 * en vez de salir de la app.
 */
export function useAtras(cerrar, activo = true) {
  const ref = useRef(cerrar);
  ref.current = cerrar;
  useEffect(() => {
    if (!activo || !atras) return undefined;
    const n = atras.abrir(() => ref.current());
    return () => atras.soltar(n);
  }, [activo]);
}
