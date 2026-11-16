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

test('captura con ingredientes en columnas (infografía) y zonas de foto', async () => {
  const { textoPorColumnas, juntarLecturas, separarDe } = await import('../web/src/receta-texto.js');
  const w = (texto, x0, x1) => ({ texto, x0, x1 });
  const lineas = [
    { y0: 47, y1: 75, confianza: 66, palabras: [w('Orange', 74, 170), w('19:57', 187, 265)] },
    { y0: 241, y1: 262, confianza: 88, palabras: [w('—', 44, 180), w('Cocina', 205, 290), w('de', 300, 330), w('la', 340, 362), w('costa', 370, 435), w('onubense', 445, 560), w('-', 580, 590), w('4', 597, 612), w('raciones', 624, 712)] },
    { y0: 285, y1: 322, confianza: 70, palabras: [w('Ingredientes', 37, 272)] },
    { y0: 339, y1: 360, confianza: 23, palabras: [w('E', 211, 220), w('Ts', 309, 330)] },   // foto
    { y0: 459, y1: 479, confianza: 69, palabras: [w('600', 59, 94), w('g', 100, 112), w('600', 189, 222), w('g', 228, 240), w('2', 393, 402), w('dientes', 407, 450), w('1hoja', 667, 710), w('—', 723, 738), w('1cucharadita', 741, 835)] },
    { y0: 481, y1: 501, confianza: 71, palabras: [w('de', 29, 50), w('atún', 53, 88), w('fresco', 93, 150), w('de', 175, 195), w('cebolla', 199, 250), w('deajo', 405, 450), w('delaurel', 658, 715), w('depimentón', 745, 830)] },
    { y0: 503, y1: 523, confianza: 96, palabras: [w('limpio', 61, 110), w('dulce', 769, 812)] },
  ];
  const peq = [{ y0: 63, y1: 105, confianza: 92, palabras: [w('Atún', 21, 140), w('encebollado', 162, 430)] }];
  const texto = textoPorColumnas(juntarLecturas(lineas, peq, 0.5), 2000);
  assert.equal(texto, [
    'Atún encebollado', 'Cocina de la costa onubense', '4 raciones', 'Ingredientes',
    '600 g de atún fresco limpio', '600 g de cebolla', '2 dientes deajo', '1hoja delaurel', '1cucharadita depimentón dulce',
  ].join('\n'));
  assert.equal(separarDe('2 dientes deajo'), '2 dientes de ajo');
  const r = entenderReceta(texto);
  assert.equal(r.nombre, 'Atún encebollado');
  assert.equal(r.raciones, 4);
  assert.equal(r.ingredientes.length, 5);
});
