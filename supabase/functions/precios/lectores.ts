// Lectores de cada súper. Sin dependencias, para poder probarlos fuera de Supabase.
// Si un súper cambia su web, se arregla su bloque aquí y el resto sigue igual.

const MERCADONA_WH = (globalThis as any).Deno?.env.get('MERCADONA_WH') ?? '4701';
const HIPERDINO = 'https://www.hiperdino.es/c9504';
const NAVEGADOR =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const PAUSA_MS = 700;

// ---------------------------------------------------------------------------
// Red: una consulta cada vez, con pausa; un 403 o 429 significa "para".
// ---------------------------------------------------------------------------
export class Rechazo extends Error {}
let ultima = 0;

async function pedir(url: string, init: RequestInit = {}): Promise<Response> {
  const falta = ultima + PAUSA_MS - Date.now();
  if (falta > 0) await new Promise((r) => setTimeout(r, falta));
  ultima = Date.now();
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': NAVEGADOR, 'Accept-Language': 'es-ES,es;q=0.9', ...(init.headers ?? {}) },
  });
  if (res.status === 403 || res.status === 429) throw new Rechazo(`${new URL(url).host} respondió ${res.status}`);
  return res;
}

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------
export type Unidad = 'g' | 'ml' | 'ud';
const FACTORES: Record<string, [Unidad, number]> = {
  kg: ['g', 1000], g: ['g', 1], gr: ['g', 1], grs: ['g', 1], mg: ['g', 0.001],
  l: ['ml', 1000], lt: ['ml', 1000], litro: ['ml', 1000], litros: ['ml', 1000], cl: ['ml', 10], ml: ['ml', 1],
  ud: ['ud', 1], uds: ['ud', 1], u: ['ud', 1], unidad: ['ud', 1], unidades: ['ud', 1], docena: ['ud', 12],
};
export const red = (n: number, d = 2) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;
const num = (s: unknown) => Number(String(s).replace(',', '.'));

function aBase(cantidad: unknown, unidad: unknown) {
  const f = FACTORES[String(unidad ?? '').toLowerCase().replace(/\.$/, '')];
  if (!f || !Number.isFinite(num(cantidad))) return null;
  return { cantidad: red(num(cantidad) * f[1], 3), unidad: f[0] };
}

export function tamanoDesdeNombre(nombre: string) {
  const texto = nombre.toLowerCase().replace(/\u00a0/g, ' ');
  const re = /(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|grs?|g|mg|litros?|lt|l|cl|ml|uds?|u|unidades|unidad|docena)\b\.?/g;
  let ultimo: { cantidad: number; unidad: Unidad } | null = null;
  for (const m of texto.matchAll(re)) {
    const base = aBase(m[2], m[3]);
    if (!base) continue;
    ultimo = { cantidad: red(base.cantidad * (m[1] ? Number(m[1]) : 1), 3), unidad: base.unidad };
  }
  return ultimo;
}

export function porUnidad(precio: number, cantidad: number | null, unidad: Unidad | null) {
  if (!cantidad || !unidad || !Number.isFinite(precio)) return null;
  return red(unidad === 'ud' ? precio / cantidad : (precio / cantidad) * 1000, 4);
}

export function leerPrecio(texto: unknown) {
  if (texto == null) return null;
  let s = String(texto).replace(/[^\d.,]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type Producto = {
  supermercado_id: 'mercadona' | 'hiperdino';
  id_externo: string;
  nombre: string;
  marca: string | null;
  formato: string | null;
  cantidad: number | null;
  unidad: Unidad | null;
  ean: string | null;
  imagen_url: string | null;
  url: string | null;
  precio: number;
  precio_anterior: number | null;
};

// ---------------------------------------------------------------------------
// Mercadona: su buscador (Algolia, el mismo que usa su web) y la ficha de producto.
// ---------------------------------------------------------------------------
const ALGOLIA = 'https://7uzjkl1dj0-dsn.algolia.net/1/indexes';
const ALGOLIA_CABECERAS = {
  'x-algolia-application-id': '7UZJKL1DJ0',
  'x-algolia-api-key': '9d8f2e39e90df472b4f2e559a116fe17',
  'Content-Type': 'application/json',
};

// deno-lint-ignore no-explicit-any
export function deMercadona(p: any): Producto | null {
  const pi = p.price_instructions ?? {};
  const precio = Number(pi.unit_price);
  if (!p.id || !p.display_name || !Number.isFinite(precio)) return null;
  const anterior = pi.previous_unit_price ? Number(String(pi.previous_unit_price).trim()) : null;
  const base = pi.unit_size != null && pi.size_format ? aBase(pi.unit_size, pi.size_format) : null;
  return {
    supermercado_id: 'mercadona',
    id_externo: String(p.id),
    nombre: p.display_name,
    marca: p.brand ?? p.details?.brand ?? null,
    formato: [p.packaging, pi.unit_size != null ? `${String(pi.unit_size).replace('.', ',')} ${pi.size_format ?? ''}`.trim() : null]
      .filter(Boolean).join(' ') || null,
    cantidad: base?.cantidad ?? null,
    unidad: base?.unidad ?? null,
    ean: p.ean ?? null,
    imagen_url: p.thumbnail ?? p.photos?.[0]?.thumbnail ?? null,
    url: p.share_url ?? `https://tienda.mercadona.es/product/${p.id}`,
    precio,
    precio_anterior: anterior && anterior > precio ? anterior : null,
  };
}

export async function buscarMercadona(texto: string): Promise<Producto[]> {
  const res = await pedir(`${ALGOLIA}/products_prod_${MERCADONA_WH}_es/query`, {
    method: 'POST',
    headers: ALGOLIA_CABECERAS,
    body: JSON.stringify({ params: `query=${encodeURIComponent(texto)}&hitsPerPage=12` }),
  });
  if (!res.ok) throw new Error(`Mercadona (buscador) respondió ${res.status}`);
  const datos = await res.json();
  // deno-lint-ignore no-explicit-any
  return (datos.hits ?? []).filter((h: any) => h.published !== false).map(deMercadona).filter(Boolean);
}

export async function fichaMercadona(idExterno: string): Promise<Producto | 'no_existe'> {
  const res = await pedir(`https://tienda.mercadona.es/api/products/${encodeURIComponent(idExterno)}/?lang=es&wh=${MERCADONA_WH}`);
  if (res.status === 404 || res.status === 410) return 'no_existe';
  if (!res.ok) throw new Error(`Mercadona respondió ${res.status}`);
  const p = deMercadona(await res.json());
  if (!p) throw new Error('Mercadona: ficha sin precio');
  return p;
}

// ---------------------------------------------------------------------------
// HiperDino: el desplegable de su buscador (HTML) y la ficha de producto.
// ---------------------------------------------------------------------------
const textoHtml = (s: string) =>
  s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

/** La marca es lo que va delante en mayúscula: "Central Lechera Asturiana leche entera 1 l". */
export function marcaDesdeNombre(nombre: string) {
  const marca: string[] = [];
  for (const w of nombre.split(/\s+/)) {
    if (/^[A-ZÁÉÍÓÚÑÜ0-9]/.test(w)) marca.push(w);
    else break;
  }
  return marca.length && marca.length < nombre.split(/\s+/).length ? marca.join(' ') : null;
}

/** "https://www.hiperdino.es/c9504/hiperdino-leche-entera-1-lt.html" -> "/hiperdino-leche-entera-1-lt.html" */
const idHiperDino = (url: string) => new URL(url).pathname.replace(/^\/c\d+/, '');

function deHiperDino(nombre: string, url: string, imagen: string | null, precio: number | null, anterior: number | null): Producto | null {
  if (!nombre || !url || precio == null) return null;
  // La fruta, la carne y el pescado "al peso" o "kg" llevan el precio del kilo.
  const tam = tamanoDesdeNombre(nombre) ?? (/\b(kg|al peso)\s*$/i.test(nombre) ? { cantidad: 1000, unidad: 'g' as Unidad } : null);
  return {
    supermercado_id: 'hiperdino',
    id_externo: idHiperDino(url),
    nombre,
    marca: marcaDesdeNombre(nombre),
    formato: tam ? `${tam.cantidad} ${tam.unidad}` : null,
    cantidad: tam?.cantidad ?? null,
    unidad: tam?.unidad ?? null,
    ean: null,
    imagen_url: imagen,
    url,
    precio,
    precio_anterior: anterior && anterior > precio ? anterior : null,
  };
}

export function leerBuscadorHiperDino(html: string): Producto[] {
  const salida: Producto[] = [];
  for (const trozo of html.split('search-autocomplete-result"').slice(1)) {
    const enlace = trozo.match(/<a class="search-autocomplete-product"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const img = trozo.match(/<img class="search-autocomplete-image"\s+src="([^"]+)"/);
    const precios = [...trozo.matchAll(/search-autocomplete-price[^"]*"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => leerPrecio(textoHtml(m[1])));
    const p = deHiperDino(textoHtml(enlace?.[2] ?? ''), enlace?.[1] ?? '', img?.[1] ?? null,
      precios.length ? Math.min(...precios.filter((x): x is number => x != null)) : null,
      precios.length > 1 ? Math.max(...precios.filter((x): x is number => x != null)) : null);
    if (p) salida.push(p);
  }
  return salida;
}

export async function buscarHiperDino(texto: string): Promise<Producto[]> {
  const res = await pedir(`${HIPERDINO}/hiperdino_searchdoofinder/autocomplete/index/?q=${encodeURIComponent(texto)}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!res.ok) throw new Error(`HiperDino (buscador) respondió ${res.status}`);
  return leerBuscadorHiperDino(await res.text());
}

export async function fichaHiperDino(idExterno: string, url: string | null, actual: { nombre: string; imagen_url: string | null }): Promise<Producto | 'no_existe'> {
  const res = await pedir(url ?? `${HIPERDINO}${idExterno}`);
  if (res.status === 404 || res.status === 410) return 'no_existe';
  if (!res.ok) throw new Error(`HiperDino respondió ${res.status}`);
  const html = await res.text();
  const datos = html.match(/var productData = (\{[^;]*\});/);
  // deno-lint-ignore no-explicit-any
  let pd: any = null;
  try { pd = datos ? JSON.parse(datos[1]) : null; } catch { /* nada */ }
  const precio = pd?.price != null ? Number(pd.price) : leerPrecio(html.match(/product:price:amount" content="([^"]+)"/)?.[1]);
  if (precio == null || !Number.isFinite(precio)) throw new Error('HiperDino: ficha sin precio');
  const descuento = Number(pd?.discount ?? 0);
  const p = deHiperDino(pd?.item_name ?? actual.nombre, url ?? `${HIPERDINO}${idExterno}`, actual.imagen_url, precio,
    descuento > 0 ? red(precio + descuento) : null);
  return p ?? 'no_existe';
}

