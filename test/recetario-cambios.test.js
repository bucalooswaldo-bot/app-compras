import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conCambios, buscarEnRecetario } from '../web/src/recetario.js';

const base = [
  { id: 'a', nombre: 'Lentejas', tipo: 'Cuchara', pasos: ['x'], ingredientes: [['Lentejas', 300, 'g']] },
  { id: 'b', nombre: 'Lubina', tipo: 'Pescados', pasos: ['y'], ingredientes: [['Lubina', 2, 'ud']] },
];

test('las correcciones del recetario se ponen encima de la receta', () => {
  const [a, b] = conCambios(base, [{ id: 'a', receta: { nombre: 'Lentejas estofadas', pasos: ['1', '2'] }, foto: 'a/f.jpg', revisada: true, oculta: false }],
    (r) => `https://x/${r}`);
  assert.equal(a.nombre, 'Lentejas estofadas');
  assert.deepEqual(a.pasos, ['1', '2']);
  assert.equal(a.tipo, 'Cuchara');
  assert.equal(a.foto, 'https://x/a/f.jpg');
  assert.equal(a.revisada, true);
  assert.equal(b, base[1]);
});

test('solo marcar revisada no cambia el texto', () => {
  const [a] = conCambios(base, [{ id: 'a', receta: null, foto: null, revisada: true, oculta: false }]);
  assert.equal(a.nombre, 'Lentejas');
  assert.equal(a.foto, null);
});

test('las recetas quitadas no salen al buscar, salvo a quien revisa', () => {
  const r = conCambios(base, [{ id: 'b', receta: null, foto: null, revisada: false, oculta: true }]);
  assert.deepEqual(buscarEnRecetario(r, '').map((x) => x.id), ['a']);
  assert.deepEqual(buscarEnRecetario(r, '', null, true).map((x) => x.id), ['a', 'b']);
});
