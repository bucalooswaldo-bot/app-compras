// Fotos de las recetas: se reducen en el móvil antes de guardarlas (rápido y sin gastar espacio).

/** Reduce una foto a `max` píxeles por el lado largo y la pasa a JPEG. */
export async function reducirFoto(archivo, max = 1280, calidad = 0.8) {
  let imagen;
  try {
    imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch {
    imagen = await new Promise((ok, mal) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => mal(new Error('No se pudo leer la foto'));
      img.src = URL.createObjectURL(archivo);
    });
  }
  const escala = Math.min(1, max / Math.max(imagen.width, imagen.height));
  const ancho = Math.round(imagen.width * escala);
  const alto = Math.round(imagen.height * escala);
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext('2d').drawImage(imagen, 0, 0, ancho, alto);
  imagen.close?.();
  return new Promise((ok, mal) =>
    lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo preparar la foto'))), 'image/jpeg', calidad));
}

export function blobADataUrl(blob) {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(lector.result);
    lector.onerror = () => mal(lector.error);
    lector.readAsDataURL(blob);
  });
}

// Dibujo para las recetas sin foto, según sus etiquetas o su nombre.
const DIBUJOS = [
  [/pescado|merluza|salm[oó]n|sancocho|at[uú]n/i, '🐟'],
  [/pollo|pechuga|fajita/i, '🍗'],
  [/carne|alb[oó]ndiga|cerdo|costilla/i, '🥩'],
  [/pasta|macarr|espagu|carbonara/i, '🍝'],
  [/arroz/i, '🍚'],
  [/huevo|tortilla|revuelto/i, '🍳'],
  [/cuchara|legumbre|lenteja|garbanzo|potaje|crema/i, '🍲'],
  [/verdura|ensalada|ligera/i, '🥗'],
];

export function dibujoReceta(receta) {
  const texto = [receta.nombre, ...(receta.etiquetas ?? [])].join(' ');
  for (const [re, emoji] of DIBUJOS) if (re.test(texto)) return emoji;
  return '🍽️';
}
