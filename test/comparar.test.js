import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pareceFrase,
  entenderDictado, cantidadParaArticulo, sugerir, calcularCesta, textoBusqueda, coste,
} from '../web/src/comparar.js';
import { ARTICULOS } from '../web/src/recetas-inicio.js';

const articulos = Object.entries(ARTICULOS).map(([nombre, [unidad, categoria]], i) => ({ id: `a${i}`, nombre, unidad, categoria }));
const resumen = (lista) => lista.map((c) => [c.nombre, c.cantidad, c.unidad, c.detalle].filter((x) => x != null).join(' | '));

test('dictado sin comas: separa cada cosa (lo que dijeron de verdad)', () => {
  const r = entenderDictado('Necesito aceite sal tomate triturado arroz y azúcar', articulos);
  assert.deepEqual(resumen(r), ['Aceite de oliva', 'Sal', 'Tomate triturado', 'Arroz', 'Azúcar']);
  assert.equal(r[4].articulo, null); // azúcar no estaba: se crea
  assert.ok(r[0].articulo);
});

test('dictado con cantidades, marcas y descripciones', () => {
  const r = entenderDictado('nos hace falta 2 kilos de papas, leche puleva sin lactosa, una docena de huevos y 3 latas de atún calvo', articulos);
  assert.deepEqual(resumen(r), [
    'Papas | 2000 | g',
    'Leche | puleva sin lactosa',
    'Huevos | 12 | ud',
    'Atún en lata | 3',
  ].map((x, i) => (i === 3 ? 'Atún en lata | 3 | calvo' : x)));
});

test('dictado: artículo nuevo de varias palabras y "aceite de girasol"', () => {
  const r = entenderDictado('papel higiénico, aceite de girasol y pan integral', articulos);
  assert.deepEqual(resumen(r), ['Papel higiénico', 'Aceite de oliva | girasol', 'Pan | integral'].map((x) =>
    x === 'Aceite de oliva | girasol' ? 'Aceite de oliva | de girasol' : x));
});

test('dictado: "sin sal" no se convierte en otra cosa', () => {
  const r = entenderDictado('pan sin sal y leche', articulos);
  assert.deepEqual(resumen(r), ['Pan | sin sal', 'Leche']);
});

test('cantidad dicha pasada a la unidad del artículo', () => {
  assert.equal(cantidadParaArticulo({ cantidad: 2000, unidad: 'g' }, 'g'), 2000);
  assert.equal(cantidadParaArticulo({ cantidad: 3, unidad: null }, 'ud'), 3);
  assert.equal(cantidadParaArticulo({ cantidad: 3, unidad: null }, 'g'), null); // "3 latas" de algo en gramos
});

test('texto para el buscador', () => {
  assert.equal(textoBusqueda('Millo (mazorca)', null, 'mercadona'), 'maiz');
  assert.equal(textoBusqueda('Papas', null, 'mercadona'), 'patatas');
  assert.equal(textoBusqueda('Papas', null, 'hiperdino'), 'Papas');
  assert.equal(textoBusqueda('Azafrán o colorante', null, 'hiperdino'), 'Azafrán');
  assert.equal(textoBusqueda('Leche', 'puleva', 'hiperdino'), 'Leche puleva');
});

// Resultados reales de HiperDino y Mercadona para "leche entera" (15/11/2026)
const p = (nombre, marca, cantidad, unidad, precio) => ({ id: nombre + cantidad, nombre, marca, cantidad, unidad, precio });
const LECHE_HD = [
  p('HiperDino leche entera 1 l', 'HiperDino', 1000, 'ml', 0.95),
  p('Asturiana leche entera 1 l', 'Asturiana', 1000, 'ml', 1.36),
  p('Asturiana leche entera 1,5 l', 'Asturiana', 1500, 'ml', 2.07),
  p('Granja Riosol leche entera 1 l', 'Granja Riosol', 1000, 'ml', 0.94),
  p('Puleva leche entera 1 l', 'Puleva', 1000, 'ml', 1.11),
  p('Asturiana leche entera 6 x 200 ml', 'Asturiana', 1200, 'ml', 2.35),
];
const LECHE_MD = [
  p('Leche entera Hacendado', 'Hacendado', 6000, 'ml', 5.76),
  p('Leche entera Hacendado', 'Hacendado', 1000, 'ml', 0.96),
  p('Leche entera sin lactosa Hacendado', 'Hacendado', 1000, 'ml', 1.04),
  p('Leche entera Asturiana', 'Asturiana', 1000, 'ml', 1.3),
];

test('sugerir: la más barata de las que encajan, en formato normal', () => {
  assert.equal(sugerir(LECHE_HD, { nombre: 'Leche', detalle: 'entera', unidad: 'ml' }).nombre, 'Granja Riosol leche entera 1 l');
  // No propone el pack de 6 l aunque salga igual por litro: se compra 1 l.
  assert.equal(sugerir(LECHE_MD, { nombre: 'Leche', unidad: 'ml' }).cantidad, 1000);
  assert.equal(sugerir(LECHE_HD, { nombre: 'Leche', detalle: 'puleva', unidad: 'ml' }).marca, 'Puleva');
  assert.equal(sugerir(LECHE_HD, { nombre: 'Leche', detalle: 'kalise', unidad: 'ml' }), null);
  assert.equal(sugerir(LECHE_HD, { nombre: 'Arroz', unidad: 'g' }), null);
});

test('sugerir respeta lo que no le gusta', () => {
  const r = sugerir(LECHE_HD, { nombre: 'Leche', unidad: 'ml' }, (x) => x.marca !== 'Granja Riosol');
  assert.equal(r.marca, 'HiperDino');
});

test('coste: envases según la cantidad', () => {
  assert.deepEqual(coste({ cantidad: 800, unidad: 'g' }, { precio: 0.55, cantidad: 400, unidad: 'g' }), { envases: 2, total: 1.1, aprox: false });
  assert.deepEqual(coste({ cantidad: null, unidad: 'g' }, { precio: 0.55, cantidad: 400, unidad: 'g' }), { envases: 1, total: 0.55, aprox: false });
  assert.equal(coste({ cantidad: 3, unidad: 'ud' }, { precio: 1.5, cantidad: 1000, unidad: 'g' }).aprox, true);
});

test('cesta: el más barato, el reparto y cuándo merece la pena ir a dos', () => {
  const items = [
    { clave: 'leche', nombre: 'Leche', cantidad: 6000, unidad: 'ml',
      candidatos: { mercadona: [LECHE_MD[1]], hiperdino: [LECHE_HD[3]] } },
    { clave: 'arroz', nombre: 'Arroz', cantidad: null, unidad: 'g',
      candidatos: { mercadona: [p('Arroz redondo', 'Hacendado', 1000, 'g', 1.2)], hiperdino: [p('HiperDino arroz', 'HiperDino', 1000, 'g', 1.6)] } },
    { clave: 'gofio', nombre: 'Gofio', cantidad: null, unidad: 'g',
      candidatos: { hiperdino: [p('Gofio La Piña', 'La Piña', 1000, 'g', 2.1)] } },
    { clave: 'nada', nombre: 'Algo raro', cantidad: null, unidad: 'ud', candidatos: {} },
  ];
  const c = calcularCesta(items, ['mercadona', 'hiperdino', 'lidl']);
  assert.equal(c.comunes, 2);
  assert.deepEqual(c.totales, { mercadona: 6.96, hiperdino: 7.24 });
  assert.equal(c.masBarato, 'mercadona');
  assert.equal(c.repartido, 6.84);            // leche en HiperDino, arroz en Mercadona
  assert.equal(c.ahorro, 0.12);
  assert.equal(c.recomendacion.tipo, 'uno');  // ahorra menos de 3 €: no merece la pena
  assert.equal(c.soloEn.hiperdino[0].item.nombre, 'Gofio');
  assert.equal(c.sinPrecio[0].item.nombre, 'Algo raro');
  assert.deepEqual(c.reparto.hiperdino.map((l) => l.item.clave), ['leche', 'gofio']);
});

// --- Con resultados reales de los buscadores (test/busquedas-reales.js) ---
import { BUSQUEDAS } from './busquedas-reales.js';

test('sugerir con datos reales: lo normal y lo más barato, no rarezas', () => {
  const s = (clave, pedido) => sugerir(BUSQUEDAS[clave], pedido)?.nombre;
  assert.equal(s('hiperdino|sal', { nombre: 'Sal', unidad: 'g' }), 'Zelva sal gruesa marina 1 kg');      // no "margarina con sal" ni salmón
  assert.equal(s('hiperdino|huevos', { nombre: 'Huevos', unidad: 'ud' }), 'Rujamar huevos moreno M 12 ud'); // no de codorniz
  assert.equal(s('mercadona|patatas', { nombre: 'Papas', unidad: 'g' }), 'Patatas');                        // no fritas ni congeladas
  assert.equal(s('hiperdino|papas', { nombre: 'Papas', unidad: 'g' }), 'Papa seleccionada kg');
  assert.equal(s('mercadona|aceite de oliva', { nombre: 'Aceite de oliva', unidad: 'ml' }), 'Aceite de oliva 0,4º Hacendado');
  assert.equal(s('hiperdino|leche entera', { nombre: 'Leche', detalle: 'entera', unidad: 'ml' }), 'Granja Riosol leche entera 1 l');
  assert.equal(s('hiperdino|leche entera', { nombre: 'Leche', detalle: 'puleva', unidad: 'ml' }), 'Puleva leche entera 1 l');
  // Con cantidad: lo que menos cueste comprar 6 l.
  assert.equal(sugerir(BUSQUEDAS['mercadona|leche entera'], { nombre: 'Leche', detalle: 'entera', unidad: 'ml', cantidad: 6000 }).formato, 'Pack-6 6 l');
});

test('cesta sin cantidad y envases distintos: compara lo mismo (por kg)', () => {
  const malla = BUSQUEDAS['mercadona|patatas'][1];   // 3 kg, 4,90 €
  const kilo = BUSQUEDAS['hiperdino|papas'][4];       // 1 kg, 1,77 €
  const c = calcularCesta([{ clave: 'papas', nombre: 'Papas', cantidad: null, unidad: 'g',
    candidatos: { mercadona: [malla], hiperdino: [kilo] } }], ['mercadona', 'hiperdino']);
  const l = c.lineas[0];
  assert.equal(l.porSuper.mercadona.total, 1.63);     // 4,90 € / 3 kg
  assert.equal(l.porSuper.mercadona.aprox, true);
  assert.equal(l.porSuper.hiperdino.total, 1.77);
  assert.equal(l.mejor, 'mercadona');
});

test('dictado: una frase guardada antes como un solo artículo no se vuelve a usar como artículo', () => {
  const arts = [
    { id: 'x', nombre: 'Necesito aceite sal tomate triturado arroz y azúcar', unidad: 'ud' },
    { id: 'a', nombre: 'Aceite de oliva', unidad: 'ml' }, { id: 's', nombre: 'Sal', unidad: 'g' },
    { id: 't', nombre: 'Tomate triturado', unidad: 'g' }, { id: 'r', nombre: 'Arroz', unidad: 'g' },
  ];
  assert.ok(pareceFrase(arts[0].nombre));
  assert.ok(!pareceFrase('Tomate triturado') && !pareceFrase('Sal y pimienta'));
  const cosas = entenderDictado(arts[0].nombre, arts);
  assert.deepEqual(cosas.map((c) => c.articulo?.id ?? c.nombre), ['a', 's', 't', 'r', 'Azúcar']);
});

test('dictar con envases o trozos: "3 lonchas de queso", "1 lata de atún"', async () => {
  const { entenderDictado: dictar, textoCantidadDicha, envaseSegun } = await import('../web/src/comparar.js');
  const cosas = dictar('3 lonchas de queso, 1 lata de atún, 2 paquetes de arroz, medio kilo de carne picada, 6 huevos', [], []);
  assert.deepEqual(cosas.map((c) => [c.nombre, textoCantidadDicha(c)]), [
    ['Queso', '3 lonchas'], ['Atún', '1 lata'], ['Arroz', '2 paquetes'], ['Carne picada', '500 g'], ['Huevos', '6'],
  ]);
  assert.equal(envaseSegun('botes', 1), 'bote');
  assert.equal(envaseSegun('botes', 2), 'botes');
});
