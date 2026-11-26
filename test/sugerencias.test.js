import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recetaDelDia, filasDeIdeas, enCasa, cobertura, barajar, semillaDe, temporada } from '../web/src/sugerencias.js';

const recetario = JSON.parse(readFileSync(new URL('../web/recetario.json', import.meta.url))).recetas;

test('la receta del día es la misma todo el día y cambia de un día a otro', () => {
  const a = recetaDelDia(recetario, '2026-11-26');
  assert.equal(recetaDelDia(recetario, '2026-11-26').id, a.id);
  const semana = ['2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30'].map((f) => recetaDelDia(recetario, f).id);
  assert.ok(semana.some((id) => id !== a.id));
});

test('«otra» da otra receta y nunca postres ni salsas', () => {
  const vistas = new Set();
  for (let v = 0; v < 30; v++) {
    const r = recetaDelDia(recetario, '2026-11-26', v);
    assert.ok(!['Postres y dulces', 'Salsas y bases', 'Desayunos y meriendas'].includes(r.tipo));
    vistas.add(r.id);
  }
  assert.equal(vistas.size, 30);
});

test('en invierno no propone platos de verano', () => {
  for (let v = 0; v < 50; v++) assert.ok(!recetaDelDia(recetario, '2026-12-10', v).etiquetas.includes('Verano'));
});

test('si hay bastantes recetas con foto, la del día sale de esas', () => {
  const conFotos = recetario.map((r, i) => (i % 20 === 0 ? { ...r, foto: `f${i}.jpg` } : r));
  for (let v = 0; v < 10; v++) assert.ok(recetaDelDia(conFotos, '2026-11-26', v).foto);
});

test('barajar es igual con la misma semilla y no pierde nada', () => {
  const l = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.deepEqual(barajar(l, semillaDe('x')), barajar(l, semillaDe('x')));
  assert.deepEqual([...barajar(l, 3)].sort(), l);
});

test('cobertura cuenta lo que hay en casa sin contar sal ni aceite', () => {
  const datos = {
    articulos: [{ id: 'a1', nombre: 'Lentejas' }, { id: 'a2', nombre: 'Cebolla' }, { id: 'a3', nombre: 'Zanahoria' }],
    despensa: [{ articulo_id: 'a1', cantidad: 1 }, { articulo_id: 'a2', cantidad: 2 }, { articulo_id: 'a3', cantidad: 0 }],
  };
  const r = { ingredientes: [['Lentejas', 300, 'g'], ['Cebolla', 1, 'ud'], ['Zanahoria', 1, 'ud'], ['Sal', null, 'g'], ['Aceite de oliva', 30, 'ml']] };
  assert.deepEqual(cobertura(r, enCasa(datos)), { tengo: 2, total: 3 });
});

test('las filas de ideas no repiten recetas ni la del día', () => {
  const delDia = recetaDelDia(recetario, '2026-11-26');
  const datos = { articulos: [{ id: 'c', nombre: 'Cebolla' }, { id: 'a', nombre: 'Ajo' }], despensa: [{ articulo_id: 'c', cantidad: 3 }, { articulo_id: 'a', cantidad: 5 }] };
  const filas = filasDeIdeas(recetario, '2026-11-26', enCasa(datos), { excluir: [delDia.id] });
  const ids = filas.flatMap((f) => f.recetas.map((r) => r.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes(delDia.id));
  assert.ok(filas.find((f) => f.id === 'temporada'));
  assert.match(temporada('2026-11-26').titulo, /cuchara/);
});
