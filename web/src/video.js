// Vídeos de las recetas (bajados de Instagram, TikTok…): se comprimen en el propio móvil antes de
// guardarlos, para que quepan muchos en el espacio gratis de Supabase (1 GB).
// Se usa mediabunny (vendor/mediabunny), que se carga solo la primera vez que se añade un vídeo.

const LIBRERIA = new URL('../vendor/mediabunny/mediabunny.min.mjs', import.meta.url).href;

/** Tamaño máximo de un vídeo guardado (límite por archivo del plan gratis de Supabase). */
export const MAX_VIDEO = 50 * 1024 * 1024;
const LADO_CORTO = 540;          // 540 × 960 en vídeos verticales: se ve bien en el móvil
const BITRATE_VIDEO = 1_000_000; // ~7,5 MB por minuto con el sonido
const BITRATE_AUDIO = 64_000;

export const megas = (bytes) => `${(bytes / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;

/** Tamaño de salida: el lado corto a 540 como mucho, en números pares (lo piden los codificadores). */
export function tamanoSalida(ancho, alto, ladoCorto = LADO_CORTO) {
  const escala = Math.min(1, ladoCorto / Math.min(ancho, alto));
  const par = (n) => Math.max(2, Math.round((n * escala) / 2) * 2);
  return { width: par(ancho), height: par(alto) };
}

/**
 * Comprime un vídeo en el móvil. Devuelve { blob, comprimido }.
 * Si el móvil no sabe comprimirlo, devuelve el original (si cabe) con comprimido = false.
 */
export async function prepararVideo(archivo, onProgreso) {
  let blob = null;
  try {
    if (typeof VideoEncoder === 'undefined') throw new Error('Este navegador no comprime vídeo');
    blob = await comprimir(archivo, onProgreso);
  } catch (e) {
    console.warn('No se pudo comprimir el vídeo', e);
  }
  // Si ya venía pequeño, el original puede ser igual o mejor
  if (blob && !(blob.size >= archivo.size * 0.9 && /mp4|webm/.test(archivo.type))) return { blob, comprimido: true };
  if (archivo.size <= MAX_VIDEO) return { blob: archivo, comprimido: false };
  throw new Error(blob
    ? `El vídeo ocupa ${megas(blob.size)} y el máximo es ${megas(MAX_VIDEO)}. Prueba con uno más corto.`
    : `Este móvil no ha podido comprimir el vídeo y ocupa ${megas(archivo.size)} (máximo ${megas(MAX_VIDEO)}).`);
}

async function comprimir(archivo, onProgreso) {
  const mb = await import(LIBRERIA);
  const input = new mb.Input({ source: new mb.BlobSource(archivo), formats: mb.ALL_FORMATS });
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
  // H.264 y AAC si el móvil los tiene (se ven en todas partes); si no, lo que sepa hacer.
  const videoCodec = (await mb.getEncodableVideoCodecs(['avc', 'vp9', 'av1']))[0];
  const audioCodec = (await mb.getEncodableAudioCodecs(['aac', 'opus']))[0];
  if (!videoCodec) throw new Error('Sin codificador de vídeo');
  const conversion = await mb.Conversion.init({
    input, output, tracks: 'primary', showWarnings: false,
    video: (pista) => ({
      ...tamanoSalida(pista.displayWidth, pista.displayHeight), fit: 'contain',
      codec: videoCodec, bitrate: BITRATE_VIDEO,
    }),
    audio: audioCodec ? { codec: audioCodec, bitrate: BITRATE_AUDIO } : { discard: true },
  });
  if (!conversion.isValid) throw new Error(`No se puede convertir: ${conversion.discardedTracks.map((d) => d.reason).join(', ')}`);
  conversion.onProgress = (p) => onProgreso?.(Math.round(p * 100));
  await conversion.execute();
  return new Blob([output.target.buffer], { type: 'video/mp4' });
}
