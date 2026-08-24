import fs from 'fs';
const c = JSON.parse(fs.readFileSync('candidati.json','utf8'));
const arr = c.candidati||[];
const ids = process.argv.slice(2);
for (const e of arr) {
  if (!ids.includes(e.id)) continue;
  console.log('=== '+e.id+' | '+(e.titolo_guida||'')+' | punti:'+(e.punti||'')+' | gia_coperto:'+(e.gia_coperto?e.gia_coperto.id:'no'));
  console.log('impronta:', e.impronta||'');
  for (const a of (e.articoli||[]).slice(0,7)) {
    console.log('  - ['+(a.testata||'')+(a.paywall?' PAYWALL':'')+'] '+(a.titolo||''));
    console.log('    '+(a.url||''));
    if (a.sommario) console.log('    » '+a.sommario.slice(0,220));
  }
}
