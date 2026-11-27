import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listaDeRecetas, pasoCantidad, cambiarCantidadTexto } from '../web/src/logica.js';

const datos = () => ({
  articulos: [
    { id: 'papas', nombre: 'Papas', unidad: 'g', categoria: 'Frutas y verduras' },
    { id: 'huevos', nombre: 'Huevos', unidad: 'ud', categoria: 'Lácteos y huevos' },
    { id: 'aceite', nombre: 'Aceite de oliva', unidad: 'ml', categoria: 'Despensa' },
    { id: 'lechuga', nombre: 'Lechuga', unidad: 'ud', categoria: 'Frutas y verduras' },
  ],
  despensa: [{ articulo_id: 'huevos', cantidad: 12 }],
  recetas: [
    { id: 'tortilla', nombre: 'Tortilla', raciones: 4, etiquetas: [] },
    { id: 'ensaladilla', nombre: 'Ensaladilla', raciones: 4, etiquetas: [] },
  ],
  ingredientes: [
    { receta_id: 'tortilla', articulo_id: 'papas', cantidad: 500 },
    { receta_id: 'tortilla', articulo_id: 'huevos', cantidad: 6 },
    { receta_id: 'tortilla', articulo_id: 'aceite', cantidad: null },
    { receta_id: 'ensaladilla', articulo_id: 'papas', cantidad: 600 },
    { receta_id: 'ensaladilla', articulo_id: 'huevos', cantidad: 3 },
    { receta_id: 'ensaladilla', articulo_id: 'lechuga', cantidad: null },
  ],
  plan: [], lista: [],
});

test('junta varias recetas, cada una con sus personas, y suma lo repetido', () => {
  const filas = listaDeRecetas(datos(), [{ recetaId: 'tortilla', raciones: 8 }, { recetaId: 'ensaladilla', raciones: 4 }]);
  const papas = filas.find((f) => f.articulo_id === 'papas');
  assert.equal(papas.necesita, 1600);
  assert.deepEqual(papas.recetas, ['Tortilla', 'Ensaladilla']);
  assert.equal(papas.loTengo, false);
  assert.equal(filas.find((f) => f.articulo_id === 'huevos').necesita, 15);
});

test('lo básico y lo que hay de sobra en casa vienen marcados como "lo tengo"', () => {
  const filas = listaDeRecetas(datos(), [{ recetaId: 'tortilla', raciones: 4 }]);
  assert.equal(filas.find((f) => f.articulo_id === 'aceite').loTengo, true);
  assert.equal(filas.find((f) => f.articulo_id === 'huevos').loTengo, true);   // 6 de 12
  const mas = listaDeRecetas(datos(), [{ recetaId: 'tortilla', raciones: 12 }]);
  assert.equal(mas.find((f) => f.articulo_id === 'huevos').loTengo, false);  // 18 y hay 12
  // Lo que no es básico ni está en casa se apunta aunque no lleve cantidad.
  const ens = listaDeRecetas(datos(), [{ recetaId: 'ensaladilla', raciones: 4 }]);
  const lechuga = ens.find((f) => f.articulo_id === 'lechuga');
  assert.equal(lechuga.loTengo, false);
  assert.equal(lechuga.necesita, null);
});

test('− y + cambian la cantidad a saltos razonables', () => {
  assert.equal(pasoCantidad(2, 'ud'), 1);
  assert.equal(pasoCantidad(100, 'g'), 50);
  assert.equal(pasoCantidad(500, 'g'), 250);
  assert.equal(pasoCantidad(1500, 'g'), 500);
  assert.equal(cambiarCantidadTexto('2 latas', 1), '3 latas');
  assert.equal(cambiarCantidadTexto('1 paquete', -1), '1 paquete');
  assert.equal(cambiarCantidadTexto('media docena', 1), null);
});
