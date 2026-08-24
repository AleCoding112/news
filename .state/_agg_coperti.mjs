import { readFileSync, writeFileSync } from 'node:fs';

const coperti = JSON.parse(readFileSync('.state/coperti.json', 'utf8'));
const cand = JSON.parse(readFileSync('candidati.json', 'utf8'));
const imp = id => (cand.candidati.find(c => c.id === id) || {}).impronta;

const nuove = [
  { cand: 'c05', id: '2026-08-24-004-dazi-canada-auto-acciaio', titolo: 'Trump annuncia dazi al 50% su auto, componenti e acciaio canadesi dal 1° gennaio 2027', quando: '2026-08-24T14:00:00Z' },
  { cand: 'c11', id: '2026-08-24-004-dazi-canada-auto-acciaio', titolo: 'Trump annuncia dazi al 50% su auto, componenti e acciaio canadesi dal 1° gennaio 2027', quando: '2026-08-24T14:00:00Z' },
  { cand: 'c08', id: '2026-08-24-004-dazi-canada-auto-acciaio', titolo: 'Trump annuncia dazi al 50% su auto, componenti e acciaio canadesi dal 1° gennaio 2027', quando: '2026-08-24T14:00:00Z' },
  { cand: 'c44', id: '2026-08-24-004-dazi-canada-auto-acciaio', titolo: 'Trump annuncia dazi al 50% su auto, componenti e acciaio canadesi dal 1° gennaio 2027', quando: '2026-08-24T14:00:00Z' },
  { cand: 'c09', id: '2026-08-24-005-alibaba-collocamento-ai', titolo: 'Il titolo Alibaba perde fino al 10% nel primo giorno di scambi dopo il collocamento per l’intelligenza artificiale', quando: '2026-08-24T14:10:00Z' },
].map(x => ({ impronta: imp(x.cand), id: x.id, titolo: x.titolo, quando: x.quando, da_candidato: x.cand }))
 .filter(x => x.impronta);

coperti.storie = [...nuove, ...coperti.storie].slice(0, 300);
coperti.aggiornato = '2026-08-24T14:15:00.000Z';
writeFileSync('.state/coperti.json', JSON.stringify(coperti, null, 1) + '\n');
console.log('coperti aggiornato:', coperti.storie.length, 'storie; aggiunte', nuove.length);
