/* Apre il sito in un iPhone virtuale, misura quello che conta e ne
   salva la fotografia. Serve per vedere davvero come viene, invece
   di indovinare — e per accorgersi dei traboccamenti orizzontali,
   che a occhio su schermo grande non si notano mai.

   Uso:  node tools/schermo.mjs [--chiaro] [--apri] [--lungo]       */

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORTA  = 9413;
const FUORI  = process.env.SCRATCH || '/tmp';
const SITO   = process.env.SITO || 'http://127.0.0.1:8765/';
const IPHONE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };

const attendi = ms => new Promise(r => setTimeout(r, ms));
const args = process.argv.slice(2);

const profilo = path.join(FUORI, 'chrome-news');
rmSync(profilo, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--remote-debugging-port=' + PORTA, '--user-data-dir=' + profilo, 'about:blank',
], { stdio: 'ignore' });

let vivo = false;
for (let i = 0; i < 60 && !vivo; i++) {
  await attendi(250);
  try { await (await fetch(`http://127.0.0.1:${PORTA}/json/version`)).json(); vivo = true; } catch {}
}
if (!vivo) { console.error('Chrome non risponde'); chrome.kill(); process.exit(1); }

const scheda = await (await fetch(`http://127.0.0.1:${PORTA}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(scheda.webSocketDebuggerUrl);
let n = 0; const attese = new Map();
const detti = [];

ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && attese.has(m.id)) { attese.get(m.id)(m.result); attese.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') {
    detti.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    detti.push('ECCEZIONE: ' + (d.exception?.description ?? d.exception?.value ?? d.text));
  }
});
await new Promise(r => ws.addEventListener('open', r));
const manda = (method, params = {}) => new Promise(res => {
  const id = ++n; attese.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});

await manda('Page.enable');
await manda('Runtime.enable');
await manda('Emulation.setDeviceMetricsOverride', IPHONE);
await manda('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-color-scheme', value: args.includes('--chiaro') ? 'light' : 'dark' }],
});
await manda('Page.navigate', { url: SITO });
await attendi(2500);

if (args.includes('--apri')) {
  await manda('Runtime.evaluate', { expression: `document.querySelector('.apri').click()` });
  await attendi(900);
}

/* --clic '[data-sez=dossier]'  preme qualcosa prima di fotografare. */
const clic = args.indexOf('--clic');
if (clic !== -1 && args[clic + 1]) {
  await manda('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(args[clic + 1])})?.click()`,
  });
  await attendi(800);
}

/* --verso .sezione.dubbio  porta in cima l'elemento da guardare:
   su una pagina lunga è l'unico modo di fotografarne un pezzo preciso. */
const verso = args.indexOf('--verso');
if (verso !== -1 && args[verso + 1]) {
  await manda('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(args[verso + 1])})?.scrollIntoView({block:'start'})`,
  });
  await attendi(500);
}

/* La misura che conta: nulla deve essere più largo della finestra.
   Un traboccamento orizzontale su telefono si vede solo così. */
const misura = await manda('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const larghezza = document.documentElement.clientWidth;
    const colpevoli = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      /* Chi è dentro un contenitore che scorre può sporgere: è il suo
         mestiere. Si guarda tutta la catena dei genitori, non solo sé. */
      let dentroUnoChe = false;
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX;
        if (o === 'auto' || o === 'scroll') { dentroUnoChe = true; break; }
      }
      if (dentroUnoChe) continue;
      if (r.right > larghezza + 1 || r.left < -1) {
        colpevoli.push({ che: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
                         sinistra: Math.round(r.left), destra: Math.round(r.right) });
      }
    }
    return {
      larghezza,
      paginaLarga: document.documentElement.scrollWidth,
      altezza: document.documentElement.scrollHeight,
      pezzi: document.querySelectorAll('.pezzo').length,
      voci_macro: document.querySelectorAll('.macro .voce').length,
      pastiglie: document.querySelectorAll('.pastiglia').length,
      colpevoli: colpevoli.slice(0, 12),
    };
  })()`,
});
const m = misura.result.value;

if (args.includes('--lungo')) {
  await manda('Emulation.setDeviceMetricsOverride', { ...IPHONE, height: Math.min(m.altezza, 6000) });
  await attendi(500);
}
const foto = await manda('Page.captureScreenshot', { format: 'png' });
const nome = path.join(FUORI, `news-${args.includes('--chiaro') ? 'chiaro' : 'scuro'}.png`);
await writeFile(nome, Buffer.from(foto.data, 'base64'));

console.log(`\nfinestra ${m.larghezza}px · pagina ${m.paginaLarga}px · altezza ${m.altezza}px`);
console.log(`${m.pezzi} pezzi · ${m.voci_macro} voci macro · ${m.pastiglie} pastiglie`);
if (m.paginaLarga > m.larghezza + 1) console.log(`\n⚠ la pagina è più larga della finestra di ${m.paginaLarga - m.larghezza}px`);
if (m.colpevoli.length) {
  console.log('\nElementi che escono dalla finestra:');
  for (const c of m.colpevoli) console.log(`  ${c.che.padEnd(26)} da ${c.sinistra} a ${c.destra}`);
} else if (m.paginaLarga <= m.larghezza + 1) {
  console.log('\n✓ niente trabocca');
}
if (detti.length) { console.log('\nLa pagina ha detto:'); for (const d of detti) console.log('  ' + d); }
console.log(`\nfoto: ${nome}`);

ws.close(); chrome.kill();
