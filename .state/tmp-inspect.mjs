import fs from 'fs';
const c = JSON.parse(fs.readFileSync('candidati-calcio.json','utf8'));
console.log('candidati:', c.candidati.length);
for (const [i,e] of c.candidati.entries()) {
  console.log(`\n[${i}] punti=${e.punti} sost=${e.sostanza} indip=${e.indipendenti} rumoroso=${e.rumoroso} gia=${e.gia_coperto||''}`);
  console.log(`    "${e.titolo_guida}"`);
  console.log(`    motivi: ${(e.motivi||[]).join(' · ')}`);
  console.log(`    testate: ${[...new Set((e.articoli||[]).map(a=>a.testata))].join(', ')}`);
}
if (c.segnali_deboli) {
  console.log('\n\n=== SEGNALI DEBOLI:', c.segnali_deboli.length, '===');
  for (const [i,e] of c.segnali_deboli.entries()) {
    console.log(`[d${i}] "${e.titolo_guida||e.titolo}" — ${[...new Set((e.articoli||[]).map(a=>a.testata))].join(', ')}`);
  }
}
