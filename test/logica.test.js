import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  faltas, estaBajo, avisoDe, camposAviso, sugerirCompra, formatoCantidad, deEntrada, aEntrada, sumarDias, escalar, agruparPorCategoria, buscarArticulo,
} from '../web/src/logica.js';
import { RECETAS, ARTICULOS } from '../web/src/recetas-inicio.js';

const base = () => ({
  articulos: [
    { id: 'arroz', nombre: 'Arroz', unidad: 'g', categoria: 'Despensa' },
    { id: 'huevos', nombre: 'Huevos', unidad: 'ud', categoria: 'Lácteos y huevos' },
    { id: 'aceite', nombre: 'Aceite de oliva', unidad: 'ml', categoria: 'Despensa' },
    { id: 'tomate', nombre: 'Tomate', unidad: 'ud', categoria: 'Frutas y verduras' },
  ],
  despensa: [],
  recetas: [{ id: 'r1', nombre: 'Arroz a la cubana', raciones: 4 }],
  ingredientes: [
    { id: 'i1', receta_id: 'r1', articulo_id: 'arroz', cantidad: 320 },
    { id: 'i2', receta_id: 'r1', articulo_id: 'huevos', cantidad: 4 },
    { id: 'i3', receta_id: 'r1', articulo_id: 'aceite', cantidad: null },
  ],
  plan: [],
  lista: [],
});

const HOY = '2026-11-16';

test('las recetas del plan entran en la lista, escaladas a las raciones', () => {
  const d = base();
  d.plan.push({ id: 'p1', fecha: HOY, momento: 'cena', receta_id: 'r1', raciones: 3, cocinado: false });
  const f = faltas(d, HOY, sumarDias(HOY, 6));
  assert.deepEqual(f.map((x) => [x.articulo_id, x.cantidad]), [['huevos', 3], ['arroz', 240]]);
  assert.deepEqual(f[0].recetas, ['Arroz a la cubana']);
});

test('lo que hay en casa se descuenta y los "al gusto" no entran', () => {
  const d = base();
  d.plan.push({ id: 'p1', fecha: HOY, momento: 'cena', receta_id: 'r1', raciones: 4, cocinado: false });
  d.despensa.push({ articulo_id: 'arroz', cantidad: 1000, minimo: 0 }, { articulo_id: 'huevos', cantidad: 2, minimo: 0 });
  const f = faltas(d, HOY, HOY);
  assert.deepEqual(f.map((x) => [x.articulo_id, x.cantidad]), [['huevos', 2]]);
});

test('lo que baja del mínimo entra aunque no haya recetas', () => {
  const d = base();
  d.despensa.push({ articulo_id: 'aceite', cantidad: 200, minimo: 1000 }, { articulo_id: 'tomate', cantidad: 5, minimo: 2 });
  const f = faltas(d, HOY, HOY);
  assert.equal(f.length, 1);
  assert.equal(f[0].articulo_id, 'aceite');
  assert.equal(f[0].cantidad, 800);
  assert.equal(f[0].bajoMinimo, true);
});

test('fuera de plazo, cocinado o ya apuntado a mano: no se pide otra vez', () => {
  const d = base();
  d.plan.push(
    { id: 'p1', fecha: sumarDias(HOY, 10), momento: 'cena', receta_id: 'r1', raciones: 4, cocinado: false },
    { id: 'p2', fecha: HOY, momento: 'comida', receta_id: 'r1', raciones: 4, cocinado: true },
    { id: 'p3', fecha: sumarDias(HOY, -1), momento: 'comida', receta_id: 'r1', raciones: 4, cocinado: false },
  );
  assert.equal(faltas(d, HOY, sumarDias(HOY, 6)).length, 0);
  d.plan.push({ id: 'p4', fecha: HOY, momento: 'cena', receta_id: 'r1', raciones: 4, cocinado: false });
  d.lista.push({ id: 'l1', articulo_id: 'huevos', cantidad: null, comprado: false });
  d.lista.push({ id: 'l2', articulo_id: 'arroz', cantidad: 100, comprado: false });
  const f = faltas(d, HOY, sumarDias(HOY, 6));
  assert.deepEqual(f.map((x) => [x.articulo_id, x.cantidad]), [['arroz', 220]]);
});

test('las unidades se redondean hacia arriba', () => {
  const d = base();
  d.plan.push({ id: 'p1', fecha: HOY, momento: 'cena', receta_id: 'r1', raciones: 3, cocinado: false });
  d.ingredientes[1].cantidad = 3; // 3 huevos para 4 -> 2,25 para 3 -> 3
  assert.equal(faltas(d, HOY, HOY).find((x) => x.articulo_id === 'huevos').cantidad, 3);
});

test('formato y entrada de cantidades', () => {
  assert.equal(formatoCantidad(1500, 'g'), '1,5 kg');
  assert.equal(formatoCantidad(250, 'ml'), '250 ml');
  assert.equal(formatoCantidad(2000, 'ml'), '2 l');
  assert.equal(formatoCantidad(3, 'ud'), '3 ud');
  assert.equal(deEntrada('1,5', 'kg'), 1500);
  assert.equal(deEntrada('', 'g'), null);
  assert.equal(deEntrada('abc', 'g'), null);
  assert.deepEqual(aEntrada(1500, 'g'), ['1,5', 'kg']);
  assert.equal(escalar(300, 4, 2), 150);
  assert.equal(sumarDias('2026-12-30', 3), '2027-01-02');
});

test('agrupar por sección del súper y buscar sin tildes', () => {
  const d = base();
  const g = agruparPorCategoria([{ articulo_id: 'arroz' }, { articulo_id: 'tomate' }], d.articulos);
  assert.deepEqual(g.map(([c]) => c), ['Frutas y verduras', 'Despensa']);
  assert.equal(buscarArticulo(d.articulos, '  aceite DE óliva ')?.id, 'aceite');
});

test('las recetas propuestas solo usan artículos conocidos', () => {
  for (const r of RECETAS) {
    for (const [nombre, cantidad] of r.ingredientes) {
      assert.ok(ARTICULOS[nombre], `${r.nombre}: falta el artículo "${nombre}"`);
      assert.ok(cantidad === null || cantidad > 0);
    }
    assert.ok(r.pasos.length > 20);
  }
  assert.equal(new Set(RECETAS.map((r) => r.nombre)).size, RECETAS.length);
});

test('ingredientes sin cantidad (no básicos) entran si no hay en casa', () => {
  const d = base();
  d.articulos.push({ id: 'lechuga', nombre: 'Lechuga', unidad: 'ud', categoria: 'Frutas y verduras' });
  d.ingredientes.push({ id: 'i4', receta_id: 'r1', articulo_id: 'lechuga', cantidad: null });
  d.plan.push({ id: 'p1', fecha: HOY, momento: 'cena', receta_id: 'r1', raciones: 4, cocinado: false });
  let f = faltas(d, HOY, HOY);
  const lechuga = f.find((x) => x.articulo_id === 'lechuga');
  assert.ok(lechuga);
  assert.equal(lechuga.cantidad, null);
  assert.ok(!f.some((x) => x.articulo_id === 'aceite'), 'el aceite es básico');
  d.despensa.push({ articulo_id: 'lechuga', cantidad: 1, minimo: 0 });
  f = faltas(d, HOY, HOY);
  assert.ok(!f.some((x) => x.articulo_id === 'lechuga'), 'si hay en casa no se pide');
});

test('"hoy no" quita una cosa de la lista solo ese día', () => {
  const d = base();
  d.despensa.push({ articulo_id: 'tomate', cantidad: 0, minimo: 2 });
  d.lista.push({ id: 'x', articulo_id: 'tomate', cantidad: null, origen: 'auto', comprado: false, creado_en: `${HOY}T10:00:00Z` });
  assert.equal(faltas(d, HOY, HOY).length, 0);
  assert.equal(faltas(d, sumarDias(HOY, 1), sumarDias(HOY, 1)).length, 1, 'al día siguiente vuelve');
});

test('sugerir lo que se compra a menudo y no hay', () => {
  const d = base();
  d.tique_lineas = [{ articulo_id: 'huevos' }, { articulo_id: 'huevos' }, { articulo_id: 'arroz' }, { articulo_id: 'tomate' }];
  d.lista.push({ id: 'c', articulo_id: 'tomate', comprado: true, origen: 'manual' });
  d.despensa.push({ articulo_id: 'tomate', cantidad: 3, minimo: 0 });
  assert.deepEqual(sugerirCompra(d, new Set()), ['huevos']);
  assert.deepEqual(sugerirCompra(d, new Set(['huevos'])), []);
});

test('al llegar justo al mínimo también avisa ("avísame cuando quede 1")', () => {
  const d = base();
  d.despensa.push({ articulo_id: 'tomate', cantidad: 1, minimo: 1 });
  const f = faltas(d, HOY, HOY);
  assert.equal(f.length, 1);
  assert.equal(f[0].bajoMinimo, true);
  assert.equal(f[0].cantidad, null);
  d.lista.push({ id: 'l', articulo_id: 'tomate', cantidad: null, origen: 'manual', comprado: false });
  assert.equal(faltas(d, HOY, HOY).length, 0, 'si ya está apuntado no se repite');
});

test('aviso «cuando no quede»: solo salta al llegar a 0 y entra en la lista sin cantidad', () => {
  const d = base();
  d.despensa.push({ articulo_id: 'aceite', cantidad: 0, minimo: 0, avisar_agotado: true },
    { articulo_id: 'tomate', cantidad: 1, minimo: 0, avisar_agotado: true },
    { articulo_id: 'huevos', cantidad: 0, minimo: 0, avisar_agotado: false });
  assert.equal(estaBajo(d.despensa[0]), true);
  assert.equal(estaBajo(d.despensa[1]), false);
  assert.equal(estaBajo(d.despensa[2]), false);
  const f = faltas(d, HOY, HOY);
  assert.deepEqual(f.map((x) => [x.articulo_id, x.cantidad, x.bajoMinimo]), [['aceite', null, true]]);
});

test('el aviso como un solo valor: sin aviso, cuando no quede, al quedar X', () => {
  assert.equal(avisoDe({ minimo: 0, avisar_agotado: false }), null);
  assert.equal(avisoDe({ minimo: 0, avisar_agotado: true }), 0);
  assert.equal(avisoDe({ minimo: 2 }), 2);
  assert.deepEqual(camposAviso(null), { minimo: 0, avisar_agotado: false });
  assert.deepEqual(camposAviso(0), { minimo: 0, avisar_agotado: true });
  assert.deepEqual(camposAviso(3), { minimo: 3, avisar_agotado: false });
});
