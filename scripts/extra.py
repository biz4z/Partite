"""Fonti gratuite aggiuntive: calendario/risultati/classifica di Cantù e notizie ufficiali."""
import datetime as dt
import html as H
import re
import urllib.request
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

ROME = ZoneInfo("Europe/Rome")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      "Accept-Language": "it-IT,it;q=0.9"}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


# ---------------- Cantù / LBA ----------------
LBA = {"APU Old Wild West Udine": "Udine", "Acqua S.Bernardo Cantù": "Cantù", "Armani Olimpia Milano": "Olimpia Milano",
       "BC Roma": "BC Roma", "Bertram Derthona Tortona": "Tortona", "Dolomiti Energia Trentino": "Trento",
       "Longobardi Scafati Basket": "Scafati", "Maxima Roma": "Maxima Roma", "Napoli Basketball": "Napoli",
       "Nutribullet Treviso Basket": "Treviso", "Openjobmetis Varese": "Varese", "Pallacanestro Trieste": "Trieste",
       "Tezenis Verona": "Verona", "UNA Hotels Reggio Emilia": "Reggio Emilia", "Umana Reyer Venezia": "Venezia",
       "Virtus Costa Bologna": "Virtus Bologna"}


def short(n):
    n = H.unescape(n).strip()
    if n in LBA:
        return LBA[n]
    for k, v in LBA.items():  # sponsor cambiato: confronta l'ultima parola
        if k.split()[-1] == n.split()[-1]:
            return v
    return n.split()[-1]


def lba_games():
    t = fetch("https://www.pallacanestrocantu.com/calendario/")
    out = []
    for cls, body in re.findall(r'<li class="shm-lba-game([^"]*)">(.*?)</li>', t, re.S):
        d = re.search(r'<span class="date">\s*\w+\s+(\d\d)/(\d\d)/(\d{4})\s*-\s*(\d\d:\d\d)', body)
        h = re.search(r'<span class="home[^"]*">([^<]+)</span>', body)
        a = re.search(r'<span class="away[^"]*">([^<]+)</span>', body)
        s = re.search(r'<span class="score">\s*(\d+)\s*-\s*(\d+)\s*</span>', body)
        if not (d and h and a):
            continue
        out.append({"date": f"{d[3]}-{d[2]}-{d[1]}", "time": "" if d[4] == "00:00" else d[4],
                    "home": short(h[1]), "away": short(a[1]),
                    "score": f"{s[1]}-{s[2]}" if s and "is-played" in cls else "",
                    "club": "is-club" in cls})
    return out


def lba_table(games):
    teams = {}
    played = [g for g in games if g["score"]]
    for g in games:
        for k in (g["home"], g["away"]):
            teams.setdefault(k, {"w": 0, "g": 0, "pf": 0, "pa": 0})
    for g in played:
        hs, as_ = map(int, g["score"].split("-"))
        for k, f, a in ((g["home"], hs, as_), (g["away"], as_, hs)):
            t = teams[k]
            t["g"] += 1; t["pf"] += f; t["pa"] += a
            t["w"] += f > a

    def h2h(group):
        gs = set(group)
        r = {k: [0, 0] for k in group}
        for g in played:
            if g["home"] in gs and g["away"] in gs:
                hs, as_ = map(int, g["score"].split("-"))
                r[g["home"]][0] += hs > as_; r[g["away"]][0] += as_ > hs
                r[g["home"]][1] += hs - as_; r[g["away"]][1] += as_ - hs
        return r

    by = {}
    for k, t in teams.items():
        by.setdefault(t["w"], []).append(k)
    order = []
    for w in sorted(by, reverse=True):
        grp = by[w]
        r = h2h(grp)
        grp.sort(key=lambda k: (-r[k][0], -r[k][1], -(teams[k]["pf"] - teams[k]["pa"]), -teams[k]["pf"]))
        order += grp
    return [{"n": k, "pos": i + 1, "pts": teams[k]["w"] * 2, "g": teams[k]["g"]} for i, k in enumerate(order)]


def cantu():
    games = lba_games()
    tab = lba_table(games)
    st = None
    for i, x in enumerate(tab):
        if x["n"] == "Cantù":
            nb = lambda y: {"n": y["n"], "pos": y["pos"], "pts": y["pts"]}
            st = {"pos": x["pos"], "pts": x["pts"], "g": x["g"],
                  "up": nb(tab[i - 1]) if i else None, "dn": nb(tab[i + 1]) if i + 1 < len(tab) else None}
    club = [{k: g[k] for k in ("date", "time", "home", "away", "score")} for g in games if g["club"]]
    return {"games": club, "standing": st}


def match_cantu_row(r, games):
    """Trova la partita ufficiale corrispondente a una riga M di Cantù (per avversario e campo)."""
    teams = [re.sub(r"\s*\(.*?\)", "", x).strip() for x in r[2].split(" – ")]
    if len(teams) != 2:
        return None
    for g in games:
        if g["home"] == teams[0] and g["away"] == teams[1]:
            return g
    return None


# ---------------- notizie ----------------
KNOWN = {w.lower() for v in list(LBA.values()) + list(LBA.keys()) for w in re.findall(r"\w+", v) if len(w) > 2} | {
    "milan", "como", "cantù", "inter", "juventus", "napoli", "roma", "lazio", "atalanta", "fiorentina", "bologna",
    "torino", "genoa", "udinese", "cagliari", "lecce", "parma", "sassuolo", "cremonese", "pisa", "venezia", "monza",
    "frosinone", "verona", "salisburgo", "benfica", "feyenoord", "europa", "league", "champions", "serie", "coppa",
    "italia", "san", "siro", "sinigaglia", "paladesio", "milanello", "rossoneri", "lariani"} - {"rossoneri", "lariani", "basket", "basketball", "energia", "hotels", "old", "wild", "west"}


def recase(title, body):
    """Titoli scritti tutti in maiuscolo: li riporta a maiuscole/minuscole normali usando il testo dell'articolo."""
    title = H.unescape(title).strip()
    if title != title.upper():
        return title
    body = H.unescape(H.unescape(body))
    body = re.sub(r"<(script|style)\b.*?</\1>", " ", body, flags=re.S)
    body = re.sub(r"<[^>]+>", " ", body)
    body = re.sub(r"\S*(?:https?:|/|\\u|[a-z]+-[a-z]+-[a-z]+)\S*", " ", body)
    out = []
    for i, tok in enumerate(re.split(r"(\W+)", title)):
        if not tok or not tok[0].isalpha():
            out.append(tok); continue
        low, cap, up = tok.lower(), tok.capitalize(), tok.upper()
        n_low = len(re.findall(r"\b" + re.escape(low) + r"\b", body))
        n_cap = len(re.findall(r"\b" + re.escape(cap) + r"\b", body))
        n_up = len(re.findall(r"\b" + re.escape(up) + r"\b", body)) if len(tok) > 1 else 0
        if len(tok) == 1:
            w = low
        elif n_up and not n_low and not n_cap and len(tok) <= 4:
            w = up
        elif n_cap > n_low or low in KNOWN:
            w = cap
        else:
            w = low
        out.append(w)
    s = "".join(out)
    s = s[0].upper() + s[1:]
    s = re.sub(r"\bSerie a\b", "Serie A", s)
    return re.sub(r'([:“"«]\s*)([a-zà-ù])', lambda m: m[1] + m[2].upper(), s)


SKIP = re.compile(r"bigliett|abbonament|ticket|shop|store|merch|pack|kit\b|femminil|women|primavera|giovanil|"
                  r"formazioni ufficiali|settore ospiti|trasferta.*tifosi|under\s?1\d|academy|minibasket|assemblea|bilancio|partner|sponsor", re.I)


def news_milan():
    t = fetch("https://www.acmilan.com/it/news/articoli/ultime")
    ok = {"serie-a", "europa-league", "champions-league", "coppa-italia", "conferenza-stampa", "media", "awards",
          "mercato", "infortuni", "news"}
    seen, out = set(), []
    for path, cat, d in re.findall(r'href="(/it/news/articoli/([a-z0-9-]+)/(20\d\d-\d\d-\d\d)/[a-z0-9-]+)"', t):
        if path in seen or cat not in ok:
            continue
        seen.add(path)
        url = "https://www.acmilan.com" + path
        try:
            a = fetch(url)
            title = re.search(r'og:title" content="([^"]+)"', a)[1]
        except Exception:
            continue
        if SKIP.search(title):
            continue
        t2 = recase(title, a)
        t2 = re.sub(r":?\s*Match Preview", ": la presentazione", t2, flags=re.I)
        t2 = re.sub(r":?\s*Match Report", ": la cronaca", t2, flags=re.I)
        out.append({"d": d, "t": t2, "u": url})
        if len(out) == 3:
            break
    return out


def news_cantu():
    t = fetch("https://www.pallacanestrocantu.com/feed/")
    out = []
    for it in re.findall(r"<item>(.*?)</item>", t, re.S):
        title = re.search(r"<title>(.*?)</title>", it, re.S)[1]
        link = re.search(r"<link>(.*?)</link>", it)[1].strip()
        pub = parsedate_to_datetime(re.search(r"<pubDate>(.*?)</pubDate>", it)[1]).astimezone(ROME)
        body = (re.search(r"<content:encoded>(.*?)</content:encoded>", it, re.S) or
                re.search(r"<description>(.*?)</description>", it, re.S))
        if SKIP.search(title):
            continue
        out.append({"d": pub.date().isoformat(), "t": recase(re.sub(r"<!\[CDATA\[|\]\]>", "", title), body[1] if body else ""),
                    "u": link})
        if len(out) == 3:
            break
    return out


def news_como():
    t = fetch("https://www.comofootball.com/ultime-notizie/")
    items = re.findall(r'<a href="(/[^"#?]+/)" class="news-detail-link"[^>]*><h3[^>]*>([^<]+)</h3></a>.*?'
                       r'ln-cat-label[^>]*>([^<]+)<', t, re.S)
    try:
        sm = fetch("https://www.comofootball.com/sitemap.xml")
        dates = dict(re.findall(r"<loc>https://(?:www\.)?comofootball\.com(/[^<]+)</loc>\s*<lastmod>([\d-]+)", sm))
    except Exception:
        dates = {}
    seen, cand = set(), []
    for path, title, cat in items:
        if path in seen or path.startswith("/en/") or cat.strip().lower() not in ("football", "calcio", "prima squadra"):
            continue
        seen.add(path)
        title = H.unescape(title).strip()
        if SKIP.search(title):
            continue
        title = re.sub(r"\s*\|\s*(UCL|Serie A|Coppa Italia)?\s*Match Report", ": la cronaca della partita", title, flags=re.I)
        title = re.sub(r"\s*\|\s*(UCL|Serie A|Coppa Italia)?\s*Match Preview", ": la presentazione", title, flags=re.I)
        title = re.sub(r"\bMatch Report\b", "La cronaca", title, flags=re.I)
        title = re.sub(r"\bMatch Preview\b", "La presentazione", title, flags=re.I)
        cand.append({"d": dates.get(path, ""), "t": title, "u": "https://comofootball.com" + path})
    cand.sort(key=lambda x: x["d"], reverse=True)
    return cand[:3]


# ---------------- stampa (Google News) ----------------
PRESS_Q = {"milan": '("AC Milan" OR rossoneri OR "il Milan") -femminile -Inter',
           "cantu": '"Cantù" basket OR "Pallacanestro Cantù" OR "Acqua S.Bernardo"',
           "como": '"Como 1907" OR "Como calcio" OR "il Como" lariani'}
PRESS_SKIP = re.compile(r"pronostic|quote\b|scommess|bonus|diretta streaming gratis|dove vedere .* gratis|"
                        r"femminil|women|primavera|under\s?1\d|oroscopo", re.I)


def press(team, n=8):
    import urllib.parse
    q = urllib.parse.quote(PRESS_Q[team] + " when:3d")
    t = fetch(f"https://news.google.com/rss/search?q={q}&hl=it&gl=IT&ceid=IT:it")
    out, seen = [], set()
    for it in re.findall(r"<item>(.*?)</item>", t, re.S):
        title = H.unescape(re.search(r"<title>(.*?)</title>", it, re.S)[1]).strip()
        src = re.search(r"<source[^>]*>(.*?)</source>", it, re.S)
        src = H.unescape(src[1]).strip() if src else ""
        if src and title.endswith(" - " + src):
            title = title[: -len(src) - 3].strip()
        link = H.unescape(re.search(r"<link>(.*?)</link>", it, re.S)[1]).strip()
        pub = parsedate_to_datetime(re.search(r"<pubDate>(.*?)</pubDate>", it)[1]).astimezone(ROME)
        key = re.sub(r"\W+", "", title.lower())[:60]
        if key in seen or PRESS_SKIP.search(title) or re.search(r"pallacanestrocantu|acmilan|comofootball|^pallacanestro cant|^ac milan$|^como 1907$", src.lower() + " " + link, re.I):
            continue
        seen.add(key)
        out.append({"d": pub.date().isoformat(), "h": pub.strftime("%H:%M"), "t": title, "s": src, "u": link,
                    "_ts": pub.timestamp()})
    out.sort(key=lambda x: x["_ts"], reverse=True)
    for x in out:
        x.pop("_ts")
    return out[:n]
