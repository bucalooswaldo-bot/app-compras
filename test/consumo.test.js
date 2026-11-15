import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entenderConsumo } from '../web/src/consumo.js';

const datos = () => ({
  articulos: [
    { id: 'mf', nombre: 'Mermelada de fresa', unidad: 'ud' },
    { id: 'mm', nombre: 'Mermelada de melocotón', unidad: 'ud' },
    { id: 'tt', nombre: 'Tomate triturado', unidad: 'g' },
    { id: 'to', nombre: 'Tomate', unidad: 'ud' },
    { id: 'es', nombre: 'Espárragos trigueros', unidad: 'ud' },
    { id: 'pa', nombre: 'Papas', unidad: 'g' },
    { id: 'mu', nombre: 'Papas Munchitos', unidad: 'ud' },
    { id: 'le', nombre: 'Leche', unidad: 'ml' },
  ],
  despensa: [
    { articulo_id: 'mf', cantidad: 2 }, { articulo_id: 'tt', cantidad: 800 }, { articulo_id: 'mu', cantidad: 3 },
    { articulo_id: 'le', cantidad: 3000 },
  ],
});

test('reconoce lo dicho y cuánto restar', () => {
  const r = entenderConsumo('He gastado un bote de mermelada de fresa, bote de tomate triturado y una bolsa de papas munchitos, 2 litros de leche', datos());
  assert.deepEqual(r.map((x) => [x.articulo?.id ?? null, x.cantidad]), [['mf', 1], ['tt', 100], ['mu', 1], ['le', 2000]]);
});

test('lo que no está claro se pregunta, con sugerencias', () => {
  const [esp, merm] = entenderConsumo('bote de espárragos pequeños; mermelada', datos());
  assert.equal(esp.articulo, null);
  assert.equal(esp.sugerencias[0].id, 'es');
  assert.equal(merm.articulo, null, 'hay dos mermeladas');
  assert.deepEqual(merm.sugerencias.map((a) => a.id).sort(), ['mf', 'mm']);
});

test('cantidades pegadas y números', () => {
  const [a, b] = entenderConsumo('200g tomate triturado, tres tomates', datos());
  assert.equal(a.articulo.id, 'tt'); assert.equal(a.cantidad, 200);
  assert.equal(b.articulo.id, 'to'); assert.equal(b.cantidad, 3);
});
