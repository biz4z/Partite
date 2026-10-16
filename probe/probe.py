import urllib.request, json, os
H={"User-Agent":"Mozilla/5.0"}
g=lambda u: json.load(urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=25))
out=[]
for lg,d in (("ita.1","20261018"),("uefa.champions","20261021"),("uefa.europa","20261022")):
    try:
        for e in g(f"https://site.api.espn.com/apis/site/v2/sports/soccer/{lg}/scoreboard?dates={d}").get("events",[]):
            if not any(k in e["name"] for k in ("Milan","Como")): continue
            c=e["competitions"][0]
            row={"lg":lg,"name":e["name"],"sb_odds":c.get("odds")}
            try:
                s=g(f"https://site.api.espn.com/apis/site/v2/sports/soccer/{lg}/summary?event={e['id']}")
                row.update({"keys":list(s.keys()),"pickcenter":s.get("pickcenter"),"odds":s.get("odds"),"predictor":s.get("predictor"),"winprobability":(s.get("winprobability") or [])[:1]})
            except Exception as ex: row["sumerr"]=str(ex)
            try:
                row["core"]=g(f"https://sports.core.api.espn.com/v2/sports/soccer/leagues/{lg}/events/{e['id']}/competitions/{e['id']}/odds")
            except Exception as ex: row["coreerr"]=str(ex)
            out.append(row)
    except Exception as ex: out.append({"err":lg,"e":str(ex)})
os.makedirs("probe/out",exist_ok=True); json.dump(out,open("probe/out/odds.json","w"),indent=1)
