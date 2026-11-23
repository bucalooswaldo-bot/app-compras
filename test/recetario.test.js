import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  prepararGuardado, articuloDeIngrediente, buscarEnRecetario, tiposDe, esDeLaCasa, recetaGuardada, pasosDeTexto,
} from '../web/src/recetario.js';

const { recetas } = JSON.parse(readFileSync(new URL('../web/recetario.json', import.meta.url), 'utf8'));

test('el recetario de la app se carga y cada receta tiene lo necesario', () => {
  assert.ok(recetas.length >= 40);
  const ids = new Set();
  for (const r of recetas) {
    assert.ok(r.id && !ids.has(r.id), r.nombre); ids.add(r.id);
    assert.ok(r.nombre && r.tipo && r.raciones > 0 && r.pasos.length > 0, r.nombre);
    for (const [n, c, u] of r.ingredientes) assert.ok(n && ['g', 'ml', 'ud'].includes(u) && (c === null || c > 0), `${r.nombre}: ${n}`);
  }
});

test('las patatas del recetario son las papas de la casa', () => {
  const art = [{ id: 'p', nombre: 'Papas', unidad: 'g' }, { id: 'm', nombre: 'Millo', unidad: 'ud' }];
  assert.equal(articuloDeIngrediente(art, 'Patatas')?.id, 'p');
  assert.equal(articuloDeIngrediente(art, 'Maíz')?.id, 'm');
  assert.equal(articuloDeIngrediente(art, 'Arroz'), null);
});

test('guardar una receta del recetario usa los artículos de la casa y crea los que faltan', () => {
  const art = [{ id: 'p', nombre: 'Papas', unidad: 'g' }, { id: 'a', nombre: 'Ajo', unidad: 'g' }];
  const receta = {
    id: 'prueba', nombre: 'Prueba', raciones: 4, tiempo_min: 30, etiquetas: ['Cuchara'],
    ingredientes: [['Patatas', 500, 'g'], ['Ajo', 2, 'ud'], ['Lentejas', 300, 'g'], ['Sal', null, 'g']],
    pasos: ['Uno.', 'Dos.'], truco: 'Con cariño.',
  };
  const g = prepararGuardado(art, receta, 'r1');
  assert.deepEqual(g.articulos.map((a) => [a.nombre, a.unidad, a.categoria]), [['Lentejas', 'g', 'Despensa'], ['Sal', 'g', 'Despensa']]);
  assert.equal(g.receta.origen, 'app');
  assert.equal(g.receta.catalogo_id, 'prueba');
  assert.equal(g.receta.pasos, 'Uno.\nDos.\nTruco: Con cariño.');
  assert.deepEqual(g.ingredientes.map((i) => [i.articulo_id, i.cantidad, i.nota]),
    [['p', 500, null], ['a', null, '2 unidades'], [g.articulos[0].id, 300, null], [g.articulos[1].id, null, null]]);
  assert.ok(g.ingredientes.every((i) => i.receta_id === 'r1'));
});

test('las recetas del recetario no salen en «Mis recetas»', () => {
  const datos = { recetas: [{ id: 1, origen: 'manual' }, { id: 2, origen: 'ia' }, { id: 3, origen: 'app', catalogo_id: 'x' }] };
  assert.deepEqual(datos.recetas.filter(esDeLaCasa).map((r) => r.id), [1, 2]);
  assert.equal(recetaGuardada(datos, 'x').id, 3);
  assert.equal(recetaGuardada(datos, 'y'), null);
});

test('buscar en el recetario: nombre primero, luego ingrediente; y por tipo', () => {
  const lentejas = buscarEnRecetario(recetas, 'lentejas');
  assert.ok(normal(lentejas[0].nombre).startsWith('lentejas'));
  assert.ok(buscarEnRecetario(recetas, 'chorizo').length >= 2);
  const tipo = tiposDe(recetas)[0].tipo;
  assert.ok(buscarEnRecetario(recetas, '', tipo).every((r) => r.tipo === tipo));
  assert.equal(buscarEnRecetario(recetas, 'zzzz').length, 0);
  assert.equal(pasosDeTexto({ pasos: ['a'] }), 'a');
});

const normal = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
