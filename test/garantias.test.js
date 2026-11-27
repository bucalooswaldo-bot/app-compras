import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sumarAnios, diasHasta, agruparGarantias, otrosGastosDelPeriodo, tiendasUsadas, tipoDeTienda, tiendaDelTexto, esOtroGasto,
} from '../web/src/garantias.js';
import { avisosDeCasa, textoAviso } from '../web/src/avisos.js';

test('garantías: fechas', () => {
  assert.equal(sumarAnios('2026-11-14', 3), '2029-11-14');
  assert.equal(sumarAnios('2024-02-29', 1), '2025-02-28');
  assert.equal(diasHasta('2026-12-27', '2026-11-27'), 30);
  assert.equal(diasHasta('2026-11-20', '2026-11-27'), -7);
});

test('garantías: pronto, vigentes y caducadas', () => {
  const g = [
    { id: 'a', que: 'Lavadora', hasta: '2028-03-01' },
    { id: 'b', que: 'Freidora', hasta: '2027-01-12' },
    { id: 'c', que: 'Tele', hasta: '2024-05-01' },
  ];
  const r = agruparGarantias(g, '2026-11-27');
  assert.deepEqual(r.pronto.map((x) => x.id), ['b']);
  assert.deepEqual(r.vigentes.map((x) => x.id), ['a']);
  assert.deepEqual(r.caducadas.map((x) => x.id), ['c']);
});

test('otros gastos: solo los de otras tiendas y del periodo', () => {
  const tiques = [
    { fecha: '2026-11-26T12:00:00', total: 63.15, supermercado_id: 'mercadona' },
    { fecha: '2026-11-24T12:00:00', total: 41, tipo: 'ropa', tienda: 'Primark' },
    { fecha: '2026-11-22T12:00:00', total: 18.6, tipo: 'farmacia', tienda: 'Farmacia' },
    { fecha: '2026-11-02T12:00:00', total: 9.4, tipo: 'farmacia', tienda: 'farmacia ' },
    { fecha: '2026-10-30T12:00:00', total: 100, tipo: 'casa', tienda: 'Worten' },
  ];
  const r = otrosGastosDelPeriodo(tiques, 'mes', '2026-11-01');
  assert.equal(r.total, 69);
  assert.equal(r.tiques, 3);
  assert.deepEqual(r.porTipo, [['ropa', 41], ['farmacia', 28]]);
  assert.equal(esOtroGasto(tiques[0]), false);
  assert.deepEqual(tiendasUsadas(tiques), ['Primark', 'Farmacia', 'Worten']);
  assert.equal(tipoDeTienda(tiques, 'PRIMARK'), 'ropa');
  assert.equal(tipoDeTienda(tiques, 'Zara'), null);
  assert.deepEqual(tiendaDelTexto('MEDIA MARKT CANARIAS S.A.\nTOTAL 69,88'), { tienda: 'MediaMarkt', tipo: 'casa' });
});

test('aviso en el móvil: un mes y una semana antes de que acabe una garantía', () => {
  const base = { articulos: [], despensa: [], recetas: [], ingredientes: [], plan: [], lista: [] };
  const garantias = [{ id: 'g', que: 'Freidora de aire', hasta: '2026-12-27' }];
  const hoyMes = textoAviso(avisosDeCasa({ ...base, garantias }, '2026-11-27'), '2026-11-27');
  assert.equal(hoyMes.titulo, 'Una garantía se acaba');
  assert.match(hoyMes.cuerpo, /freidora de aire acaba en un mes/);
  assert.match(textoAviso(avisosDeCasa({ ...base, garantias }, '2026-12-20'), '2026-12-20').cuerpo, /en una semana/);
  assert.equal(textoAviso(avisosDeCasa({ ...base, garantias }, '2026-11-28'), '2026-11-28'), null);
  assert.equal(textoAviso(avisosDeCasa(base, '2026-11-27'), '2026-11-27'), null);
});
