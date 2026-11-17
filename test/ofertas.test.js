import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compradoAMenudo, ofertasDe, barrasPorSuper, comparaConAnterior } from '../web/src/ofertas.js';
import { gastosPorPeriodo, inicioPeriodo } from '../web/src/tiques.js';

const HOY = '2026-11-17';

test('compradoAMenudo cuenta días distintos de compra (tiques y lista)', () => {
  const datos = {
    tiques: [{ id: 't1', fecha: '2026-11-01T10:00' }, { id: 't2', fecha: '2026-11-10T10:00' }, { id: 't3', fecha: '2026-01-01T10:00' }],
    tique_lineas: [
      { tique_id: 't1', articulo_id: 'leche' }, { tique_id: 't1', articulo_id: 'leche' },
      { tique_id: 't2', articulo_id: 'leche' }, { tique_id: 't1', articulo_id: 'pan' },
      { tique_id: 't3', articulo_id: 'pan' }, // demasiado antiguo
      { tique_id: 't2', articulo_id: null },
    ],
    lista: [{ articulo_id: 'pan', comprado: true, comprado_en: '2026-11-15T09:00' },
      { articulo_id: 'huevos', comprado: false, comprado_en: null }],
  };
  const f = compradoAMenudo(datos, HOY);
  assert.equal(f.get('leche'), 2);
  assert.equal(f.get('pan'), 2);
  assert.equal(f.has('huevos'), false);
});

test('ofertasDe: rebajado por el súper, bajada frente a lo habitual, y lo que no cuenta', () => {
  const frecuentes = new Map([['leche', 5], ['pan', 3], ['atun', 2], ['queso', 2]]);
  const productos = new Map([
    ['m1', { id: 'm1', supermercado_id: 'mercadona', precio: 0.9, precio_anterior: 1.0, visto_en: '2026-11-16T04:00' }],
    ['h1', { id: 'h1', supermercado_id: 'hiperdino', precio: 0.8, precio_anterior: 1.2, visto_en: '2026-11-16T04:00' }],
    ['h2', { id: 'h2', supermercado_id: 'hiperdino', precio: 1.5, precio_anterior: null, visto_en: '2026-11-15T04:00' }],
    ['h3', { id: 'h3', supermercado_id: 'hiperdino', precio: 2.0, precio_anterior: 3.0, visto_en: '2026-10-01T04:00' }],
    ['h4', { id: 'h4', supermercado_id: 'hiperdino', precio: 3.0, precio_anterior: 4.0, marca: 'Mala', visto_en: '2026-11-16T04:00' }],
  ]);
  const historial = new Map([['h2', [
    { precio: 2.0, visto_en: '2026-10-20T04:00' }, { precio: 1.9, visto_en: '2026-11-01T04:00' },
    { precio: 1.5, visto_en: '2026-11-15T04:00' }]]]);
  const eq = [
    { articulo_id: 'leche', producto_id: 'm1' }, { articulo_id: 'leche', producto_id: 'h1' },
    { articulo_id: 'pan', producto_id: 'h2' },
    { articulo_id: 'atun', producto_id: 'h3' },     // precio visto hace mucho: puede haber terminado
    { articulo_id: 'queso', producto_id: 'h4' },    // marca que no le gusta
    { articulo_id: 'otra', producto_id: 'm1' },     // no se compra a menudo
  ];
  const o = ofertasDe(frecuentes, eq, productos, historial, { hoy: HOY, vale: (p) => p.marca !== 'Mala' });
  assert.deepEqual(o.map((x) => x.articulo_id), ['leche', 'pan']);
  assert.equal(o[0].producto.id, 'h1');            // la mejor de las dos de leche
  assert.equal(o[0].pct, 33);
  assert.equal(o[0].motivo, 'rebajado');
  assert.equal(o[1].motivo, 'bajada');
  assert.equal(o[1].antes, 1.95);
});

test('ofertasDe: una bajada pequeña no es oferta', () => {
  const productos = new Map([['h', { id: 'h', precio: 1.9, visto_en: '2026-11-16' }]]);
  const historial = new Map([['h', [{ precio: 2.0, visto_en: '2026-11-01' }]]]);
  const o = ofertasDe(new Map([['a', 3]]), [{ articulo_id: 'a', producto_id: 'h' }], productos, historial, { hoy: HOY });
  assert.equal(o.length, 0);
});

test('barrasPorSuper: trozos por súper en orden fijo y anchos relativos al mayor', () => {
  const tiques = [
    { fecha: '2026-11-02', total: 50, supermercado_id: 'lidl' },
    { fecha: '2026-11-03', total: 50, supermercado_id: 'mercadona' },
    { fecha: '2026-10-03', total: 25, supermercado_id: 'hiperdino' },
  ];
  const b = barrasPorSuper(gastosPorPeriodo(tiques, 'mes'));
  assert.equal(b.length, 2);
  assert.deepEqual(b[0].trozos.map((t) => [t.s, t.ancho]), [['mercadona', 50], ['lidl', 50]]);
  assert.deepEqual(b[1].trozos.map((t) => [t.s, t.ancho]), [['hiperdino', 25]]);
});

test('comparaConAnterior: mismo tramo del mes pasado', () => {
  const tiques = [
    { fecha: '2026-10-05', total: 40 }, { fecha: '2026-10-25', total: 100 }, // el 25 no cuenta (hoy es 17)
    { fecha: '2026-11-03', total: 60 },
  ];
  const c = comparaConAnterior(tiques, 'mes', HOY, inicioPeriodo);
  assert.deepEqual(c, { antes: 40, ahora: 60, diferencia: 20 });
  assert.equal(comparaConAnterior([{ fecha: '2026-11-03', total: 60 }], 'mes', HOY, inicioPeriodo), null);
  // Semana: lunes 16 a martes 17 frente a lunes 9 a martes 10
  const s = comparaConAnterior([{ fecha: '2026-11-10', total: 30 }, { fecha: '2026-11-12', total: 99 }, { fecha: '2026-11-16', total: 20 }], 'semana', HOY, inicioPeriodo);
  assert.deepEqual(s, { antes: 30, ahora: 20, diferencia: -10 });
});
