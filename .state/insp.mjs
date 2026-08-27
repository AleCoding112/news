import fs from 'fs';
const c = JSON.parse(fs.readFileSync('candidati.json','utf8'));
const all = [...(c.candidati||[]), ...(c.segnali_deboli||[])];
const ids = process.argv.slice(2);
for (const id of ids) {
  const e = all.find(x => x.id === id);
  if (!e) { console.log('===', id, 'NON TROVATO ==='); continue; }
  console.log('===', id, '===');
  console.log(JSON.stringify(e, null, 1));
}
