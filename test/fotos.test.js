import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recortePortada } from '../web/src/fotos.js';

test('la portada de un vídeo vertical se recorta a 4:3, algo por encima del centro', () => {
  assert.deepEqual(recortePortada(540, 960), { x: 0, y: 250, w: 540, h: 405 });
});
test('un vídeo apaisado se recorta por los lados', () => {
  assert.deepEqual(recortePortada(1920, 1080), { x: 240, y: 0, w: 1440, h: 1080 });
});
