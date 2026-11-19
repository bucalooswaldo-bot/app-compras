// Guía de alimentos para la despensa: lo que se suele tener en una casa (cocina española y canaria),
// agrupado por secciones para ir marcando lo que hay. Sirve igual a todas las casas: no se guarda nada
// hasta que se marca un alimento y se toca «Añadir a la despensa».
//
// Cada alimento: [nombre, unidad, cantidad típica de un paquete]. La unidad es la base de la app
// (g, ml o ud). Si la casa ya tiene un artículo con ese nombre, se usa el suyo (con su unidad).

import { normalizar } from './logica.js';

const ud = (n) => [n, 'ud', 1];
const g = (n, c) => [n, 'g', c];
const ml = (n, c) => [n, 'ml', c];

export const GUIA = [
  {
    id: 'verduras', titulo: 'Verduras y hortalizas', emoji: '🥕', categoria: 'Frutas y verduras',
    alimentos: [
      g('Papas', 2000), g('Batata', 1000), ud('Cebolla'), ud('Ajo'), ud('Zanahoria'), ud('Tomate'), g('Tomates cherry', 250),
      ud('Pimiento verde'), ud('Pimiento rojo'), ud('Calabacín'), ud('Berenjena'), g('Calabaza', 500), ud('Puerro'),
      ud('Lechuga'), ud('Pepino'), g('Espinacas', 300), g('Berros', 300), g('Judías verdes', 500), g('Champiñones', 250),
      ud('Brócoli'), ud('Coliflor'), ud('Col'), ud('Aguacate'), ud('Cebolleta'), ud('Apio'), ud('Millo (mazorca)'),
      ud('Perejil'), ud('Cilantro'),
    ],
  },
  {
    id: 'frutas', titulo: 'Frutas', emoji: '🍎', categoria: 'Frutas y verduras',
    alimentos: [
      ud('Plátano'), ud('Manzana'), ud('Pera'), ud('Naranja'), ud('Mandarina'), ud('Limón'), g('Fresas', 500),
      ud('Uvas'), ud('Melón'), ud('Sandía'), ud('Piña'), ud('Papaya'), ud('Mango'), ud('Kiwi'), ud('Melocotón'),
      g('Arándanos', 125),
    ],
  },
  {
    id: 'lacteos', titulo: 'Lácteos y huevos', emoji: '🥛', categoria: 'Lácteos y huevos',
    alimentos: [
      ml('Leche', 1000), ud('Huevos'), g('Mantequilla', 250), ml('Nata para cocinar', 200), ud('Yogur natural'),
      ud('Yogur griego'), g('Queso fresco', 250), g('Queso rallado', 200), ud('Queso tierno'), ud('Queso curado'),
      g('Queso crema', 200), ud('Bebida vegetal'), ud('Leche evaporada'), ud('Leche condensada'),
    ],
  },
  {
    id: 'carnes', titulo: 'Carnes', emoji: '🥩', categoria: 'Carne',
    alimentos: [
      g('Pechuga de pollo', 500), g('Muslos de pollo', 1000), g('Pollo', 1500), g('Carne picada', 500),
      g('Ternera para guisar', 500), g('Filetes de ternera', 500), g('Carne de cerdo para guisar', 500),
      g('Costillas de cerdo', 1000), g('Lomo de cerdo', 500), g('Solomillo de cerdo', 500), g('Pavo', 500),
      ud('Salchichas'), ud('Hamburguesas'), g('Conejo', 1000),
    ],
  },
  {
    id: 'pescados', titulo: 'Pescados y mariscos', emoji: '🐟', categoria: 'Pescado',
    alimentos: [
      g('Merluza', 500), g('Salmón', 500), g('Bacalao', 500), g('Atún fresco', 400), g('Cherne', 500),
      g('Sama', 500), g('Pescado salado (cherne)', 500), g('Sardinas', 500), g('Calamares', 500), g('Sepia limpia', 500),
      g('Gambas peladas', 300), g('Langostinos', 500), g('Mejillones', 1000), g('Almejas', 500),
    ],
  },
  {
    id: 'charcuteria', titulo: 'Charcutería', emoji: '🥓', categoria: 'Charcutería y quesos',
    alimentos: [
      g('Jamón serrano', 150), g('Jamón cocido', 200), g('Pechuga de pavo en lonchas', 200), g('Chorizo', 200),
      g('Salchichón', 200), g('Bacon', 200), g('Jamón serrano en taquitos', 150), ud('Paté'), ud('Mortadela'),
    ],
  },
  {
    id: 'conservas', titulo: 'Conservas y botes', emoji: '🥫', categoria: 'Conservas',
    alimentos: [
      g('Atún en lata', 240), ud('Sardinas en lata'), ud('Mejillones en escabeche'), g('Tomate triturado', 400),
      ud('Tomate frito'), ud('Tomate troceado'), g('Maíz dulce', 300), g('Aceitunas', 350), ud('Garbanzos cocidos'),
      ud('Lentejas cocidas'), ud('Alubias cocidas'), ud('Pimiento morrón'), ud('Espárragos blancos'), ud('Guisantes en bote'),
      ud('Champiñones laminados en lata'), ud('Fruta en almíbar'),
    ],
  },
  {
    id: 'cereales', titulo: 'Arroz, pasta, legumbres y harinas', emoji: '🍝', categoria: 'Despensa',
    alimentos: [
      g('Arroz', 1000), g('Arroz integral', 1000), g('Macarrones', 500), g('Espaguetis', 500), g('Fideos', 500),
      g('Pasta corta', 500), g('Lasaña', 250), g('Cuscús', 500), g('Lentejas', 1000), g('Garbanzos secos', 1000),
      g('Alubias secas', 1000), g('Harina de trigo', 1000), g('Gofio', 1000), g('Harina de maíz', 1000),
      g('Copos de avena', 500), g('Pan rallado', 500), g('Maicena', 400), g('Puré de papas', 250),
    ],
  },
  {
    id: 'aceites', titulo: 'Aceites, salsas y caldos', emoji: '🫒', categoria: 'Despensa',
    alimentos: [
      ml('Aceite de oliva', 1000), ml('Aceite de oliva virgen extra', 1000), ml('Aceite de girasol', 1000), ml('Vinagre', 1000),
      g('Mayonesa', 450), ud('Kétchup'), ud('Mostaza'), ud('Salsa de soja'), ud('Mojo rojo'), ud('Mojo verde'),
      ud('Salsa barbacoa'), ml('Caldo de pollo', 1000), ml('Caldo de verduras', 1000), ml('Caldo de pescado', 1000),
      ud('Pastillas de caldo'),
    ],
  },
  {
    id: 'especias', titulo: 'Sal y especias', emoji: '🧂', categoria: 'Despensa',
    alimentos: [
      g('Sal', 1000), g('Sal gruesa', 1000), g('Pimienta negra', 50), g('Pimentón', 75), g('Pimentón picante', 75),
      g('Comino', 50), g('Orégano', 20), ud('Laurel'), g('Tomillo', 20), g('Romero', 20), g('Perejil seco', 20),
      g('Ajo en polvo', 50), g('Canela', 50), g('Nuez moscada', 30), g('Curry', 50), g('Cúrcuma', 50),
      g('Azafrán o colorante', 10), ud('Guindilla'),
    ],
  },
  {
    id: 'desayuno', titulo: 'Pan y desayuno', emoji: '🍞', categoria: 'Panadería',
    alimentos: [
      ud('Pan'), ud('Pan de molde'), ud('Pan tostado'), ud('Tortillas de trigo'), ud('Galletas'), ud('Cereales'),
      ud('Magdalenas'), ud('Mermelada'), ud('Crema de cacao'), ud('Crema de cacahuete'), ud('Café'), ud('Cacao soluble'),
      ud('Té'), ud('Infusiones'),
    ],
  },
  {
    id: 'reposteria', titulo: 'Repostería y dulces', emoji: '🧁', categoria: 'Despensa',
    alimentos: [
      g('Azúcar', 1000), g('Azúcar moreno', 1000), ud('Edulcorante'), ud('Miel'), ud('Levadura química'),
      ud('Levadura de panadería'), ud('Chocolate para postres'), g('Cacao en polvo', 250), ud('Esencia de vainilla'),
      ud('Gelatina'), ud('Flan en polvo'), g('Almendras', 200), g('Nueces', 200), g('Pasas', 200),
    ],
  },
  {
    id: 'congelados', titulo: 'Congelados', emoji: '🧊', categoria: 'Congelados',
    alimentos: [
      g('Guisantes congelados', 1000), g('Judías verdes congeladas', 1000), g('Menestra', 1000), g('Espinacas congeladas', 1000),
      g('Brócoli congelado', 1000), g('Papas fritas congeladas', 1000), g('Merluza congelada', 1000), g('Calamares congelados', 500),
      g('Gambas congeladas', 500), ud('Varitas de pescado'), ud('Croquetas'), ud('Empanadillas'), ud('Pizza congelada'),
      ud('Helado'), ud('Hielo'),
    ],
  },
  {
    id: 'snacks', titulo: 'Picoteo y aperitivos', emoji: '🥨', categoria: 'Despensa',
    alimentos: [
      ud('Papas fritas de bolsa'), ud('Frutos secos'), ud('Cacahuetes'), ud('Palomitas'), ud('Altramuces'),
      ud('Picos de pan'), ud('Nachos'), ud('Galletas saladas'), ud('Chocolate'), ud('Gominolas'),
    ],
  },
  {
    id: 'bebidas', titulo: 'Bebidas', emoji: '🧃', categoria: 'Bebidas',
    alimentos: [
      ud('Agua'), ud('Agua con gas'), ud('Zumo'), ud('Refrescos'), ud('Batidos'), ud('Cerveza'), ud('Cerveza sin alcohol'),
      ml('Vino tinto', 750), ml('Vino blanco', 750), ud('Bebida isotónica'),
    ],
  },
  {
    id: 'limpieza', titulo: 'Limpieza y aseo', emoji: '🧴', categoria: 'Droguería',
    alimentos: [
      ud('Papel higiénico'), ud('Papel de cocina'), ud('Lavavajillas'), ud('Detergente'), ud('Suavizante'), ud('Lejía'),
      ud('Friegasuelos'), ud('Bolsas de basura'), ud('Papel de aluminio'), ud('Film transparente'), ud('Estropajos'),
      ud('Gel de ducha'), ud('Champú'), ud('Pasta de dientes'),
    ],
  },
];

/** Ejemplos cortos de una sección para el índice ("Papas, cebolla, ajo…"). */
export const ejemplosDe = (seccion, n = 5) => `${seccion.alimentos.slice(0, n).map(([x]) => x).join(', ')}…`;

/**
 * Los alimentos de la guía con lo que la casa ya tiene:
 * articulo (si ya existe con ese nombre) y cantidad en la despensa (null = no está).
 */
export function alimentosConCasa(seccion, datos) {
  const porNombre = new Map(datos.articulos.map((a) => [normalizar(a.nombre), a]));
  const enDespensa = new Map(datos.despensa.map((d) => [d.articulo_id, d]));
  return seccion.alimentos.map(([nombre, unidad, tipica]) => {
    const articulo = porNombre.get(normalizar(nombre)) ?? null;
    const fila = articulo ? enDespensa.get(articulo.id) : null;
    const u = articulo?.unidad ?? unidad;
    return {
      clave: `${seccion.id}:${nombre}`, nombre, articulo, categoria: seccion.categoria,
      unidad: u, tipica: u === unidad ? tipica : u === 'ud' ? 1 : null,
      enCasa: fila && fila.cantidad > 0 ? fila : null,
    };
  });
}

/** Busca en toda la guía (sin tildes). */
export function buscarEnGuia(texto, datos) {
  const q = normalizar(texto);
  if (q.length < 2) return [];
  return GUIA.flatMap((s) => alimentosConCasa(s, datos).map((x) => ({ ...x, seccion: s })))
    .filter((x) => normalizar(x.nombre).includes(q));
}
