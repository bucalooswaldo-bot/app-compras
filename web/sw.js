// Guarda la app en el móvil para que abra rápido y sin conexión.
// Los datos (Supabase) nunca se guardan aquí: siempre van a la red.
const VERSION = 'compras-v3';
const ARCHIVOS = ['./', 'index.html', 'estilos.css', 'config.js', 'manifest.webmanifest', 'icono.svg',
  'icono-192.png', 'icono-512.png', 'vendor/preact-htm.js', 'vendor/supabase.js',
  'src/app.js', 'src/almacen.js', 'src/logica.js', 'src/recetas-inicio.js',
  'src/comparar.js', 'src/catalogo.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la red (para recibir cambios de la app al momento); si no hay, lo guardado.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
