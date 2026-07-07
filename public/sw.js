// Service worker mínimo — solo habilita la instalación como PWA.
// No cachea nada a propósito: menús, stock y precios cambian en vivo,
// y servir contenido viejo desde caché rompería el encargo del cliente.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Sin event.respondWith(): cada request sigue directo a la red, como si no hubiera SW.
})
