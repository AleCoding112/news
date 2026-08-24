/* Service worker: l'app si apre anche senza rete.
   Il guscio (HTML/CSS/JS/icone) sta in cache; i pezzi e i numeri no —
   quelli si chiedono sempre prima alla rete, così una nuova edizione
   si vede appena c'è, e senza campo resta leggibile l'ultima copia. */

/* Il nome porta la versione: cambiandolo, la vecchia copia del guscio
   viene buttata via all'attivazione invece di restare a ingombrare. Va
   allineato a VERSIONE in app.js. */
const CACHE = 'news-v4';
const GUSCIO = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon-180.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(GUSCIO)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      /* Si puliscono solo le proprie versioni vecchie: le cache della
         porta /trentino/ vivono nello stesso magazzino e non vanno toccate. */
      .then(chiavi => Promise.all(chiavi.filter(k => k.startsWith('news-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const richiesta = e.request;
  if (richiesta.method !== 'GET') return;

  const url = new URL(richiesta.url);
  if (url.origin !== self.location.origin) return;

  /* Rete per prima, cache come rete di salvataggio. Vale sia per il
     guscio sia per i dati: una modifica si vede al ricaricamento, e
     senza connessione l'ultima copia è meglio di una pagina bianca. */
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
