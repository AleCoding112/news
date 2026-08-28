import fs from 'fs';
const c = JSON.parse(fs.readFileSync('candidati.json','utf8'));
const ids = process.argv.slice(2);
for (const cand of c.candidati) {
  if (ids.length && !ids.includes(cand.id)) continue;
  console.log("=== "+cand.id+" ["+cand.punti+"] "+cand.titolo_guida+" | prim="+cand.primaria+" indip="+cand.indipendenti+" gia="+cand.gia_coperto);
  for (const a of cand.articoli) {
    console.log("   - ["+a.testata+" | pw="+a.paywall+"] "+a.titolo);
    console.log("     "+a.url);
    if(a.sommario && a.sommario!==a.titolo) console.log("     »"+a.sommario);
  }
}
