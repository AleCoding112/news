import fs from "fs";
const c=JSON.parse(fs.readFileSync("candidati.json"));
const list=c.candidati||[];
const keys=["venezuela","kyiv","kiev","korea","depot","ammunition","nepal","telescope","roman"];
list.forEach((e,i)=>{
  const t=(e.titolo_guida||"").toLowerCase();
  if(keys.some(k=>t.includes(k))){
    console.log("\n["+i+"] pt="+e.punti+" sost="+e.sostanza+" indip="+e.indipendenti+" prim="+e.primaria);
    console.log("  T:",e.titolo_guida);
    console.log("  gia_coperto:",e.gia_coperto?e.gia_coperto.id:"no");
    (e.articoli||[]).forEach(a=>console.log("   -",(a.paywall?"[PW] ":"")+a.testata+":",a.titolo,"\n       ",a.url));
  }
});
