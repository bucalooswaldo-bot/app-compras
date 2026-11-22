import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiemposDePaso, reloj, duracion, textoReceta, textoLista, aDescontar, pasosDe } from '../web/src/cocina.js';

const seg = (t) => tiemposDePaso(t).map((x) => x.segundos);

test('tiempos en los pasos', () => {
  assert.deepEqual(seg('Hornea 25 minutos a 180 grados'), [1500]);
  assert.deepEqual(seg('Cocina a 180 grados durante 20 minutos'), [1200]);
  assert.deepEqual(seg('Cuece 1 hora y media'), [5400]);
  assert.deepEqual(seg('Deja reposar media hora'), [1800]);
  assert.deepEqual(seg('Al horno 1 h 15 min'), [4500]);
  assert.deepEqual(seg('Sofríe 20-25 min'), [1500]);
  assert.deepEqual(seg('Hierve de 8 a 10 minutos y luego 30 segundos más'), [600, 30]);
  assert.deepEqual(seg('Añade dos minutos antes de servir'), [120]);
  assert.deepEqual(seg('Pon 100 g de harina y 2 sobres de levadura'), []);
  assert.deepEqual(seg('Fríe 5 min.'), [300]);
  assert.deepEqual(seg('Mezcla bien'), []);
  assert.deepEqual(seg('Cocer 3 horas'), [10800]);
});

test('reloj y duración', () => {
  assert.equal(reloj(90), '1:30');
  assert.equal(reloj(3725), '1:02:05');
  assert.equal(duracion(5400), '1 h 30 min');
  assert.equal(duracion(1500), '25 min');
  assert.equal(duracion(30), '30 s');
});

const datos = () => ({
  articulos: [
    { id: 'tom', nombre: 'Tomate', unidad: 'ud', categoria: 'Frutas y verduras' },
    { id: 'tomp', nombre: 'Tomate pera', unidad: 'ud', categoria: 'Frutas y verduras' },
    { id: 'arroz', nombre: 'Arroz', unidad: 'g', categoria: 'Despensa' },
    { id: 'sal', nombre: 'Sal', unidad: 'g', categoria: 'Despensa' },
    { id: 'leche', nombre: 'Leche', unidad: 'ml', categoria: 'Lácteos y huevos' },
  ],
  despensa: [
    { articulo_id: 'tomp', cantidad: 5 },
    { articulo_id: 'arroz', cantidad: 1000 },
  ],
  recetas: [{ id: 'r', nombre: 'Arroz con tomate', raciones: 2, tiempo_min: 30, pasos: '1. Cuece el arroz 18 minutos\n2. Añade el tomate' }],
  ingredientes: [
    { id: 'i1', receta_id: 'r', articulo_id: 'arroz', cantidad: 200, orden: 1 },
    { id: 'i2', receta_id: 'r', articulo_id: 'tom', cantidad: 2, orden: 2 },
    { id: 'i3', receta_id: 'r', articulo_id: 'sal', cantidad: null, nota: 'al gusto', orden: 3 },
    { id: 'i4', receta_id: 'r', articulo_id: 'leche', cantidad: 100, orden: 4 },
  ],
});

test('texto de la receta para WhatsApp', () => {
  const d = datos();
  const t = textoReceta(d.recetas[0], d.ingredientes, d.articulos, 4);
  assert.match(t, /^\*Arroz con tomate\*\n4 raciones · 30 min/);
  assert.match(t, /• Arroz: 400 g/);
  assert.match(t, /• Tomate: 4\n/);
  assert.match(t, /• Sal: al gusto/);
  assert.match(t, /\*Preparación\*\n1\. Cuece el arroz 18 minutos\n2\. Añade el tomate$/);
  assert.deepEqual(pasosDe(d.recetas[0]), ['Cuece el arroz 18 minutos', 'Añade el tomate']);
});

test('texto de la lista por secciones', () => {
  const d = datos();
  const t = textoLista('Compra de hoy', [{ articulo_id: 'leche', cantidad: 2000, marca: 'Hacendado' }, { articulo_id: 'tom', cantidad: 3 }], d.articulos);
  assert.match(t, /^🛒 \*Compra de hoy\*/);
  assert.ok(t.indexOf('Frutas y verduras') < t.indexOf('Lácteos'));
  assert.match(t, /▢ Leche \(Hacendado, 2 l\)/);
  assert.match(t, /▢ Tomate \(3\)/);
});

test('descontar lo cocinado: escala, usa variantes y marca lo que no está en casa', () => {
  const filas = aDescontar(datos(), 'r', 4);
  assert.deepEqual(filas.map((f) => [f.nombre, f.cantidad, f.enDespensa]), [
    ['Arroz', 400, true], ['Tomate pera', 4, true], ['Leche', 200, false],
  ]);
});

test('encabezados de la preparación (van en negrita)', async () => {
  const { encabezadoPaso } = await import('../web/src/cocina.js');
  assert.deepEqual(encabezadoPaso('Truco o recomendación:'), { titulo: 'Truco o recomendación:', resto: '' });
  assert.deepEqual(encabezadoPaso('Consejo: sírvelo frío'), { titulo: 'Consejo:', resto: 'sírvelo frío' });
  assert.equal(encabezadoPaso('Para la salsa:').titulo, 'Para la salsa:');
  assert.equal(encabezadoPaso('1. Mezcla todo: harina y huevos'), null);
  assert.equal(encabezadoPaso('Deja reposar 10 minutos.'), null);
});
