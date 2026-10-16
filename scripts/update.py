#!/usr/bin/env python3
"""Aggiorna data.json (risultati e classifiche di Milan e Como) e partite.ics.

Gira su GitHub Actions. Fonte: API pubblica dei risultati ESPN.
Il basket (Cantù) non è coperto: lo aggiorna Claude.
"""
import datetime as dt
import hashlib
import json
import re
import sys
import urllib.request
import extra
from zoneinfo import ZoneInfo

ROME = ZoneInfo("Europe/Rome")
BASE = "https://site.api.espn.com/apis"
UA = {"User-Agent": "Mozilla/5.0 (partite-mcc)"}
LOG = []


def log(*a):
    LOG.append(" ".join(str(x) for x in a))
    print(*a)


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def load_M(html):
    m = re.search(r"const M=\[(.*?)\n\];", html, re.S)
    return json.loads("[" + m.group(1) + "]")


def league(comp):
    c = comp.lower()
    if "serie a calcio" in c:
        return "ita.1"
    if "champions" in c:
        return "uefa.champions"
    if "europa league" in c:
        return "uefa.europa"
    if "coppa italia" in c and "basket" not in c:
        return "ita.coppa_italia"
    return None


def is_team(t, key):
    names = {(t.get("displayName") or "").lower(), (t.get("shortDisplayName") or "").lower(),
             (t.get("name") or "").lower(), (t.get("location") or "").lower()}
    if key == "milan":
        return bool(names & {"ac milan", "milan"})
    if key == "como":
        return any(n == "como" or n.startswith("como ") for n in names)
    return False


IT_NAMES = {"internazionale": "Inter", "ac milan": "Milan", "as roma": "Roma", "hellas verona": "Verona",
            "ss lazio": "Lazio", "ssc napoli": "Napoli", "acf fiorentina": "Fiorentina", "como 1907": "Como"}


def nice(name):
    n = IT_NAMES.get(name.lower())
    if n:
        return n
    return re.sub(r"^(AC|AS|SS|SSC|ACF|US|FC|AFC)\s+|\s+(FC|CF)$", "", name).strip()


def score_str(comp, home_first):
    cs = comp["competitors"]
    h = next(c for c in cs if c.get("homeAway") == "home")
    a = next(c for c in cs if c.get("homeAway") == "away")
    hs, as_ = str(h.get("score", "")).strip(), str(a.get("score", "")).strip()
    if not (hs.isdigit() and as_.isdigit()):
        return None
    s = f"{hs}-{as_}" if home_first else f"{as_}-{hs}"
    name = comp.get("status", {}).get("type", {}).get("name", "")
    if "PEN" in name:
        hp, ap = h.get("shootoutScore"), a.get("shootoutScore")
        s += " dcr" + (f" ({hp}-{ap})" if home_first and hp is not None else f" ({ap}-{hp})" if hp is not None else "")
    elif "AET" in name or "EXTRA" in name:
        s += " dts"
    return s


def results(M, old):
    res = dict(old)
    today = dt.datetime.now(ROME).date()
    todo = [r for r in M if r[1] in ("milan", "como") and league(r[3]) and not (len(r) > 6 and r[6])
            and today - dt.timedelta(days=4) <= dt.date.fromisoformat(r[0]) <= today]
    cache = {}
    for r in todo:
        key = f"{r[0]}|{r[1]}"
        if key in res:
            continue
        lg = league(r[3])
        d = dt.date.fromisoformat(r[0])
        events = []
        for dd in (d, d + dt.timedelta(days=1)):
            u = f"{BASE}/site/v2/sports/soccer/{lg}/scoreboard?dates={dd:%Y%m%d}"
            if u not in cache:
                try:
                    cache[u] = get(u).get("events", [])
                except Exception as e:
                    log("ERR", u, e)
                    cache[u] = []
            events += cache[u]
        for ev in events:
            comp = ev["competitions"][0]
            when = dt.datetime.fromisoformat(ev["date"].replace("Z", "+00:00")).astimezone(ROME).date()
            if when != d:
                continue
            mine = [c for c in comp["competitors"] if is_team(c["team"], r[1])]
            if not mine:
                continue
            st = comp.get("status", {}).get("type", {})
            if not st.get("completed"):
                log("non finita", r[2], st.get("name"))
                break
            home_in_M = {"milan": "Milan", "como": "Como"}[r[1]] in r[2].split(" – ")[0]
            espn_home = mine[0].get("homeAway") == "home"
            s = score_str(comp, home_first=(home_in_M == espn_home))
            if s:
                res[key] = s
                log("risultato", r[2], s)
            break
        else:
            log("nessun evento trovato", r[2], lg)
    return res


def table(lg):
    j = get(f"{BASE}/v2/sports/soccer/{lg}/standings")
    groups = j.get("children") or [j]
    entries = groups[0]["standings"]["entries"]
    rows = []
    for e in entries:
        st = {x["name"]: x.get("value") for x in e.get("stats", [])}
        rows.append({"team": e["team"], "pos": int(st.get("rank") or 0), "pts": int(st.get("points") or 0),
                     "g": int(st.get("gamesPlayed") or 0)})
    rows.sort(key=lambda x: x["pos"])
    return rows


def standing(rows, key):
    for i, x in enumerate(rows):
        if is_team(x["team"], key):
            nb = lambda y: {"n": nice(y["team"]["displayName"]), "pos": y["pos"], "pts": y["pts"]}
            return {"pos": x["pos"], "pts": x["pts"], "g": x["g"],
                    "up": nb(rows[i - 1]) if i > 0 else None,
                    "dn": nb(rows[i + 1]) if i + 1 < len(rows) else None}
    return None


def standings(old):
    out = dict(old)
    for lg, keys in (("ita.1", [("milan", "milan"), ("como", "como")]),
                     ("uefa.europa", [("milan_eu", "milan")]),
                     ("uefa.champions", [("como_eu", "como")])):
        try:
            rows = table(lg)
        except Exception as e:
            log("ERR classifica", lg, e)
            continue
        if lg.startswith("uefa") and len(rows) < 30:
            log("classifica europea non in fase campionato", lg, len(rows))
            continue
        for k, team in keys:
            s = standing(rows, team)
            if s and s["pos"]:
                out[k] = s
                log("classifica", k, s["pos"], s["pts"])
    return out


# ---------- calendario .ics ----------
def ics(M, res):
    def esc(t):
        return t.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")
    now = "20261016T000000Z"  # fisso: evita modifiche inutili ad ogni esecuzione
    seen = set()
    L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//biz4z//Partite MCC//IT", "CALSCALE:GREGORIAN",
         "METHOD:PUBLISH", "X-WR-CALNAME:Partite Milan · Cantù · Como", "X-WR-TIMEZONE:Europe/Rome",
         "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
         "BEGIN:VTIMEZONE", "TZID:Europe/Rome",
         "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000",
         "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
         "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000",
         "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD", "END:VTIMEZONE"]
    for r in sorted(M, key=lambda r: (r[0], r[4] or "")):
        k = r[0] + "|" + r[2]
        if k in seen:
            continue
        seen.add(k)
        date, team, match, comp, time, tv = r[:6]
        result = (r[6] if len(r) > 6 else "") or res.get(f"{date}|{team}", "")
        icon = "🏀" if "basket" in comp.lower() else "⚽"
        uid = hashlib.sha1(k.encode()).hexdigest()[:16] + "@biz4z.github.io"
        title = f"{icon} {match}" + (f" {result}" if result else "")
        desc = f"{comp}\nTV: {tv}" + (f"\nRisultato: {result}" if result else "") + "\nhttps://biz4z.github.io/Partite/"
        L += ["BEGIN:VEVENT", f"UID:{uid}", f"DTSTAMP:{now}"]
        d = date.replace("-", "")
        if time:
            L += [f"DTSTART;TZID=Europe/Rome:{d}T{time.replace(':', '')}00",
                  "DURATION:PT2H"]
        else:
            nd = (dt.date.fromisoformat(date) + dt.timedelta(days=1)).strftime("%Y%m%d")
            L += [f"DTSTART;VALUE=DATE:{d}", f"DTEND;VALUE=DATE:{nd}"]
            desc = "Orario da definire\n" + desc
        L += [f"SUMMARY:{esc(title)}", f"DESCRIPTION:{esc(desc)}", f"LOCATION:{esc(tv)}"]
        if time and not result:
            L += ["BEGIN:VALARM", "ACTION:DISPLAY", f"DESCRIPTION:{esc(match)} tra 30 minuti · {esc(tv)}",
                  "TRIGGER:-PT30M", "END:VALARM"]
        L.append("END:VEVENT")
    L.append("END:VCALENDAR")
    out = []
    for line in L:  # piegatura righe a 75 byte
        b = line.encode()
        while len(b) > 74:
            cut = 74
            while (b[cut] & 0xC0) == 0x80:
                cut -= 1
            out.append(b[:cut].decode())
            b = b" " + b[cut:]
        out.append(b.decode())
    return "\r\n".join(out) + "\r\n"


def apply_cantu(M, cantu):
    """Date, orari e risultati ufficiali di Cantù applicati alle righe M (per il calendario .ics)."""
    for r in M:
        if r[1] != "cantu":
            continue
        g = extra.match_cantu_row(r, cantu.get("games", []))
        if not g:
            continue
        r[0] = g["date"]
        if g["time"]:
            r[4] = g["time"]
        if g["score"] and not (len(r) > 6 and r[6]):
            while len(r) < 7:
                r.append("")
            r[6] = g["score"]


def main():
    html = open("index.html", encoding="utf-8").read()
    M = load_M(html)
    try:
        old = json.load(open("data.json", encoding="utf-8"))
    except Exception:
        old = {}
    offline = "--offline" in sys.argv
    res = old.get("results", {}) if offline else results(M, old.get("results", {}))
    inM = {f"{r[0]}|{r[1]}" for r in M if len(r) > 6 and r[6]}
    res = {k: v for k, v in res.items() if k not in inM}
    sta = old.get("standings", {}) if offline else standings(old.get("standings", {}))
    cantu = old.get("cantu", {})
    news = dict(old.get("news", {}))
    if not offline:
        try:
            cantu = extra.cantu()
            if cantu.get("standing"):
                sta["cantu"] = cantu["standing"]
            log("cantu", len(cantu["games"]), "partite", cantu.get("standing"))
        except Exception as e:
            log("ERR cantu", e)
        for k, fn in (("milan", extra.news_milan), ("cantu", extra.news_cantu), ("como", extra.news_como)):
            try:
                n = fn()
                if n:
                    news[k] = n
                log("notizie", k, len(n))
            except Exception as e:
                log("ERR notizie", k, e)
    pr = dict(old.get("press", {}))
    if not offline:
        for k in ("milan", "cantu", "como"):
            try:
                x = extra.press(k)
                if x:
                    pr[k] = x
                log("stampa", k, len(x))
            except Exception as e:
                log("ERR stampa", k, e)
    data = {"results": res, "standings": sta, "cantu": cantu, "news": news, "press": pr}
    keys = ("results", "standings", "cantu", "news", "press")
    if data != {k: old.get(k) for k in keys}:
        data["updated"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        data["log"] = LOG[-40:]
    else:
        data["updated"] = old.get("updated")
        data["log"] = old.get("log", [])
    json.dump(data, open("data.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    apply_cantu(M, cantu)
    open("partite.ics", "w", encoding="utf-8", newline="").write(ics(M, res))


if __name__ == "__main__":
    main()
