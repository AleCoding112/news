/* Genera le icone PNG senza dipendenze esterne.
   Il segno è la tesi del progetto: quattro righe di testo, una sola
   accesa. Da tutto quello che si scrive, poco merita di essere letto.

   Uso:  node tools/icone.mjs                                        */

import { deflateSync } from 'node:zlib';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI  = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(QUI, '..');

/* Gli stessi colori del tema scuro dell'app. */
const FONDO   = [0x12, 0x12, 0x0f];
const SPENTO  = [0x7d, 0x76, 0x6a];
const ACCESO  = [0xe0, 0x78, 0x5c];

/* Geometria in coordinate 0..1. Le righe stanno dentro il cerchio di
   sicurezza delle icone «maskable», così Android non le taglia. */
const RIGHE = [
  { y: .310, x0: .26, x1: .74, acceso: false },
  { y: .420, x0: .26, x1: .62, acceso: false },
  { y: .530, x0: .26, x1: .74, acceso: true  },
  { y: .640, x0: .26, x1: .555, acceso: false },
];
const SPESSORE = .052;
const RAGGIO   = SPESSORE / 2;

function dentroRiga(x, y, r) {
  const dy = Math.abs(y - r.y);
  if (dy > RAGGIO) return false;
  if (x >= r.x0 + RAGGIO && x <= r.x1 - RAGGIO) return true;
  const cx = x < r.x0 + RAGGIO ? r.x0 + RAGGIO : r.x1 - RAGGIO;   // estremi arrotondati
  return (x - cx) ** 2 + dy ** 2 <= RAGGIO ** 2;
}

function colore(x, y) {
  for (const r of RIGHE) if (dentroRiga(x, y, r)) return r.acceso ? ACCESO : SPENTO;
  return null;
}

/* ---- codifica PNG ---- */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pezzo(tipo, dati) {
  const lung = Buffer.alloc(4); lung.writeUInt32BE(dati.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dati]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([lung, corpo, crc]);
}

function png(lato, pixel) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lato, 0); ihdr.writeUInt32BE(lato, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8 bit, RGBA

  /* Ogni riga preceduta dal byte di filtro 0: nessun filtro. */
  const righe = Buffer.alloc(lato * (lato * 4 + 1));
  for (let y = 0; y < lato; y++) {
    const inizio = y * (lato * 4 + 1);
    righe[inizio] = 0;
    pixel.copy(righe, inizio + 1, y * lato * 4, (y + 1) * lato * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pezzo('IHDR', ihdr),
    pezzo('IDAT', deflateSync(righe, { level: 9 })),
    pezzo('IEND', Buffer.alloc(0)),
  ]);
}

/* Si disegna a 4x e si riduce: è il modo più semplice per avere bordi
   puliti senza scomodare una libreria di grafica. */
const CAMPIONI = 4;

function disegna(lato, { tondo }) {
  const S = lato * CAMPIONI;
  const somma = new Float64Array(lato * lato * 4);

  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      const x = (sx + .5) / S, y = (sy + .5) / S;

      let c = FONDO, a = 255;
      if (tondo) {
        /* Per l'icona non mascherata, un tondo con un margine attorno. */
        const d = Math.hypot(x - .5, y - .5);
        if (d > .5) { a = 0; }
      }
      const segno = colore(x, y);
      if (segno) c = segno;

      const i = (Math.floor(sy / CAMPIONI) * lato + Math.floor(sx / CAMPIONI)) * 4;
      somma[i] += c[0]; somma[i + 1] += c[1]; somma[i + 2] += c[2]; somma[i + 3] += a;
    }
  }

  const n = CAMPIONI * CAMPIONI;
  const fuori = Buffer.alloc(lato * lato * 4);
  for (let i = 0; i < fuori.length; i++) fuori[i] = Math.round(somma[i] / n);
  return png(lato, fuori);
}

const dir = path.join(BASE, 'icons');
if (!existsSync(dir)) await mkdir(dir, { recursive: true });

const daFare = [
  ['icon-192.png', 192, { tondo: false }],
  ['icon-512.png', 512, { tondo: false }],
  ['icon-512-maskable.png', 512, { tondo: false }],
  ['apple-touch-icon-180.png', 180, { tondo: false }],
];

for (const [nome, lato, opzioni] of daFare) {
  const buf = disegna(lato, opzioni);
  await writeFile(path.join(dir, nome), buf);
  console.log(`  ${nome.padEnd(28)} ${lato}×${lato}  ${(buf.length / 1024).toFixed(1)} kB`);
}
