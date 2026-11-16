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

// ---------------------------------------------------------------------------
// Portada sacada de la captura de una receta: se busca la foto del plato (la zona grande con color y
// detalle que no es texto) y se recorta a 4:3.
// ---------------------------------------------------------------------------

/**
 * La zona de foto más grande en una rejilla de casillas (true = parece foto).
 * @returns {{ x0, y0, x1, y1, cx, cy, n } | null} en casillas (x1/y1 incluidas), con el centro de masas.
 */
export function mayorZona(rejilla, cols, filas) {
  const visto = new Uint8Array(cols * filas);
  let mejor = null;
  for (let i = 0; i < cols * filas; i++) {
    if (!rejilla[i] || visto[i]) continue;
    const pila = [i];
    visto[i] = 1;
    const z = { x0: cols, y0: filas, x1: 0, y1: 0, sx: 0, sy: 0, n: 0 };
    while (pila.length) {
      const k = pila.pop();
      const x = k % cols, y = Math.floor(k / cols);
      z.x0 = Math.min(z.x0, x); z.x1 = Math.max(z.x1, x); z.y0 = Math.min(z.y0, y); z.y1 = Math.max(z.y1, y);
      z.sx += x; z.sy += y; z.n++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= filas) continue;
        const j = ny * cols + nx;
        if (rejilla[j] && !visto[j]) { visto[j] = 1; pila.push(j); }
      }
    }
    if (!mejor || z.n > mejor.n) mejor = z;
  }
  return mejor && { x0: mejor.x0, y0: mejor.y0, x1: mejor.x1, y1: mejor.y1, cx: mejor.sx / mejor.n, cy: mejor.sy / mejor.n, n: mejor.n };
}

/** El mayor 4:3 que cabe en la caja, centrado lo más posible en (cx, cy). */
export function recorteEnCaja(caja, cx, cy, proporcion = 4 / 3) {
  let w = caja.w, h = Math.round(w / proporcion);
  if (h > caja.h) { h = caja.h; w = Math.round(h * proporcion); }
  const x = Math.round(Math.min(Math.max(cx - w / 2, caja.x), caja.x + caja.w - w));
  const y = Math.round(Math.min(Math.max(cy - h / 2, caja.y), caja.y + caja.h - h));
  return { x, y, w, h };
}

/**
 * Busca la foto del plato en una captura y la devuelve recortada a 4:3 (JPEG), o null si no hay.
 * @param {ImageBitmap} bmp
 * @param {Array<{x0,y0,x1,y1}>} cajasTexto zonas con texto, en píxeles de `anchoTexto`
 */
export async function portadaDeCaptura(bmp, cajasTexto = [], anchoTexto = bmp.width, max = 1280, calidad = 0.8) {
  const CASILLA = 12;
  const ancho = 240, alto = Math.round((bmp.height * ancho) / bmp.width);
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho; lienzo.height = alto;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, ancho, alto);
  const { data } = ctx.getImageData(0, 0, ancho, alto);
  const cols = Math.floor(ancho / CASILLA), filas = Math.floor(alto / CASILLA);
  const rejilla = new Array(cols * filas).fill(false);
  const e = ancho / anchoTexto;
  const conTexto = (x, y) => cajasTexto.some((c) => x * CASILLA + CASILLA > c.x0 * e && x * CASILLA < c.x1 * e
    && y * CASILLA + CASILLA > c.y0 * e && y * CASILLA < c.y1 * e);
  for (let fy = 0; fy < filas; fy++) {
    for (let fx = 0; fx < cols; fx++) {
      let s = 0, s2 = 0, sat = 0, n = 0;
      for (let y = fy * CASILLA; y < (fy + 1) * CASILLA; y += 2) {
        for (let x = fx * CASILLA; x < (fx + 1) * CASILLA; x += 2) {
          const i = (y * ancho + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const l = 0.3 * r + 0.59 * g + 0.11 * b;
          s += l; s2 += l * l; sat += Math.max(r, g, b) - Math.min(r, g, b); n++;
        }
      }
      const media = s / n, varianza = s2 / n - media * media, saturacion = sat / n;
      // Foto: con detalle (no un fondo liso) y con color o tonos medios (no texto negro sobre blanco)
      rejilla[fy * cols + fx] = varianza > 150 && saturacion > 40 && !conTexto(fx, fy);
    }
  }
  // Se quitan las casillas sueltas o en hilera (letras de colores, iconos pequeños): una casilla de foto
  // tiene al menos 3 vecinas que también lo son
  const vecinas = (i) => { const x = i % cols, y = Math.floor(i / cols); let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < cols && ny < filas && rejilla[ny * cols + nx]) n++; } return n; };
  const limpia = rejilla.map((v, i) => v && vecinas(i) >= 3);
  const z = mayorZona(limpia, cols, filas);
  if (!z || z.n < cols * filas * 0.06) return null;
  const k = (CASILLA * bmp.width) / ancho;   // casilla -> píxeles de la captura
  const caja = { x: z.x0 * k, y: z.y0 * k, w: (z.x1 - z.x0 + 1) * k, h: (z.y1 - z.y0 + 1) * k };
  if (caja.w < bmp.width * 0.3) return null;
  const r = recorteEnCaja(caja, (z.cx + 0.5) * k, (z.cy + 0.5) * k);
  const escala = Math.min(1, max / r.w);
  const salida = document.createElement('canvas');
  salida.width = Math.round(r.w * escala); salida.height = Math.round(r.h * escala);
  salida.getContext('2d').drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, salida.width, salida.height);
  return new Promise((ok) => salida.toBlob((b) => ok(b), 'image/jpeg', calidad));
}
