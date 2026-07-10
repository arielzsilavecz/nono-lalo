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

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'il nonno Lalo', {
      body: data.body,
      icon: '/pwa-icon.png',
      tag: data.tag,
      data: { url: data.url ?? '/admin' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/admin'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes(url))
      if (existing) return existing.focus()
      return self.clients.openWindow(url)
    }),
  )
})
