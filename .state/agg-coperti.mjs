import { readFile, writeFile } from 'fs/promises';
const f = '.state/coperti-italia.json';
const j = JSON.parse(await readFile(f, 'utf8'));
const nuove = [
  { impronta: "lombardia|sanit", id: "2026-08-26-001-lombardia-suicidio-assistito-ssn", titolo: "In Lombardia il primo suicidio assistito gestito interamente dalla sanità regionale", quando: "2026-08-26T15:11:00Z" },
  { impronta: "aumenti|glovo|milano", id: "2026-08-26-002-glovo-rider-parere-pm", titolo: "La procura di Milano: i rider di Glovo sono ancora sottopagati, vanno assunti come dipendenti", quando: "2026-08-26T15:12:00Z" },
  { impronta: "16,7miliardi|dipendenza|meta|usa", id: "2026-08-26-003-meta-accordo-social-minori", titolo: "Meta paga 16,7 miliardi di dollari per chiudere la causa sui danni dei social ai minori", quando: "2026-08-26T15:13:00Z" },
  { impronta: "291|95|alluvione|due|nepal|paese|stanno|tajani|tibet", id: "2026-08-26-004-nepal-alluvione-italiani", titolo: "Frana e alluvione tra Nepal e Tibet, almeno 95 morti e centinaia di dispersi", quando: "2026-08-26T15:14:00Z" },
  { impronta: "22|alluvione|nepal|tibet", id: "2026-08-26-004-nepal-alluvione-italiani", titolo: "Frana e alluvione tra Nepal e Tibet, almeno 95 morti e centinaia di dispersi", quando: "2026-08-26T15:14:00Z" },
  { impronta: "trump|usa", id: "2026-08-26-005-usa-visti-immigrati-sospesi", titolo: "Gli Stati Uniti sospendono in tutto il mondo l'esame dei visti per immigrati", quando: "2026-08-26T15:15:00Z" }
];
j.storie = [...nuove, ...j.storie].slice(0, 300);
j.aggiornato = "2026-08-26T15:15:00Z";
await writeFile(f, JSON.stringify(j, null, 1) + '\n');
console.log('storie totali:', j.storie.length);
