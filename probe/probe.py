import urllib.request, json, os
H={"User-Agent":"Mozilla/5.0"}
def g(u):
    return json.load(urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=25))
out=[]
for lg,d in (("ita.1","20261018"),("uefa.champions","20261021"),("uefa.europa","20261022")):
    try:
        j=g(f"https://site.api.espn.com/apis/site/v2/sports/soccer/{lg}/scoreboard?dates={d}")
        for e in j.get("events",[]):
            c=e["competitions"][0]
            out.append({"lg":lg,"name":e["name"],"id":e["id"],"odds":c.get("odds")})
            if any(k in e["name"] for k in ("Milan","Como")):
                try:
                    s=g(f"https://site.api.espn.com/apis/site/v2/sports/soccer/{lg}/summary?event={e['id']}")
                    out.append({"summary_keys":list(s.keys()),"pickcenter":s.get("pickcenter"),"odds":s.get("odds")})
                except Exception as ex: out.append({"sumerr":str(ex)})
    except Exception as ex: out.append({"err":lg,"e":str(ex)})
os.makedirs("probe/out",exist_ok=True)
json.dump(out,open("probe/out/odds.json","w"),indent=1)
