// Guarda la app en el móvil para que abra rápido y sin conexión.
// Los datos (Supabase) nunca se guardan aquí: siempre van a la red.
const VERSION = 'compras-v47';
const ARCHIVOS = ['./', 'index.html', 'estilos.css', 'config.js', 'manifest.webmanifest', 'icono.svg', 'olla.svg',
  'icono-192.png', 'icono-512.png', 'vendor/preact-htm.js', 'vendor/supabase.js',
  'src/app.js', 'src/almacen.js', 'src/logica.js', 'src/recetas-inicio.js',
  'src/comparar.js', 'src/catalogo.js', 'src/tiques.js', 'src/menu.js', 'src/fotos.js', 'src/ingredientes.js', 'src/consumo.js', 'src/foto-producto.js',
  'src/receta-texto.js', 'src/video.js', 'src/cocina.js', 'src/ofertas.js', 'src/inicio.js', 'src/planificador.js',
  'src/avisos.js', 'src/apariencia.js', 'src/notificaciones.js', 'src/atras.js',
  'src/recetario.js', 'src/recetario-vista.js', 'recetario.json'];
// El lector de tiques (vendor/ocr, unos 10 MB) y el compresor de vídeo (vendor/mediabunny) no se guardan al
// instalar: se guardan la primera vez que se usan.

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS.map((a) => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
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
    // no-cache: pregunta siempre si hay versión nueva (si no la hay, la respuesta es mínima)
    fetch(e.request, { cache: 'no-cache' })
      .then((r) => { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});

// Avisos en el móvil: llegan de la función "avisos" de Supabase aunque la app esté cerrada.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data?.json() ?? {}; } catch { d = { cuerpo: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Menuda', {
    body: d.cuerpo || '', icon: 'icono-192.png', badge: 'icono-192.png', tag: 'aviso-diario', renotify: true,
    data: { pestana: d.pestana || 'inicio' },
  }));
});

// Al tocar el aviso: abre la app (o la trae delante) en Inicio.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(`./?pestana=${e.notification.data?.pestana || 'inicio'}`, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
    const v = ventanas.find((w) => w.url.startsWith(self.registration.scope));
    return v ? v.navigate(url).then((w) => (w ?? v).focus()) : self.clients.openWindow(url);
  }));
});
