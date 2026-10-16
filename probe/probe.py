import urllib.request, json, re, os
U={"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36":1}
urls=[
 "https://www.legabasket.it/api/v1/championships?items=1000&cs_id=1&page=1",
 "https://www.acmilan.com/it/news/articoli/europa-league/2026-10-15/poker-rossonero-a-salisburgo-4-0",
 "https://www.comofootball.com/sitemap.xml",
 "https://www.comofootball.com/ultime-notizie/",
 "https://www.acmilan.com/sitemap.xml",
 "https://www.comofootball.com/robots.txt",
 "https://www.acmilan.com/robots.txt",
]
os.makedirs("probe/out",exist_ok=True)
rep=[]
for i,u in enumerate(urls):
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":list(U)[0],"Accept-Language":"it-IT"}),timeout=25)
        b=r.read(); t=b.decode("utf-8","replace")
        open(f"probe/out/{i}.txt","w").write(t)
        rep.append(f"{i} {r.status} {len(b)} {r.headers.get('content-type')} {u}")
    except Exception as e:
        rep.append(f"{i} ERR {e} {u}")
open("probe/out/report.txt","w").write("\n".join(rep))
