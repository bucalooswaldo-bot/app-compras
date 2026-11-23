import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supersDe, ponerSupers, SUPERS, SUPERS_WEB, nombreSuper, detectarSuper, claveDeNombre, clavePropia } from '../web/src/supers.js';
import { buscarEn } from '../web/src/catalogo.js';
import { tamanoDeFormato, fichaDeOpenFoodFacts } from '../web/src/foto-producto.js';

test('súper de la casa: los elegidos en su orden y luego los de los tiques', () => {
  const datos = {
    supers: [{ clave: 'carrefour', nombre: 'Carrefour', orden: 1 }, { clave: 'propio-fruteria-pepe', nombre: 'Frutería Pepe', orden: 0 }],
    tiques: [{ supermercado_id: 'dia' }, { supermercado_id: 'carrefour' }, { supermercado_id: null }],
  };
  assert.deepEqual(supersDe(datos), [['propio-fruteria-pepe', 'Frutería Pepe'], ['carrefour', 'Carrefour'], ['dia', 'Dia']]);
  ponerSupers(datos);
  assert.equal(SUPERS.length, 3);
  assert.deepEqual(SUPERS_WEB, ['propio-fruteria-pepe', 'carrefour', 'dia']);
  assert.equal(nombreSuper('propio-fruteria-pepe'), 'Frutería Pepe');
  assert.equal(nombreSuper('alcampo'), 'Alcampo');
  ponerSupers({});
  assert.equal(SUPERS.length, 0);
});

test('detectarSuper: cadenas de España y los escritos a mano', () => {
  assert.equal(detectarSuper('MERCADONA S.A.\nC/ Mayor 3'), 'mercadona');
  assert.equal(detectarSuper('LIDL SUPERMERCADOS S.A.U.'), 'lidl');
  assert.equal(detectarSuper('CENTROS COMERCIALES CARREFOUR S.A.'), 'carrefour');
  assert.equal(detectarSuper('DIA RETAIL ESPAÑA S.A.U.'), 'dia');
  assert.equal(detectarSuper('DINOSOL SUPERMERCADOS'), 'hiperdino');
  assert.equal(detectarSuper('Supermercados Ahorramás'), 'ahorramas');
  assert.equal(detectarSuper('Tienda de barrio'), null);
  assert.equal(detectarSuper('FRUTERIA PEPE - TLF 928', [['propio-fruteria-pepe', 'Frutería Pepe']]), 'propio-fruteria-pepe');
  // "dia" suelto (de "mediodía", "día 3") no es Dia
  assert.equal(detectarSuper('Abierto todo el dia 3'), null);
});

test('claveDeNombre: cadena conocida o clave propia', () => {
  assert.equal(claveDeNombre('carrefour'), 'carrefour');
  assert.equal(claveDeNombre('El Corte Inglés'), 'elcorteingles');
  assert.equal(claveDeNombre('Frutería Pepe'), 'propio-fruteria-pepe');
  assert.equal(clavePropia('  ¡¡ !! '), 'propio-super');
});

test('buscarEn: lo comprado que encaja, primero lo que lleva todas las palabras', () => {
  const lista = [
    { id: 1, nombre: 'LECHE ENTERA HACENDADO', precio: 0.96 },
    { id: 2, nombre: 'LECHE DESNATADA', precio: 0.9 },
    { id: 3, nombre: 'PAN DE MOLDE', precio: 1.2 },
    { id: 4, nombre: 'LECHE ENTERA SIN LACTOSA', precio: null },
  ];
  assert.deepEqual(buscarEn(lista, 'leche entera').map((p) => p.id), [1, 2]);
  assert.deepEqual(buscarEn(lista, 'tomates'), []);
  assert.deepEqual(buscarEn(lista, ''), []);
});

test('Open Food Facts: tamaño del envase y ficha', () => {
  assert.deepEqual(tamanoDeFormato('500 g'), { cantidad: 500, unidad: 'g' });
  assert.deepEqual(tamanoDeFormato('1,5 kg'), { cantidad: 1500, unidad: 'g' });
  assert.deepEqual(tamanoDeFormato('33 cl'), { cantidad: 330, unidad: 'ml' });
  assert.deepEqual(tamanoDeFormato('1 L'), { cantidad: 1000, unidad: 'ml' });
  assert.equal(tamanoDeFormato('6 x'), null);
  const f = fichaDeOpenFoodFacts({ product_name_es: 'Tomate triturado', brands: 'Orlando, Heinz', quantity: '400 g', categories_tags: ['en:canned-foods'] });
  assert.equal(f.nombre, 'Tomate triturado');
  assert.equal(f.marca, 'Orlando');
  assert.equal(f.cantidad, 400);
  assert.equal(fichaDeOpenFoodFacts({}), null);
});
