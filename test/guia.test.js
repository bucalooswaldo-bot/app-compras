import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIA, alimentosConCasa, buscarEnGuia } from '../web/src/guia.js';
import { CATEGORIAS } from '../web/src/recetas-inicio.js';
import { normalizar } from '../web/src/logica.js';

test('cada sección de la guía usa una sección del súper que existe y no repite alimentos', () => {
  for (const s of GUIA) {
    assert.ok(CATEGORIAS.includes(s.categoria), s.titulo);
    const nombres = s.alimentos.map(([n]) => normalizar(n));
    assert.equal(new Set(nombres).size, nombres.length, s.titulo);
    for (const [, u] of s.alimentos) assert.ok(['g', 'ml', 'ud'].includes(u));
  }
});

test('usa el artículo de la casa (con su unidad) y dice si ya hay', () => {
  const datos = {
    articulos: [{ id: 'a1', nombre: 'leche', unidad: 'ud' }, { id: 'a2', nombre: 'Papas', unidad: 'g' }],
    despensa: [{ articulo_id: 'a1', cantidad: 3 }, { articulo_id: 'a2', cantidad: 0 }],
  };
  const lact = alimentosConCasa(GUIA.find((s) => s.id === 'lacteos'), datos);
  const leche = lact.find((x) => x.nombre === 'Leche');
  assert.equal(leche.articulo.id, 'a1');
  assert.equal(leche.unidad, 'ud');
  assert.equal(leche.tipica, 1);
  assert.equal(leche.enCasa.cantidad, 3);
  const papas = alimentosConCasa(GUIA[0], datos).find((x) => x.nombre === 'Papas');
  assert.equal(papas.enCasa, null); // a 0 no cuenta como "ya en casa"
  assert.equal(papas.tipica, 2000);
});

test('busca sin tildes en toda la guía', () => {
  const r = buscarEnGuia('atun', { articulos: [], despensa: [] }).map((x) => x.nombre);
  assert.ok(r.includes('Atún en lata'));
  assert.equal(buscarEnGuia('a', { articulos: [], despensa: [] }).length, 0);
});
