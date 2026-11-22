import test from 'node:test';
import assert from 'node:assert/strict';
import { crearAtras } from '../web/src/atras.js';

// Historial de mentira que se comporta como el del navegador (atrás avisa con popstate).
function historialFalso() {
  const pila = [null]; let i = 0; let alVolver = () => {};
  return {
    get state() { return pila[i]; },
    pushState(e) { pila.length = i + 1; pila.push(e); i++; },
    back() { if (i > 0) { i--; alVolver(pila[i]); } else this.salio = true; },
    pulsarAtras() { this.back(); },
    escuchar(f) { alVolver = f; },
    get largo() { return i; },
  };
}

function montar() {
  const h = historialFalso();
  let avisos = 0;
  const a = crearAtras({ historial: h, esperar: (f) => f(), alSalir: () => avisos++ });
  h.escuchar(a.alVolver);
  a.armar();
  return { h, a, avisos: () => avisos };
}

test('atrás cierra la ventana de arriba, luego la de abajo', () => {
  const { h, a } = montar();
  const cerradas = [];
  const v1 = a.abrir(() => { cerradas.push('receta'); a.soltar(v1); });
  const v2 = a.abrir(() => { cerradas.push('editar'); a.soltar(v2); });
  h.pulsarAtras();
  assert.deepEqual(cerradas, ['editar']);
  h.pulsarAtras();
  assert.deepEqual(cerradas, ['editar', 'receta']);
  assert.ok(!h.salio);
});

test('en Inicio, el primer atrás avisa y no sale; el segundo sale', () => {
  const { h, avisos } = montar();
  h.pulsarAtras();
  assert.equal(avisos(), 1);
  assert.ok(!h.salio);
  h.pulsarAtras();
  assert.ok(h.salio);
});

test('una ventana cerrada con ✕ no se queda "pillada": el siguiente atrás va a la de abajo', () => {
  const { h, a } = montar();
  const cerradas = [];
  const v1 = a.abrir(() => { cerradas.push('receta'); a.soltar(v1); });
  const v2 = a.abrir(() => cerradas.push('nunca'));
  a.soltar(v2);   // se cierra con su botón
  h.pulsarAtras();
  assert.deepEqual(cerradas, ['receta']);
});

test('si la ventana no quiere cerrarse (pide confirmar), sigue ahí y el próximo atrás vuelve a preguntarle', () => {
  const { h, a } = montar();
  let intentos = 0;
  const v = a.abrir(() => { intentos++; if (intentos === 1) return false; a.soltar(v); return true; });
  h.pulsarAtras();
  assert.equal(intentos, 1);
  h.pulsarAtras();
  assert.equal(intentos, 2);
  assert.ok(!h.salio);
});
