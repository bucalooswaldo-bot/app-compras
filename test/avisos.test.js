import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisosDeCasa, textoAviso, enumerar } from '../web/src/avisos.js';

const hoy = '2026-11-17';
const datos = () => ({
  articulos: [
    { id: 'leche', nombre: 'Leche', unidad: 'ml', categoria: 'Lácteos y huevos' },
    { id: 'nata', nombre: 'Nata', unidad: 'ml', categoria: 'Lácteos y huevos' },
    { id: 'pasta', nombre: 'Placas de lasaña', unidad: 'ud', categoria: 'Despensa' },
    { id: 'sal', nombre: 'Sal', unidad: 'g', categoria: 'Despensa' },
  ],
  despensa: [
    { articulo_id: 'leche', cantidad: 500, minimo: 1000, avisar_agotado: false },
    { articulo_id: 'pasta', cantidad: 20, minimo: 0, avisar_agotado: false },
  ],
  recetas: [{ id: 'r1', nombre: 'Lasaña', raciones: 4, etiquetas: [] }],
  ingredientes: [
    { id: 'i1', receta_id: 'r1', articulo_id: 'nata', cantidad: 200 },
    { id: 'i2', receta_id: 'r1', articulo_id: 'pasta', cantidad: 12 },
    { id: 'i3', receta_id: 'r1', articulo_id: 'sal', cantidad: null },
  ],
  plan: [{ id: 'p1', fecha: '2026-11-18', momento: 'comida', receta_id: 'r1', raciones: 4, cocinado: false }],
  lista: [],
});

test('avisos: lo que se acaba y lo que falta para el menú', () => {
  const a = avisosDeCasa(datos(), hoy, 3);
  assert.deepEqual(a.seAcaba.map((x) => x.nombre), ['Leche']);
  assert.equal(a.menu.length, 1);
  assert.deepEqual(a.menu[0].faltan.map((f) => f.nombre), ['Nata']);
});

test('avisos: texto del aviso del móvil', () => {
  const t = textoAviso(avisosDeCasa(datos(), hoy, 2), hoy);
  assert.equal(t.titulo, 'Falta algo para el menú');
  assert.equal(t.cuerpo, 'Mañana para comer toca Lasaña y falta nata.\nSe acaba: leche.');
});

test('avisos: lo cocinado, lo apuntado en la lista o lo lejano no avisa', () => {
  const d = datos();
  d.despensa[0].cantidad = 2000;
  d.lista.push({ id: 'l1', articulo_id: 'nata', cantidad: 200, origen: 'manual', comprado: false });
  assert.equal(textoAviso(avisosDeCasa(d, hoy, 2), hoy), null);
  const d2 = datos();
  d2.despensa[0].cantidad = 2000;
  d2.plan[0].fecha = '2026-11-21';
  assert.equal(textoAviso(avisosDeCasa(d2, hoy, 7), hoy), null);
});

test('enumerar', () => {
  assert.equal(enumerar(['Leche']), 'leche');
  assert.equal(enumerar(['Leche', 'Nata', 'Huevos']), 'leche, nata y huevos');
  assert.equal(enumerar(['a', 'b', 'c', 'd', 'e']), 'a, b, c y 2 más');
});

test('la función de avisos usa la misma lógica que la app', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const f of ['logica.js', 'avisos.js']) {
    const app = await readFile(new URL(`../web/src/${f}`, import.meta.url), 'utf8');
    const funcion = await readFile(new URL(`../supabase/functions/avisos/${f}`, import.meta.url), 'utf8');
    assert.equal(funcion, app, `Copia ${f} de web/src a supabase/functions/avisos`);
  }
});
