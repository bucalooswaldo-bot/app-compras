import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partirIngredientes, leerIngrediente, entenderIngredientes, adivinarCategoria } from '../web/src/ingredientes.js';

const ART = [
  { id: 'a1', nombre: 'Aceite de oliva', unidad: 'ml', categoria: 'Despensa' },
  { id: 'a2', nombre: 'Zanahoria', unidad: 'ud', categoria: 'Frutas y verduras' },
  { id: 'a3', nombre: 'Fideos', unidad: 'g', categoria: 'Despensa' },
  { id: 'a4', nombre: 'Queso rallado', unidad: 'g', categoria: 'Charcutería y quesos' },
];

test('parte un texto seguido en ingredientes', () => {
  assert.deepEqual(partirIngredientes('Merluza y harina'), ['Merluza', 'harina']);
  assert.deepEqual(partirIngredientes('Ingredientes:\n- 80 g fideos, 1/2 cebolla; sal (al gusto).'),
    ['80 g fideos', '1/2 cebolla', 'sal']);
});

test('lee cantidad y unidad', () => {
  const a = leerIngrediente('80g fideos');
  assert.equal(a.nombre, 'Fideos'); assert.equal(a.cantidad, 80); assert.equal(a.unidad, 'g');
  const b = leerIngrediente('1 kg de patatas');
  assert.equal(b.nombre, 'Patatas'); assert.equal(b.cantidad, 1000);
  const c = leerIngrediente('1 cdta de soja');
  assert.equal(c.cantidad, null); assert.equal(c.nota, '1 cdta');
});

test('empareja con lo que ya hay y adivina el resto', () => {
  const r = entenderIngredientes('2 zanahorias ralladas, aceite, 80 fideos, 50 g queso rallado, 200 g pechuga de pollo', ART);
  const por = Object.fromEntries(r.map((x) => [x.nombre, x]));
  assert.equal(por.Zanahoria.articulo.id, 'a2'); assert.equal(por.Zanahoria.cantidad, 2);
  assert.equal(por['Aceite de oliva'].cantidad, null);
  assert.equal(por.Fideos.cantidad, 80);
  assert.equal(por['Queso rallado'].cantidad, 50);
  assert.equal(por['Pechuga de pollo'].articulo, null);
  assert.equal(por['Pechuga de pollo'].unidad, 'g');
  assert.equal(por['Pechuga de pollo'].categoria, 'Carne');
});

test('categorías', () => {
  assert.equal(adivinarCategoria('Caldo de pollo'), 'Despensa');
  assert.equal(adivinarCategoria('Cebolla'), 'Frutas y verduras');
  assert.equal(adivinarCategoria('Gambas'), 'Pescado');
});
