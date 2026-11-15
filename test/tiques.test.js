import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerTique, emparejarArticulo, gastosPorPeriodo, ahorroPosible, inicioPeriodo, pagado, gastoPorCategoria, textoCSV, tiqueRepetido } from '../web/src/tiques.js';
import { ARTICULOS } from '../web/src/recetas-inicio.js';

const articulos = Object.entries(ARTICULOS).map(([nombre, [unidad]], i) => ({ id: `a${i}`, nombre, unidad }));

const LIDL = `Lidl Supermercados S.A.U.
C/ Ejemplo 1, Las Palmas de G.C.
EUR
Leche semidesnatada        0,89 A
Pan de molde integral      1,18 A
2 x 0,59
Platanos de Canarias       1,49 A
Descuento Lidl Plus       -0,20
Atun claro pack 3x80g      2,19 B
Total                      5,55
Tarjeta                    5,55
IGIC 3%   5,39   0,16
15.11.26 18:32`;

test('tique de Lidl Plus: líneas, cantidades, descuentos, total y fecha', () => {
  const t = leerTique(LIDL);
  assert.equal(t.supermercado, 'lidl');
  assert.equal(t.fecha, '2026-11-15');
  assert.equal(t.total, 5.55);
  assert.deepEqual(t.lineas.map((l) => [l.texto, l.cantidad, l.importe, l.descuento]), [
    ['Leche semidesnatada', null, 0.89, 0],
    ['Pan de molde integral', 2, 1.18, 0],
    ['Platanos de Canarias', null, 1.49, 0.2],
    ['Atun claro pack 3x80g', null, 2.19, 0],
  ]);
  assert.equal(pagado(t.lineas[2]), 1.29);
});

const MERCADONA = `MERCADONA, S.A. A-46103834
C/ EJEMPLO 2 LAS PALMAS
TELÉFONO: 928000000
15/11/2026 18:32 OP: 123456
FACTURA SIMPLIFICADA: 2345-012-123456
Descripción P. Unit Importe
1 LECHE ENTERA 0,96
2 TOMATE TRITURADO 0,55 1,10
1 PLATANO
1,234 kg 1,99 €/kg 2,46
1 ARROZ LARGO 1,15
TOTAL (€) 5,67
TARJETA BANCARIA 5,67
IGIC BASE IMPONIBLE (€) CUOTA (€)
3% 5,50 0,17`;

test('tique de Mercadona: cantidad delante, precio por unidad y fruta al peso', () => {
  const t = leerTique(MERCADONA);
  assert.equal(t.supermercado, 'mercadona');
  assert.equal(t.fecha, '2026-11-15');
  assert.equal(t.total, 5.67);
  assert.deepEqual(t.lineas.map((l) => [l.texto, l.cantidad, l.precio_unidad, l.importe]), [
    ['LECHE ENTERA', 1, null, 0.96],
    ['TOMATE TRITURADO', 2, 0.55, 1.1],
    ['PLATANO', 1.234, null, 2.46],
    ['ARROZ LARGO', 1, null, 1.15],
  ]);
});

test('errores típicos del móvil al leer: O por 0 y comas', () => {
  const t = leerTique('LIDL\nHuevos camperos 2,O9 A\nTotal 2,09');
  assert.equal(t.lineas[0].importe, 2.09);
});

test('emparejar líneas del tique con artículos de la casa', () => {
  const a = (t) => emparejarArticulo(t, articulos)?.nombre ?? null;
  assert.equal(a('TOMATE TRITURADO'), 'Tomate triturado');
  assert.equal(a('Leche semidesnatada'), 'Leche');
  assert.equal(a('Platanos de Canarias'), 'Plátano');
  assert.equal(a('Atun claro pack 3x80g'), null); // "Atún en lata": falta "lata"
  assert.equal(a('SALMON AHUMADO'), 'Salmón');
  assert.equal(a('SAL FINA'), 'Sal');
  assert.equal(a('Detergente'), null);
});

test('gastos por semana, mes y año', () => {
  const tiques = [
    { fecha: '2026-11-15', supermercado_id: 'lidl', total: 20 },
    { fecha: '2026-11-10', supermercado_id: 'mercadona', total: 30.5 },
    { fecha: '2026-11-08', supermercado_id: 'mercadona', total: 10 },
    { fecha: '2026-10-30', supermercado_id: 'hiperdino', total: 5 },
  ];
  assert.equal(inicioPeriodo('2026-11-15', 'semana'), '2026-11-09'); // domingo -> lunes anterior
  const sem = gastosPorPeriodo(tiques, 'semana');
  assert.deepEqual(sem[0], { inicio: '2026-11-09', total: 50.5, porSuper: { lidl: 20, mercadona: 30.5 }, tiques: 2 });
  const mes = gastosPorPeriodo(tiques, 'mes');
  assert.deepEqual(mes.map((g) => [g.inicio, g.total]), [['2026-11-01', 60.5], ['2026-10-01', 5]]);
  assert.equal(gastosPorPeriodo(tiques, 'anio')[0].total, 65.5);
});

test('ahorro posible comparando con los otros súper', () => {
  const lineas = [
    { texto: 'LECHE', articulo_id: 'leche', supermercado_id: 'mercadona', cantidad: 6, importe: 5.76, descuento: 0 },
    { texto: 'ARROZ', articulo_id: 'arroz', supermercado_id: 'mercadona', cantidad: 1, importe: 1.15, descuento: 0 },
    { texto: 'COSA', articulo_id: null, supermercado_id: 'mercadona', importe: 3, descuento: 0 },
  ];
  const precios = { 'leche|hiperdino': 0.94, 'arroz|hiperdino': 1.34, 'arroz|lidl': 0.99 };
  const r = ahorroPosible(lineas, (a, s) => precios[`${a}|${s}`] ?? null, ['mercadona', 'hiperdino', 'lidl']);
  assert.equal(r.pagado, 6.91);
  assert.equal(r.minimo, 6.63);   // leche 6 x 0,94 = 5,64; arroz en Lidl 0,99
  assert.equal(r.ahorro, 0.28);
  assert.deepEqual(r.detalle.map((d) => [d.texto, d.en, d.diferencia]), [['LECHE', 'hiperdino', 0.12], ['ARROZ', 'lidl', 0.16]].sort((a, b) => b[2] - a[2]));
});

test('captura de Lidl Plus leída por el móvil (texto real del reconocedor)', () => {
  const ocr = `Lidl Plus - Tique\n\nLidl Supermercados S.A.U.\n\nLas Palmas de G.C.\n\nEUR\nLeche semidesnatada 0,89A\nPan de molde integral 1,18A\n2 x 0,59\nPlátanos de Canarias 1,49A\nDescuento Lidl Plus -0,20\nAtún claro pack 3x80g 219B\nTotal 5,55\nTarjeta 5,55\n15.11.26 18:32`;
  const t = leerTique(ocr);
  assert.equal(t.lineas.length, 4);
  assert.equal(t.lineas[3].importe, 2.19);
  assert.equal(t.total, 5.55);
});

test('tique de HiperDino: cantidad detrás del nombre, peso y descuento del club', () => {
  const t = leerTique(`HIPERDINO EXPRESS
DINOSOL SUPERMERCADOS S.L.
FECHA: 14/11/2026 19:02
DESCRIPCION CANT. PRECIO IMPORTE
LECHE ASTURIANA SEMI 1L 2 1,15 2,30
PAN MOLDE BIMBO 0,99
PLATANO CANARIAS
0,870 kg x 1,79 €/kg 1,56
MANZANA GOLDEN 0,654 kg x 2,15 €/kg 1,41
TOMATE TRITURADO HIDA 0,85
DTO. CLUB HIPERDINO -0,20
TOTAL COMPRA 6,91
TARJETA 6,91`);
  assert.equal(t.supermercado, 'hiperdino');
  assert.equal(t.fecha, '2026-11-14');
  assert.equal(t.total, 6.91);
  assert.deepEqual(t.lineas.map((l) => [l.texto, l.cantidad, l.importe, l.descuento, !!l.kg]), [
    ['LECHE ASTURIANA SEMI 1L', 2, 2.3, 0, false],
    ['PAN MOLDE BIMBO', null, 0.99, 0, false],
    ['PLATANO CANARIAS', 0.87, 1.56, 0, true],
    ['MANZANA GOLDEN', 0.654, 1.41, 0, true],
    ['TOMATE TRITURADO HIDA', null, 0.85, 0.2, false],
  ]);
});

test('gasto por sección y CSV para Excel', () => {
  const arts = [{ id: 'l', nombre: 'Leche', categoria: 'Lácteos' }, { id: 'p', nombre: 'Plátano', categoria: 'Frutería' }];
  const g = gastoPorCategoria([
    { articulo_id: 'l', importe: 2.3, descuento: 0 }, { articulo_id: 'p', importe: 1.56, descuento: 0.2 },
    { articulo_id: null, importe: 3, descuento: 0 }, { articulo_id: 'l', importe: 0.89, descuento: 0 },
  ], arts);
  assert.deepEqual(g, [['Lácteos', 3.19], ['Sin clasificar', 3], ['Frutería', 1.36]]);
  assert.equal(textoCSV([['Fecha', 'Producto', 'Pagado'], ['2026-11-14', 'Pan; "molde"', 1.5]]),
    'Fecha;Producto;Pagado\r\n2026-11-14;"Pan; ""molde""";1,5');
});

test('tique repetido: mismo súper, día y total (y hora si la hay)', () => {
  const guardados = [
    { id: 't1', supermercado_id: 'hiperdino', fecha: '2026-11-14T19:02:00+00:00', total: 5.5 },
    { id: 't2', supermercado_id: 'lidl', fecha: '2026-11-15T12:00:00+00:00', total: 5.55 },
  ];
  const lineas = [{ tique_id: 't2', texto: 'Leche semidesnatada' }, { tique_id: 't2', texto: 'Pan de molde integral' }];
  const leido = leerTique('HIPERDINO\nFECHA: 14/11/2026 19:02\nPAN 0,99\nTOTAL 5,50');
  assert.equal(leido.hora, '19:02');
  assert.equal(tiqueRepetido({ ...leido, fecha: leido.fecha }, guardados)?.id, 't1');
  assert.equal(tiqueRepetido({ ...leido, hora: '20:15' }, guardados), null);           // otra compra ese día
  assert.equal(tiqueRepetido({ ...leido, total: 7.1 }, guardados), null);
  // Súper no reconocido pero mismas líneas, día y total
  assert.equal(tiqueRepetido({ supermercado: null, fecha: '2026-11-15', total: 5.55,
    lineas: [{ texto: 'Leche semidesnatada' }, { texto: 'PAN DE MOLDE INTEGRAL' }] }, guardados, lineas)?.id, 't2');
  assert.equal(tiqueRepetido({ supermercado: 'mercadona', fecha: '2026-11-15', total: 5.55,
    lineas: [{ texto: 'Huevos' }] }, guardados, lineas), null);
});
