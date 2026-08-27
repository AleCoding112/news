import json
c=json.load(open("/Users/alessandrolovato/Progetti/News/candidati.json"))
ids=["c10","c74","c18","c29","c77","c25","c06","c24","c76","c33","c08","c13","c57"]
for e in c["candidati"]:
    if e["id"] in ids:
        print("=== %s [%d] %s  gia_coperto=%s"%(e["id"],e["punti"],e["titolo_guida"],e.get("gia_coperto")))
        print("   impronta:",e["impronta"])
        for a in e["articoli"]:
            pw="PAYWALL" if a.get("paywall") else ""
            print("   [%s] %s %s"%(a["testata"],a["titolo"],pw))
            print("        ",a["url"])
