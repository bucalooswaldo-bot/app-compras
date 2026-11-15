import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proponerMenu } from '../web/src/menu.js';

const r = (id, etiquetas, favorita = false) => ({ id, nombre: id, etiquetas, favorita, raciones: 4 });
const datos = () => ({
  recetas: [r('lentejas', ['Cuchara', 'Legumbres']), r('tortilla', ['Huevos', 'Cena']), r('pollo', ['Carne', 'Horno']),
    r('merluza', ['Pescado', 'Ligera']), r('macarrones', ['Pasta', 'Niños']), r('potaje', ['Cuchara', 'Canaria', 'Verduras'])],
  ingredientes: [
    { receta_id: 'lentejas', articulo_id: 'lentejas', cantidad: 300 }, { receta_id: 'lentejas', articulo_id: 'chorizo', cantidad: 100 },
    { receta_id: 'tortilla', articulo_id: 'huevos', cantidad: 6 }, { receta_id: 'tortilla', articulo_id: 'papas', cantidad: 500 },
    { receta_id: 'pollo', articulo_id: 'pollo', cantidad: 800 },
    { receta_id: 'merluza', articulo_id: 'merluza', cantidad: 400 },
    { receta_id: 'macarrones', articulo_id: 'macarrones', cantidad: 400 },
    { receta_id: 'potaje', articulo_id: 'berros', cantidad: 300 },
  ],
  despensa: [{ articulo_id: 'huevos', cantidad: 12 }, { articulo_id: 'papas', cantidad: 2000 }, { articulo_id: 'lentejas', cantidad: 500 }],
  plan: [{ fecha: '2026-11-16', momento: 'comida', receta_id: 'pollo', raciones: 2 }],
});

test('menú: rellena solo los huecos libres, empieza por lo que hay en casa y no repite', () => {
  const m = proponerMenu(datos(), { desde: '2026-11-16', dias: 3 });
  assert.equal(m.length, 5);                                    // 6 huecos menos la comida ya puesta
  assert.ok(!m.some((x) => x.fecha === '2026-11-16' && x.momento === 'comida'));
  assert.equal(m[0].receta_id, 'tortilla');                     // cena del lunes: todo en casa y es de cena
  assert.equal(m[1].receta_id, 'lentejas');                     // comida del martes: lentejas en casa
  assert.equal(new Set(m.map((x) => x.receta_id)).size, 5);    // sin repetir en la semana
  assert.match(m[0].motivo, /2 de 2 ingredientes en casa/);
});

test('menú: lo que está de oferta sube', () => {
  const m = proponerMenu({ ...datos(), despensa: [] }, { desde: '2026-11-16', dias: 1, ofertas: new Set(['merluza']) });
  assert.equal(m[0].receta_id, 'merluza');
});
