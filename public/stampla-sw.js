self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || 'https://login.medvind.visma.com/MedvindSSO/Login/?wtrealm=https%3a%2f%2fsvenskakyrkan.medvind.visma.com%2fMvWeb%2f&tenantId=SVENSKAKYRKAN2'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.focus()
          return
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
