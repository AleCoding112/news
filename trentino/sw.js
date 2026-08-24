/* Service worker della porta Trentino: l'app si apre anche senza rete.
   Gemello di ../sw.js, con la propria cache e il guscio preso dalla
   cartella madre dove serve. Va tenuto allineato a mano quando cambia
   l'originale. */

const CACHE = 'trentino-v1';
const GUSCIO = [
  './',
  './index.html',
  '../styles.css',
  '../app.js',
  './manifest.webmanifest',
  '../icons/icon-192.png',
  '../icons/icon-512.png',
  '../icons/apple-touch-icon-180.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(GUSCIO)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      /* Si puliscono solo le proprie versioni vecchie: le cache della
         porta principale vivono nello stesso magazzino e non vanno toccate. */
      .then(chiavi => Promise.all(chiavi.filter(k => k.startsWith('trentino-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const richiesta = e.request;
  if (richiesta.method !== 'GET') return;

  const url = new URL(richiesta.url);
  if (url.origin !== self.location.origin) return;

  /* Rete per prima, cache come rete di salvataggio. */
  e.respondWith(
    fetch(richiesta)
      .then(risposta => {
        if (risposta.ok) {
          const copia = risposta.clone();
          caches.open(CACHE).then(c => c.put(richiesta, copia));
        }
        return risposta;
      })
      .catch(() => caches.match(richiesta).then(c => c || caches.match('./index.html')))
  );
});
