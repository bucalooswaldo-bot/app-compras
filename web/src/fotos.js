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

/**
 * Zona del fotograma que se queda para la portada: 4:3 como el hueco de la ficha, sin bandas.
 * En vídeos verticales se corta arriba y abajo, un poco por encima del centro (ahí suele estar el plato).
 */
export function recortePortada(ancho, alto, proporcion = 4 / 3) {
  if (ancho / alto < proporcion) {
    const h = Math.round(ancho / proporcion);
    return { x: 0, y: Math.round((alto - h) * 0.45), w: ancho, h };
  }
  const w = Math.round(alto * proporcion);
  return { x: Math.round((ancho - w) / 2), y: 0, w, h: alto };
}

/** Dibuja el fotograma que se ve ahora en un <video>, recortado a 4:3, y lo pasa a JPEG (portada de la receta). */
export function fotoDeFotograma(video, max = 1280, calidad = 0.8) {
  const r = recortePortada(video.videoWidth, video.videoHeight);
  const escala = Math.min(1, max / Math.max(r.w, r.h));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(r.w * escala);
  lienzo.height = Math.round(r.h * escala);
  lienzo.getContext('2d').drawImage(video, r.x, r.y, r.w, r.h, 0, 0, lienzo.width, lienzo.height);
  return new Promise((ok, mal) =>
    lienzo.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo sacar la foto del vídeo'))), 'image/jpeg', calidad));
}

const esperar = (el, evento, ms = 15000) => new Promise((ok, mal) => {
  const t = setTimeout(() => mal(new Error('El vídeo tarda demasiado')), ms);
  el.addEventListener(evento, () => { clearTimeout(t); ok(); }, { once: true });
  el.addEventListener('error', () => { clearTimeout(t); mal(new Error('No se pudo abrir el vídeo')); }, { once: true });
});

/**
 * Saca una foto de un vídeo (un archivo del móvil) para usarla de portada.
 * Por defecto, a los 1,5 s: muchos vídeos de recetas enseñan el plato terminado al principio.
 */
export async function fotoDeVideo(archivo, segundo = 1.5, max = 1280, calidad = 0.8) {
  const url = URL.createObjectURL(archivo);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    const cargado = esperar(video, 'loadeddata');
    video.src = url;
    await cargado;
    const t = Math.min(segundo, Math.max(0, (video.duration || 0) / 2));
    if (t > 0) {
      const movido = esperar(video, 'seeked');
      video.currentTime = t;
      await movido;
    }
    return await fotoDeFotograma(video, max, calidad);
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
