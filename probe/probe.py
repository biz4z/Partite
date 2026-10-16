import urllib.request, json, re, os
U={"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36":1}
urls=[
 "https://www.pallacanestrocantu.com/calendario/",
 "https://www.pallacanestrocantu.com/feed/",
 "https://www.pallacanestrocantu.com/news/",
 "https://www.comofootball.com/feed/",
 "https://www.comofootball.com/ultime-notizie/",
 "https://www.acmilan.com/it/news/articoli/ultime",
 "https://www.legabasket.it/lba/6/calendario",
 "https://www.legabasket.it/",
 "https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=Cantu",
 "https://site.api.espn.com/apis/site/v2/sports/basketball/ita.1/scoreboard",
 "https://api.sofascore.com/api/v1/search/all?q=cantu",
]
os.makedirs("probe/out",exist_ok=True)
rep=[]
for i,u in enumerate(urls):
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":list(U)[0],"Accept-Language":"it-IT"}),timeout=25)
        b=r.read(); t=b.decode("utf-8","replace")
        open(f"probe/out/{i}.txt","w").write(t[:400000])
        rep.append(f"{i} {r.status} {len(b)} {r.headers.get('content-type')} {u}")
    except Exception as e:
        rep.append(f"{i} ERR {e} {u}")
open("probe/out/report.txt","w").write("\n".join(rep))
