import fs from "fs";
const c = JSON.parse(fs.readFileSync("./candidati.json", "utf8"));
const list = c.candidati;
const ids = process.argv.slice(2);
for (const id of ids) {
  const e = list.find(x => x.id === id);
  if (!e) { console.log(id, "NON TROVATO"); continue; }
  console.log("=====", id, "[punti", e.punti + "]", "::", e.titolo_guida);
  console.log("   indipendenti:", e.indipendenti, "primaria:", e.primaria, "gia_coperto:", e.gia_coperto ? e.gia_coperto.id : "no");
  (e.articoli || []).forEach(a => console.log("   -", a.testata, "| paywall:" + a.paywall, "|", a.titolo, "|", a.url));
}
