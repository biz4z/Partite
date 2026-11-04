import urllib.request, json, os
H={"User-Agent":"Mozilla/5.0"}
g=lambda u: json.load(urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=25))
out={}
s=g("https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/teams/2572/schedule")
ev=[(e["date"],e["id"],e["name"],e["competitions"][0].get("status",{}).get("type",{}).get("state"),(e.get("league") or {}).get("slug") or e["competitions"][0].get("league",{}).get("slug")) for e in s.get("events",[])]
out["events"]=ev[-4:]
last=[e for e in s.get("events",[]) if e["competitions"][0]["status"]["type"]["state"]=="post"][-1]
sm=g(f"https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event={last['id']}")
out["keys"]=list(sm.keys())
r=sm.get("rosters") or []
out["rosters"]=[{"team":x["team"]["displayName"],"formation":x.get("formation"),"homeAway":x.get("homeAway"),
  "players":[{k:p.get(k) for k in ("starter","jersey","formationPlace","subbedIn","subbedOut")}|{"name":p["athlete"].get("displayName"),"short":p["athlete"].get("shortName"),"pos":(p.get("position") or {}).get("abbreviation")} for p in x.get("roster",[])][:14]} for x in r]
os.makedirs("probe/out",exist_ok=True); json.dump(out,open("probe/out/lineup.json","w"),indent=1,ensure_ascii=False)
