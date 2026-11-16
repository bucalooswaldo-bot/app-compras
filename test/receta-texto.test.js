import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entenderReceta, leerRaciones, leerMinutos } from '../web/src/receta-texto.js';

test('captura de Instagram con títulos, ruido de la pantalla y pasos partidos', () => {
  const texto = `12:45 ✱ 87%
cocinaconmaria
Seguir
POLLO AL CURRY 🍛
Para 4 personas
⏱ 35 min
Ingredientes:
• 500 g de pechuga de pollo
• 1 cebolla
• 200 ml de leche de
coco
• 2 cucharadas de curry
• ½ pimiento rojo
Preparación:
1. Corta el pollo en dados y salpimienta.
2. Sofríe la cebolla picada durante 5
minutos a fuego medio.
3. Añade el curry, el pollo y la leche de coco. Cocina 15 minutos.
1.234 Me gusta
Ver los 56 comentarios`;
  const r = entenderReceta(texto);
  assert.equal(r.nombre, 'Pollo al curry');
  assert.equal(r.raciones, 4);
  assert.equal(r.tiempo_min, 35);
  assert.deepEqual(r.ingredientes, ['500 g de pechuga de pollo', '1 cebolla', '200 ml de leche de coco', '2 cucharadas de curry', '1/2 pimiento rojo']);
  assert.deepEqual(r.pasos, [
    'Corta el pollo en dados y salpimienta.',
    'Sofríe la cebolla picada durante 5 minutos a fuego medio.',
    'Añade el curry, el pollo y la leche de coco. Cocina 15 minutos.',
  ]);
});

test('sin título de pasos: las frases después de los ingredientes son pasos', () => {
  const r = entenderReceta(`Receta de tortilla de papas
Ingredientes
6 huevos
4 papas medianas
1 cebolla
Aceite de oliva y sal
Pela y corta las papas en láminas finas y fríelas con la cebolla a fuego lento.
Bate los huevos, mezcla y cuaja la tortilla por los dos lados.`);
  assert.equal(r.nombre, 'Tortilla de papas');
  assert.deepEqual(r.ingredientes, ['6 huevos', '4 papas medianas', '1 cebolla', 'Aceite de oliva y sal']);
  assert.equal(r.pasos.length, 2);
  assert.equal(r.raciones, null);
});

test('sin títulos: ingredientes por viñetas y pasos por frases', () => {
  const r = entenderReceta(`Crema de calabaza
- 600 g de calabaza
- 1 puerro
- 1 papa
Rehoga el puerro, añade la calabaza y la papa troceadas y cubre con agua.
Cuece 20 minutos y tritura.`);
  assert.equal(r.nombre, 'Crema de calabaza');
  assert.deepEqual(r.ingredientes, ['600 g de calabaza', '1 puerro', '1 papa']);
  assert.equal(r.pasos.length, 2);
  assert.equal(r.tiempo_min, null, 'los 20 minutos de cocción no son el tiempo de la receta');
});

test('raciones y tiempo', () => {
  assert.equal(leerRaciones('Raciones: 6'), 6);
  assert.equal(leerRaciones('2 personas'), 2);
  assert.equal(leerRaciones('Hornea para 2 minutos'), null);
  assert.equal(leerMinutos('Tiempo total: 1 h 15 min'), 75);
  assert.equal(leerMinutos('1 hora'), 60);
  assert.equal(leerMinutos('Cocer durante 10 minutos removiendo de vez en cuando'), null);
});

test('nombre con restos de un emoji y tiempo en la línea de raciones', () => {
  const r = entenderReceta('LENTEJAS CON CHORIZO é\nPara 4 personas · 50 min\nIngredientes:\n400 g de lentejas');
  assert.equal(r.nombre, 'Lentejas con chorizo');
  assert.equal(r.tiempo_min, 50);
  assert.equal(r.raciones, 4);
});
