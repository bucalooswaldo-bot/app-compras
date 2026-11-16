import { test } from 'node:test';
import assert from 'node:assert/strict';
import { superPorMarca, superProbable, nombreSencillo, elegirArticulo, cantidadASumar, seccionDe, nombreDeEtiqueta } from '../web/src/foto-producto.js';

const datos = {
  articulos: [
    { id: 'a1', nombre: 'Patatas fritas', unidad: 'ud', categoria: 'Despensa' },
    { id: 'a2', nombre: 'Leche entera', unidad: 'ud', categoria: 'Lácteos y huevos' },
    { id: 'a3', nombre: 'Arroz', unidad: 'g', categoria: 'Despensa' },
    { id: 'a4', nombre: 'Tomate triturado', unidad: 'ud', categoria: 'Conservas' },
  ],
  despensa: [{ articulo_id: 'a1', cantidad: 1 }, { articulo_id: 'a2', cantidad: 2 }],
  equivalencias: [{ articulo_id: 'a4', producto_id: 'p-orlando' }],
  tiques: [{ id: 't1', supermercado_id: 'hiperdino' }, { id: 't2', supermercado_id: 'lidl' }, { id: 't3', supermercado_id: 'hiperdino' }],
  tique_lineas: [{ tique_id: 't1', articulo_id: 'a2' }, { tique_id: 't2', articulo_id: 'a2' }, { tique_id: 't3', articulo_id: 'a2' }],
};

test('la marca propia dice el súper', () => {
  assert.equal(superPorMarca('Hacendado'), 'mercadona');
  assert.equal(superPorMarca('Milbona'), 'lidl');
  assert.equal(superPorMarca('HiperDino'), 'hiperdino');
  assert.equal(superPorMarca('Pascual'), null);
  assert.equal(superPorMarca('', 'Leche entera Hacendado'), 'mercadona');
});

test('marca de todas partes: donde lo soléis comprar', () => {
  assert.deepEqual(superProbable({ marca: 'Pascual', nombre: 'Leche', articuloId: 'a2', datos }),
    { supermercado: 'hiperdino', motivo: 'donde lo soléis comprar' });
  assert.equal(superProbable({ marca: 'Milbona', nombre: 'Leche', articuloId: 'a2', datos }).supermercado, 'lidl');
  assert.equal(superProbable({ marca: 'Pascual', nombre: 'Leche', articuloId: null, datos }).supermercado, null);
  assert.equal(superProbable({ marca: 'Pascual', exacto: 'mercadona', datos }).supermercado, 'mercadona');
});

test('nombre sencillo sin marca ni formato', () => {
  assert.equal(nombreSencillo('Patatas fritas clásicas Hacendado 300 g', 'Hacendado'), 'Patatas fritas clásicas');
  assert.equal(nombreSencillo('Asturiana leche entera 1,5 l', 'Asturiana'), 'Leche entera');
  assert.equal(nombreSencillo('', null), '');
  assert.equal(nombreSencillo('Cebolla morada al peso', null), 'Cebolla morada');
});

test('qué artículo de la casa es', () => {
  assert.equal(elegirArticulo({ nombre: 'Patatas fritas clásicas', datos }).articulo.id, 'a1');
  assert.equal(elegirArticulo({ nombre: 'Leche entera', datos }).articulo.id, 'a2');
  assert.equal(elegirArticulo({ nombre: 'Tomate frito', productoIds: ['p-orlando'], datos }).articulo.id, 'a4');
  assert.equal(elegirArticulo({ nombre: 'Gofio de millo', datos }).articulo, null);
});

test('cuánto se suma', () => {
  assert.equal(cantidadASumar('ud', { cantidad: 300, unidad: 'g' }), 1);
  assert.equal(cantidadASumar('g', { cantidad: 1000, unidad: 'g' }), 1000);
  assert.equal(cantidadASumar('g', { cantidad: 1, unidad: 'ud' }), null);
});

test('sección y nombre leído en la etiqueta', () => {
  assert.equal(seccionDe('Yogur natural', ['en:dairies', 'en:yogurts']), 'Lácteos y huevos');
  assert.equal(seccionDe('Galletas maría', []), 'Despensa');
  const texto = 'GALLETAS\nMaría dorada\nIngredientes: harina de trigo, azúcar\nConsumir preferentemente antes de\n8 410000 000000';
  assert.equal(nombreDeEtiqueta(texto), 'GALLETAS María dorada');
});
