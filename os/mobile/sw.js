// EOPUR OS Terrain – fonctionnement hors ligne : tous les fichiers de l'application sont gardés en cache
const V = 'eopur-os-terrain-1.0.0';
const F = ['./', './index.html', './commun.js', './jszip.min.js', './manifest.webmanifest', './icone-180.png', './icone-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(F)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith('eopur-os-terrain-') && x !== V).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => { if (e.request.method !== 'GET') return; e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request))); });
