/* Estensioni della versione GitHub Pages:
   - risultati e classifiche aggiornati da GitHub Actions (data.json)
   - punteggio live di Milan e Como (API pubblica ESPN, se raggiungibile)
   - iscrizione al calendario dell'iPhone (partite.ics) */
(function () {
  "use strict";
  /* Versione per una sola squadra (es. /como/): window.MCC_ONLY = "como", window.MCC_BASE = "../" */
  const ONLY = window.MCC_ONLY || null, BASE = window.MCC_BASE || "";
  const TEAMS = ONLY ? [ONLY] : ["milan", "cantu", "como"];
  if (ONLY) {
    for (let i = M.length - 1; i >= 0; i--) if (M[i][1] !== ONLY) M.splice(i, 1);
    Object.keys(S).forEach(k => { if (k !== ONLY) delete S[k]; });
    Object.keys(NEWS).forEach(k => { if (k !== ONLY) NEWS[k] = []; });
    const tn = document.querySelector("nav.teams"); if (tn) tn.style.display = "none";
    document.documentElement.classList.add("only-" + ONLY);
    try { refresh(); } catch (e) {}
  }
  const LG = c => /serie a calcio/i.test(c) ? "ita.1" : /champions/i.test(c) ? "uefa.champions" :
    /europa league/i.test(c) ? "uefa.europa" : (/coppa italia/i.test(c) && !/basket/i.test(c)) ? "ita.coppa_italia" : null;
  const isTeam = (t, k) => {
    const n = [t.displayName, t.shortDisplayName, t.name, t.location].filter(Boolean).map(x => x.toLowerCase());
    return k === "milan" ? n.some(x => x === "ac milan" || x === "milan") : k === "como" ? n.some(x => x === "como" || x.startsWith("como ")) : false;
  };
  const NAME = { milan: "Milan", como: "Como" };
  const LIVE = {}; // "data|partita" -> {s, c}

  /* ---------- risultati e classifiche da data.json ---------- */
  function applyData(d) {
    let ch = false;
    const R = d.results || {};
    M.forEach(r => {
      const v = R[r[0] + "|" + r[1]];
      if (v && !r[6]) { r[6] = v; ch = true; }
    });
    const st = d.standings || {};
    const put = (dst, src) => {
      if (!dst || !src || !src.pos || src.g < (dst.g || 0)) return;
      ["pos", "pts", "g", "up", "dn"].forEach(k => { dst[k] = src[k]; });
      ch = true;
    };
    put(S.milan, st.milan); put(S.como, st.como); put(S.cantu, st.cantu);
    /* Cantù: date, orari e risultati ufficiali dal sito del club */
    const G = (d.cantu && d.cantu.games) || [];
    M.forEach(r => {
      if (r[1] !== "cantu") return;
      const [h, a] = r[2].split(" – ").map(x => x.replace(/\s*\(.*?\)/, "").trim());
      const g = G.find(x => x.home === h && x.away === a);
      if (!g) return;
      if (g.date !== r[0]) { r[0] = g.date; ch = true; }
      if (g.time && g.time !== r[4]) { r[4] = g.time; ch = true; }
      if (g.score && !r[6]) { r[6] = g.score; ch = true; }
    });
    /* notizie ufficiali */
    /* stemmi ufficiali (immagini delle fonti ESPN e TheSportsDB) al posto delle sigle */
    Object.entries(d.logos || {}).forEach(([k, u]) => {
      if (!u || !/^https:\/\//.test(u) || !(k in AB)) return;
      const ini = { milan: "ACM", cantu: "CTU", como: "CO" }[k];
      const img = `<img src="${u.replace(/"/g, "")}" alt="" loading="lazy" onerror="this.parentNode.textContent='${ini}'">`;
      if (AB[k] !== img) { AB[k] = img; ch = true; }
    });
    /* partite di Serie A non ancora presenti nella pagina */
    (d.fixtures || []).filter(f => !ONLY || f.team === ONLY).forEach(f => {
      const t = Date.parse(f.date);
      if (M.some(r => r[1] === f.team && Math.abs(Date.parse(r[0]) - t) <= 2 * 864e5)) return;
      const n = M.filter(r => r[1] === f.team && /Serie A calcio/.test(r[3]) && r[0] < f.date).length + 1;
      M.push([f.date, f.team, f.match, `Serie A calcio · ${n}ª giornata`, f.time, "DAZN"]);
      ch = true;
    });
    if (d.lineups) { LINEUPS = d.lineups; drawLineup(); }
    if (d.odds && JSON.stringify(d.odds) !== JSON.stringify(ODDS)) { ODDS = d.odds; ch = true; }
    if (d.press && JSON.stringify(d.press) !== JSON.stringify(PRESS)) { PRESS = d.press; ch = true; }
    const NW = d.news || {};
    TEAMS.forEach(k => {
      if (NW[k] && NW[k].length && JSON.stringify(NW[k]) !== JSON.stringify(NEWS[k])) { NEWS[k] = NW[k]; ch = true; }
    });
    if (S.milan) put(S.milan.eu, st.milan_eu);
    if (S.como) put(S.como.eu, st.como_eu);
    return ch;
  }
  function loadData() {
    return fetch(BASE + "data.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.ok ? r.json() : null)
      .then(d => { if (!d) return; try { if (applyData(d)) { renderHl(); refresh(); } showUpd(d.updated); } catch (e) { console.error("data.json", e); } }).catch(() => {});
  }

  /* "Ultimo controllo": mostra l'aggiornamento automatico più recente */
  function showUpd(iso) {
    const el = document.getElementById("upd");
    if (!el || !iso) return;
    const m = el.textContent.match(/(\d\d)\/(\d\d)\/(\d{4}) alle (\d\d):(\d\d)/);
    const t = new Date(iso);
    if (isNaN(t)) return;
    if (m) {
      const cur = romeTs(`${m[3]}-${m[2]}-${m[1]}`, `${m[4]}:${m[5]}`);
      if (t.getTime() <= cur) return;
    }
    const f = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).formatToParts(t);
    const p = k => f.find(x => x.type === k).value;
    el.textContent = `Ultimo aggiornamento: ${p("day")}/${p("month")}/${p("year")} alle ${p("hour")}:${p("minute")}`;
  }

  /* ---------- punteggio live ---------- */
  const ymd = () => todayRome().replace(/-/g, "");
  function pollLive() {
    const soon = upcoming().filter(x => x.m[4] && x.ts - Date.now() < 90 * 60000);
    const live = [...liveNow(), ...soon].filter(x => x.teams.some(t => NAME[t]) && LG(x.m[3]));
    if (!live.length) return;
    const lgs = [...new Set(live.map(x => LG(x.m[3])))];
    Promise.all(lgs.map(lg => fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/scoreboard?dates=${ymd()}`)
      .then(r => r.json()).then(j => j.events || []).catch(() => []))).then(all => {
      const evs = all.flat();
      let done = false;
      live.forEach(x => {
        const t = x.teams.find(k => NAME[k]);
        const ev = evs.find(e => e.competitions[0].competitors.some(c => isTeam(c.team, t)));
        if (!ev) return;
        liveLineup(x, ev, LG(x.m[3]));
        const c = ev.competitions[0], cs = c.competitors;
        const h = cs.find(z => z.homeAway === "home"), a = cs.find(z => z.homeAway === "away");
        const mine = cs.find(z => isTeam(z.team, t));
        const homeInM = x.m[2].split(" – ")[0].includes(NAME[t]);
        const sameSide = homeInM === (mine.homeAway === "home");
        const sc = sameSide ? `${h.score}-${a.score}` : `${a.score}-${h.score}`;
        const ty = (c.status && c.status.type) || {};
        if (ty.state === "pre") return;
        if (ty.completed) {
          if (!x.m[6]) { x.m[6] = sc + (/AET|EXTRA/.test(ty.name || "") ? " dts" : ""); done = true; }
          LIVE[x.m[0] + "|" + x.m[2]] = { s: sc, c: "Finale" };
        } else {
          LIVE[x.m[0] + "|" + x.m[2]] = { s: sc, c: ty.shortDetail || (c.status.displayClock || "") };
        }
      });
      done ? refresh() : decorate();
    });
  }
  function decorate() {
    if (window.__mccTick) window.__mccTick();
    const rows = document.querySelectorAll("#next .nx.live");
    liveNow().forEach((x, i) => {
      const L = LIVE[x.m[0] + "|" + x.m[2]], el = rows[i];
      if (!L || !el) return;
      const lv = el.querySelector(".lv");
      if (lv) lv.innerHTML = `<i aria-hidden="true"></i>${esc(String(L.s))}<small class="lclk">${esc(String(L.c||""))}</small>`;
    });
  }
  /* mesi successivi al primo chiusi, apribili con un tocco (lo stato resta tra un aggiornamento e l'altro) */
  const OPEN = new Set();
  let PRESS = {};
  let ODDS = {};
  let LINEUPS = {}, LU_TEAM = null;
  const _render = render;
  render = function (f) {
    _render(f);
    if (view === "news") {
      document.querySelectorAll("#list .ng").forEach(sec => {
        const t = ["milan", "cantu", "como"].find(k => sec.querySelector("h2").textContent.startsWith(N[k]));
        const P = (t && PRESS[t]) || [];
        if (!P.length) return;
        sec.insertAdjacentHTML("beforeend", `<h3 class="ph">Dalla stampa</h3>` + P.map(n => {
          const [y, m, d] = n.d.split("-");
          return `<a class="ni" href="${esc(n.u)}" target="_blank" rel="noopener"><span class="nd">${+d}/${+m}</span><span class="nt">${esc(n.t)}<small class="src">${esc(n.s || "")}</small></span></a>`;
        }).join(""));
      });
      return;
    }
    /* stemma sotto giorno e data */
    const xs = (view === "res" ? played() : upcoming()).filter(x => f === "all" || x.teams.includes(f));
    document.querySelectorAll("#list .row .date").forEach((el, i) => {
      const x = xs[i]; if (!x) return;
      const t = f !== "all" ? f : x.teams[0];
      el.insertAdjacentHTML("beforeend", `<span class="bdg rl" style="--c:${T[t]}" aria-hidden="true">${AB[t]}</span>`);
    });
    const week = view === "next";
    if (week) {
      const lim = Date.now() + 7 * 864e5;
      const rows = [...document.querySelectorAll("#list .row")].filter((el, i) => xs[i] && xs[i].ts <= lim);
      const ws = document.createElement("section");
      ws.className = "month wk";
      ws.innerHTML = `<h2>Prossimi 7 giorni</h2>` + (rows.length ? "" : `<p class="empty">Nessuna partita nei prossimi 7 giorni.</p>`);
      rows.forEach(el => ws.appendChild(el.cloneNode(true)));
      const list = document.getElementById("list");
      list.insertBefore(ws, list.firstChild);
    }
    document.querySelectorAll("#list .month:not(.wk)").forEach((sec, i) => {
      if (i === 0 && !week) return;
      const h = sec.querySelector("h2");
      const key = view + "|" + h.textContent;
      const n = sec.querySelectorAll(".row").length;
      h.classList.add("mt");
      h.setAttribute("role", "button");
      h.tabIndex = 0;
      h.insertAdjacentHTML("beforeend", `<span class="mc">${n} ${n === 1 ? "partita" : "partite"}<span class="pm" aria-hidden="true"></span></span>`);
      const set = o => { sec.classList.toggle("closed", !o); h.setAttribute("aria-expanded", o); };
      set(OPEN.has(key));
      const tog = () => { const o = sec.classList.contains("closed"); o ? OPEN.add(key) : OPEN.delete(key); set(o); };
      h.addEventListener("click", tog);
      h.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tog(); } });
    });
  };
  /* Notizie: una sola sezione sopra il calendario, ufficiali + stampa in ordine cronologico */
  let NEWS_OPEN = false;
  renderHl = function () {
    const hb = document.getElementById("hlbox"); if (hb) hb.style.display = "none";
    const vb = document.getElementById("v-news"); if (vb) vb.style.display = "none";
    let sec = document.getElementById("allnews");
    if (!sec) {
      sec = document.createElement("section");
      sec.id = "allnews"; sec.className = "an";
      const nav = document.querySelector("nav.filters");
      nav.parentNode.insertBefore(sec, nav);
    }
    const all = [];
    TEAMS.forEach(t => {
      (NEWS[t] || []).forEach(n => all.push({ ...n, t0: t, s: "Sito ufficiale " + N[t], off: 1, k: (n.d || "0000") + " 12:00" }));
      (PRESS[t] || []).forEach(n => all.push({ ...n, t0: t, k: n.d + " " + (n.h || "00:00") }));
    });
    all.sort((x, y) => y.k.localeCompare(x.k));
    if (!all.length) { sec.hidden = true; return; }
    sec.hidden = false;
    const item = n => {
      const [y, m, d] = (n.d || "").split("-");
      const when = n.d ? `${+d}/${+m}${n.h ? " · " + n.h : ""}` : "";
      return `<a class="ai" style="--c:${T[n.t0]}" href="${esc(n.u)}" target="_blank" rel="noopener"><span class="bdg" aria-hidden="true">${AB[n.t0]}</span><span class="at"><span class="tt">${esc(n.t)}</span><small>${n.off ? "<b>Ufficiale</b> · " : ""}${esc(n.off ? N[n.t0] : (n.s || ""))}${when ? " · " + when : ""}</small></span></a>`;
    };
    const shown = NEWS_OPEN ? all : all.slice(0, 3);
    sec.innerHTML = `<h2>Le news di oggi${NEWS_OPEN ? `<button type="button" class="anx" aria-label="Chiudi le notizie">Chiudi ✕</button>` : ""}</h2>${shown.map(item).join("")}` +
      (all.length > 3 ? `<button type="button" class="anb">${NEWS_OPEN ? "Mostra meno" : "Mostra tutte (" + all.length + ")"}</button>` : "");
    const close = () => { NEWS_OPEN = false; renderHl(); const y = sec.getBoundingClientRect().top + scrollY - 8; if (y < scrollY) scrollTo({ top: y }); };
    const x = sec.querySelector(".anx");
    if (x) x.addEventListener("click", close);
    const btn = sec.querySelector(".anb");
    if (btn) btn.addEventListener("click", () => { if (NEWS_OPEN) close(); else { NEWS_OPEN = true; renderHl(); } });
  };
  const _rn = renderNext;
  renderNext = function () { _rn(); decorate(); ticker(); };

  /* Striscia che scorre: probabilità 1-X-2 ricavate dalle quote */
  function ticker() {
    let el = document.getElementById("odds");
    const items = upcoming().filter(x => ODDS[x.m[0] + "|" + x.m[2]]).slice(0, 6);
    if (!items.length) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("section");
      el.id = "odds"; el.className = "odds"; el.setAttribute("aria-label", "Probabilità dalle quote");
      const nx = document.getElementById("next");
      nx.parentNode.insertBefore(el, nx);
    }
    const one = items.map(x => {
      const o = ODDS[x.m[0] + "|" + x.m[2]], t = x.teams[0];
      return `<span class="oi" style="--c:${T[t]}"><b>${esc(x.m[2])}</b> <i>1</i> ${o["1"]}% <i>X</i> ${o.X}% <i>2</i> ${o["2"]}%</span>`;
    }).join("");
    const html = `<span class="ol">Quote %</span><div class="ov"><div class="ot">${one}${one}</div></div>`;
    if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  }

  /* ---------- calendario iPhone ---------- */
  const css = document.createElement("style");
  css.textContent = `.nx .lv{font-variant-numeric:tabular-nums}.nx .lv .lclk{font-family:var(--body);font-weight:600;font-size:.72rem;letter-spacing:0;text-transform:none;color:var(--muted);margin-left:2px}
.an{display:flex;flex-direction:column}
.an h2{position:sticky;top:env(safe-area-inset-top,0px);z-index:3;background:var(--bg);display:flex;justify-content:space-between;align-items:center;padding-top:6px;font-family:var(--display);font-weight:600;font-size:.85rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 4px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.ai{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;padding:8px 0 8px 10px;border-bottom:1px solid var(--line);border-left:3px solid var(--c);color:var(--fg);text-decoration:none}
.ai .tt{font-size:.9rem;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ai small{display:block;font-size:.74rem;color:var(--muted);margin-top:2px}
.ai small b{color:var(--c);font-weight:600}
.ai:hover .tt,.ai:focus-visible .tt{text-decoration:underline}
.ai:focus-visible{outline:2px solid var(--c);outline-offset:2px}
.anx{all:unset;cursor:pointer;font:700 .78rem var(--display);letter-spacing:.08em;text-transform:uppercase;color:var(--bg);background:var(--fg);border-radius:999px;padding:6px 12px}
.anx:focus-visible{outline:2px solid var(--como);outline-offset:2px}
.anb{all:unset;cursor:pointer;align-self:center;margin-top:10px;font:700 .8rem var(--display);letter-spacing:.08em;text-transform:uppercase;color:var(--fg);border:1.5px solid var(--line);border-radius:999px;padding:7px 16px}
.anb:focus-visible{outline:2px solid var(--como);outline-offset:2px}
.hl .hps{font-family:var(--display);font-weight:600;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:10px 0 2px}
.hi .src{display:block;font-size:.72rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ng .ph{font-family:var(--display);font-weight:600;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:14px 0 2px}
.ni .src{display:block;font-size:.75rem;font-weight:400;color:var(--muted);margin-top:1px}
.date .rl{margin:6px auto 0;width:24px;height:24px;font-size:.58rem}
.bdg:has(img){background:transparent}
.bdg img{width:100%;height:100%;object-fit:contain;display:block}
.brand{display:flex;align-items:center;gap:12px}
.brand .lg{width:72px;height:72px;flex:none;border-radius:16px;box-shadow:0 2px 6px rgba(0,0,0,.18)}
.brand h1{font-size:2.3rem}
.brand .tag{margin:2px 0 0;font:600 .8rem var(--display);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
nav.teams{flex-wrap:nowrap;gap:6px}
nav.teams button{flex:1 1 auto;justify-content:center;padding:6px 8px;gap:6px;font-size:.88rem;letter-spacing:.04em;min-width:0}
nav.teams .dot{width:8px;height:8px}
.month h2.mt{cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px}
.month h2.mt:focus-visible{outline:2px solid var(--como);outline-offset:2px}
.month .mc{display:inline-flex;align-items:center;gap:8px;font-family:var(--body);font-weight:500;font-size:.75rem;letter-spacing:0;text-transform:none}
.month .pm{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;color:var(--fg)}
.month .pm::before{content:"−";font-size:.95rem;line-height:1}
.month.closed .pm::before{content:"+"}
.month.closed .row{display:none}
.month.closed h2{border-bottom-color:var(--line)}
.cal ol{margin:6px 0 4px;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:.88rem}
.calbtn{display:flex;align-items:center;justify-content:center;gap:8px;margin:6px 0 8px;padding:11px 14px;border-radius:999px;background:var(--fg);color:var(--bg);font:700 .95rem var(--display);letter-spacing:.06em;text-transform:uppercase;text-decoration:none}
.calbtn:focus-visible{outline:2px solid var(--como);outline-offset:2px}
.calrow{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:-8px;max-width:360px}
.callbl{grid-column:1/-1;font:600 .78rem var(--display);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.calpill{display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 14px;border-radius:999px;background:var(--fg);color:var(--bg);font:700 .85rem var(--display);letter-spacing:.08em;text-transform:uppercase;text-decoration:none}
.calpill{font-family:inherit;cursor:pointer}
.andbox{grid-column:1/-1;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:10px 12px;font-size:.82rem;line-height:1.4;text-align:left;color:#fff}
.andbox ol{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px}
.andbox b{color:#e9b949}
.androw{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.andact{display:inline-block;background:#e9b949;color:#0b1a3a!important;font:700 .78rem var(--display);letter-spacing:.06em;text-transform:uppercase;text-decoration:none;border:0;border-radius:999px;padding:6px 12px;cursor:pointer}
.andbox ol .andact{padding:2px 10px}
.andnote{margin:8px 0 0;font-size:.72rem;color:rgba(255,255,255,.65)}
.calpill svg{width:16px;height:16px;display:block;flex:none}
.calpill:focus-visible{outline:2px solid var(--como);outline-offset:2px}
.cal .hint{font-size:.8rem;color:var(--muted);margin:4px 0 8px}`;
  css.textContent += `
/* intestazione */
.hero{position:relative;overflow:hidden;color:#fff;background:#0b1a3a;border-radius:0 0 22px 22px;
  margin:-20px calc(-1*max(16px,env(safe-area-inset-right,0px))) 0 calc(-1*max(16px,env(safe-area-inset-left,0px)));
  padding:calc(18px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) 18px max(16px,env(safe-area-inset-left,0px));display:flex;flex-direction:column;gap:14px}
@media (min-width:792px){.hero{margin:-20px 0 0;border-radius:0 0 22px 22px}}
.hero header{position:relative;z-index:1}
.hero .sub,.hero .tag{color:rgba(255,255,255,.72)}
.hero .tag{color:#e9b949}
.hero .rf{position:absolute;top:0;right:0;background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.28);color:#fff}
.skinbtn{all:unset;cursor:pointer;position:absolute;top:0;left:0;font:700 .68rem var(--display);letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.75);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:5px 10px}
.skinbtn:focus-visible{outline:2px solid #e9b949;outline-offset:2px}
.hero .calrow{position:relative;z-index:1;margin:0;max-width:none}
.hero .callbl{color:rgba(255,255,255,.65)}
.hstripe{position:absolute;left:0;right:0;bottom:0;height:5px;background:linear-gradient(90deg,#c4161c 0 33.3%,#e08a1e 0 66.6%,#1f6fb8 0)}
.board:empty{display:none}
/* ===== Tema "Stadium Glass" (solo pagina Como) ===== */
html.only-como{--bg:#050b1f;--surface:rgba(255,255,255,.07);--fg:#eef6ff;--muted:#a3b6d2;--line:rgba(255,255,255,.14);--chip:rgba(255,255,255,.10);
  --como:#4cc2ff;--glass-b:rgba(255,255,255,.16);--cyan:#7cf5ff;--ok:#3ee089;--display:"Montserrat","Barlow Condensed",system-ui,sans-serif;--body:"Inter","IBM Plex Sans",system-ui,sans-serif;color-scheme:dark;
  background:#050b1f}
html.only-como body{background:radial-gradient(120% 50% at 85% 0%,#1e5bd8 0%,transparent 60%),radial-gradient(90% 40% at 0% 30%,#0e7fb8 0%,transparent 60%),#050b1f;background-attachment:fixed;color:var(--fg)}
html.only-como .hero{background:transparent!important;border-radius:0}
html.only-como .hstripe{display:none}
html.only-como .brand .lg{border-radius:14px;box-shadow:0 6px 18px rgba(0,0,0,.45)}
html.only-como .brand h1{font:800 1.9rem/1 var(--display);letter-spacing:-.01em;text-transform:none}
html.only-como .brand .tag{color:var(--cyan);font:600 .72rem var(--body);letter-spacing:.2em}
html.only-como .hero .sub{color:var(--muted)}
html.only-como .rf{background:rgba(255,255,255,.08);border-color:var(--glass-b)}
/* superfici in vetro */
html.only-como .board,html.only-como .st,html.only-como .next,html.only-como .an .ai,html.only-como .month .row,html.only-como .odds,
html.only-como .notesbox,html.only-como .cmenu,html.only-como .hero .lu,html.only-como .calpill,html.only-como nav.filters button{
  background:var(--surface)!important;border:1px solid var(--glass-b)!important;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
html.only-como .board{border-radius:22px!important;padding:16px!important;display:block!important}
html.only-como .board:has(+ .lu){border-radius:22px 22px 0 0!important;border-bottom:1px dashed var(--glass-b)!important}
html.only-como .hero .lu{border-radius:0 0 22px 22px;border-top:0!important;margin-top:-14px}
html.only-como .board .bk{color:var(--cyan);font:600 .7rem var(--body);letter-spacing:.2em;text-transform:uppercase}
html.only-como .board .bm{font:800 1.45rem/1.15 var(--display);text-transform:none;margin:4px 0 12px}
html.only-como .board .bt{color:var(--muted);font-size:.78rem;margin-top:10px}
html.only-como .bcd{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
html.only-como .bcd div{text-align:center;padding:10px 0;border-radius:14px;background:rgba(0,0,0,.28)}
html.only-como .bcd b{display:block;font:800 1.6rem/1 var(--display);font-variant-numeric:tabular-nums}
html.only-como .bcd small{display:block;font:600 .66rem var(--body);color:var(--muted);margin-top:4px}
html.only-como .board .bc{color:var(--ok);font-family:var(--display);font-weight:800}
html.only-como .calpill{border-radius:14px!important;color:var(--fg)!important;min-height:44px;font:600 .85rem var(--body);letter-spacing:.02em;text-transform:none}
html.only-como .callbl{color:var(--muted)}
html.only-como .andbox{background:rgba(255,255,255,.06);border-color:var(--glass-b)}
html.only-como .odds{border-radius:16px}
html.only-como .odds .ol{background:var(--como);color:#04122e}
html.only-como .next{border-radius:18px}
html.only-como .nx{border-color:var(--line)}
html.only-como .st{border-radius:22px!important;border-top:1px solid var(--glass-b)!important}
html.only-como .st .p{font:800 2.4rem/0.9 var(--display);background:linear-gradient(180deg,#fff,var(--como));-webkit-background-clip:text;background-clip:text;color:transparent}
html.only-como .st .t,html.only-como .st .l,html.only-como .eu .eh{color:var(--cyan)}
html.only-como .fq{width:24px;height:16px;border-radius:999px;font-size:.62rem}
html.only-como .fq.V{background:var(--ok);color:#03210f}
html.only-como .month h2,html.only-como .an h2,html.only-como .lu h2{color:var(--muted)!important;border-bottom:0!important;font:600 .72rem var(--body)!important;letter-spacing:.2em!important}
html.only-como .month .row{border-radius:18px;margin-bottom:8px;padding:12px;grid-template-columns:56px 1fr}
html.only-como .info{border-left:0;padding-left:0}
html.only-como .date .d{font:800 1.5rem/1 var(--display)}
html.only-como .comp{color:var(--cyan)}
html.only-como .tv{background:var(--como);color:#04122e;border-radius:999px;font-weight:600;padding:2px 9px}
html.only-como .an .ai{border-radius:16px;margin-bottom:6px;border-left:1px solid var(--glass-b)!important;padding:10px 12px}
html.only-como .anb,html.only-como .anx{border-color:var(--glass-b);color:var(--fg);background:rgba(255,255,255,.06)}
html.only-como .anx{background:var(--como);color:#04122e}
html.only-como nav.filters button{border-radius:999px;color:var(--fg)}
html.only-como nav.filters button[aria-pressed="true"]{background:var(--como)!important;color:#04122e!important;border-color:var(--como)!important}
html.only-como .cmenu{border-radius:22px}
html.only-como .coffee h2,html.only-como .coffee p{color:var(--fg)}
html.only-como .notesbox{border-radius:18px;padding:0 14px}
html.only-como .notes{background:transparent;border:0;color:var(--muted)}
html.only-como .pitch .pf{fill:#0f5a3a}html.only-como .pitch .ps{fill:#116641}
html.only-como .pitch .lp{fill:var(--como)}
html.only-como .ltabs button[aria-pressed="true"]{background:var(--como);color:#04122e}
@media (prefers-reduced-motion:reduce){html.only-como body{background-attachment:scroll}}

.lu{display:flex;flex-direction:column;align-items:center}
.hero .lu{position:relative;z-index:1;background:#050c1c;border:2px solid #e9b949;border-top:0;border-radius:0 0 12px 12px;margin-top:-16px;padding:8px 10px 10px}
.hero .board{position:relative;z-index:2}
.hero .board:has(+ .lu){border-radius:12px 12px 0 0;border-bottom:1px dashed rgba(233,185,73,.4)}
.hero .lu h2{color:rgba(255,255,255,.7);border-bottom-color:rgba(255,255,255,.15)}
.hero .lu .lm{color:#fff}
.hero .lu .lsub{color:rgba(255,255,255,.7)}
.hero .ltabs button{background:transparent;color:#fff;border-color:rgba(255,255,255,.3)}
.hero .ltabs button[aria-pressed="true"]{background:#e9b949;color:#0b1a3a;border-color:#e9b949}
.lu .lvt{display:inline-flex;align-items:center;gap:6px;color:#2fbf71}
.lu .lvt i{width:8px;height:8px;border-radius:50%;background:#2fbf71;animation:blink 1.2s ease-in-out infinite}
.pitch .lg{font-size:12px}
.lu .lgoals{align-self:stretch;margin-top:6px;font-size:.8rem}
.lu .lgoals p{margin:2px 0}
.hero .lu .lgoals{color:#fff}.hero .lu .lgoals b{color:#e9b949}
.lu .lsc{font-family:var(--display);font-size:1.05rem}
.lu .lck{color:#2fbf71;font-weight:700}
.lu h2{align-self:stretch;display:flex;justify-content:space-between;font-family:var(--display);font-weight:600;font-size:.85rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 2px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.lu .lf{color:var(--c,#1f6fb8);color:#e9b949;font-weight:700}
.lu .lm{align-self:stretch;margin:6px 0 8px;font-size:.85rem;color:var(--fg);font-weight:600}
.pitch{width:100%;max-width:380px;height:auto}
.pitch .pf{fill:#1f7a3f}.pitch .ps{fill:#228544}
.pitch .pl rect,.pitch .pl circle,.pitch .pl line{fill:none;stroke:rgba(255,255,255,.75);stroke-width:2}
.pitch .lp{fill:var(--tc,#1f6fb8);stroke:#fff;stroke-width:2}
.ltabs{display:flex;gap:6px;align-self:stretch;margin-top:8px}
.ltabs button{flex:1;font:700 .85rem var(--display);letter-spacing:.06em;text-transform:uppercase;border:1.5px solid var(--line);background:var(--surface);color:var(--fg);border-radius:999px;padding:6px 10px;cursor:pointer}
.ltabs button[aria-pressed="true"]{background:#0b1a3a;color:#fff;border-color:#0b1a3a}.pitch .lp.gk{fill:#e9b949}
.pitch .lj{fill:#fff;font:700 13px var(--display);text-anchor:middle}
.pitch .lp.gk + .lj{fill:#0b1a3a}
.pitch .ln{fill:#fff;font:600 11px var(--body);text-anchor:middle;paint-order:stroke;stroke:rgba(0,0,0,.45);stroke-width:3px}
.lu .lsub{align-self:stretch;margin:6px 0 0;font-size:.78rem;color:var(--muted)}

.only-como .hstripe{background:linear-gradient(90deg,#123c7a,#1f6fb8 50%,#5aa4e8)}
.only-como .brand h1{font-size:2.1rem}
.notesbox .notes{margin-top:8px}
.month.wk h2{color:var(--fg)}
.coffee{display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px 0 6px;text-align:center}
.coffee h2{margin:0;font:700 1.2rem var(--display);letter-spacing:.06em;text-transform:uppercase;color:var(--fg)}
.coffee .cs{margin:0 0 4px;font-size:.85rem;color:var(--muted);max-width:30em}
.cmenu{box-sizing:border-box;width:100%;max-width:420px;background:#0b1a3a;border-radius:16px;padding:6px 16px;color:#fff;box-shadow:0 6px 18px rgba(11,26,58,.25)}
.cmenu .chd{font:700 .85rem var(--display);letter-spacing:.3em;text-transform:uppercase;color:#e9b949;text-align:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.15)}
.citem{display:flex;align-items:baseline;gap:10px;padding:13px 2px;text-decoration:none;color:#fff;border-bottom:1px dotted rgba(255,255,255,.2);font:700 1.3rem var(--display);letter-spacing:.05em;text-transform:uppercase}
.citem:last-child{border-bottom:0}
.citem .ci{font-size:1.2rem}
.citem .cdots{flex:1;border-bottom:2px dotted rgba(233,185,73,.5);transform:translateY(-5px)}
.citem .ce{color:#e9b949;font-variant-numeric:tabular-nums}
.citem .cgo{color:rgba(255,255,255,.5);font-size:1.1rem}
.citem:hover .cn,.citem:focus-visible .cn{text-decoration:underline}
.citem:focus-visible{outline:2px solid #e9b949;outline-offset:2px;border-radius:6px}
.coffee small{font-size:.72rem;color:var(--muted)}
/* tema giorno "Ghiaccio" (di sera resta il tema scuro) */
@media (prefers-color-scheme: light){
html:not(.only-como):root{--bg:#e9eef6;--surface:#ffffff;--fg:#0b1a3a;--muted:#56657e;--line:#d5deeb;--chip:#eef2f8}
html:not(.only-como) .st,html:not(.only-como) .next,html:not(.only-como) .month .row{box-shadow:0 1px 0 rgba(11,26,58,.04)}
html:not(.only-como) .st{border-top:4px solid var(--c)}
html:not(.only-como) .month h2,html:not(.only-como) .an h2{color:#0b1a3a;border-bottom:2px solid #e9b949}
html:not(.only-como) nav.filters button[aria-pressed="true"]{background:#0b1a3a;color:#fff;border-color:#0b1a3a}
html:not(.only-como) .hero{border-radius:0 0 26px 26px}}
.odds{display:flex;align-items:center;background:#0b1a3a;color:#fff;border-radius:10px;overflow:hidden;font-size:.82rem}
.odds .ol{flex:none;align-self:stretch;display:flex;align-items:center;padding:0 10px;background:#e9b949;color:#0b1a3a;font:700 .72rem var(--display);letter-spacing:.1em;text-transform:uppercase}
.odds .ov{overflow:hidden;flex:1;mask-image:linear-gradient(90deg,transparent,#000 12px,#000 calc(100% - 12px),transparent)}
.odds .ot{display:inline-flex;white-space:nowrap;padding:9px 0;animation:oscroll 28s linear infinite}
.odds:hover .ot{animation-play-state:paused}
.odds .oi{padding:0 18px;border-left:3px solid var(--c);margin-left:6px;font-variant-numeric:tabular-nums}
.odds .oi b{font-weight:600;margin-right:4px}
.odds .oi i{font-style:normal;color:#e9b949;font-weight:700;margin-left:6px}
@keyframes oscroll{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.odds .ot{animation:none}.odds .ov{overflow-x:auto}}
html{background:linear-gradient(#0b1a3a 0 50%,var(--bg) 50%)}
/* Stile A: stadio di notte */
.skin-a .hero{background:radial-gradient(120% 90% at 50% 0%,#24407a 0%,#0b1a3a 55%,#050c1c 100%);text-align:center}
.skin-a .hero:before{content:"";position:absolute;inset:0;background:conic-gradient(from 200deg at 50% -10%,transparent 0 20deg,rgba(255,255,255,.10) 24deg,transparent 30deg 60deg,rgba(255,255,255,.08) 64deg,transparent 70deg);pointer-events:none}
.skin-a .hero header{display:block;padding-top:30px}
.skin-a .brand{flex-direction:column;gap:10px}
.skin-a .brand .lg{width:112px;height:112px;border-radius:24px;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.skin-a .brand h1{font-size:3.4rem;line-height:.9;color:#fff}
.skin-a .brand .tag{letter-spacing:.3em;font-size:.95rem}
.skin-a .calpill{background:#fff;color:#0b1a3a}
.skin-a .callbl{text-align:center}
/* Stile B: tabellone */
.skin-b .hero{background:#0b1a3a}
.skin-b .hero header{padding-top:0}
.skin-b .brand .lg{width:74px;height:74px}
.skin-b .brand h1{font-size:2.35rem;color:#fff}
.hero .brand{padding-right:46px}
.skin-b .board{position:relative;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:12px;background:#050c1c;border:2px solid #e9b949;border-radius:12px;padding:10px 12px}
.board .bk{font:700 .72rem var(--display);letter-spacing:.18em;text-transform:uppercase;color:#e9b949}
.board .bm{font:700 1.25rem/1.1 var(--display);text-transform:uppercase;letter-spacing:.03em}
.board .bt{font-size:.75rem;color:rgba(255,255,255,.65);margin-top:2px}
.board .bc{font:700 1.7rem/1 var(--display);color:#ff5a5f;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.board .bc.live{color:#43c07a}
.board .bc small{display:block;font:600 .62rem var(--display);letter-spacing:.14em;text-transform:uppercase;color:#93a0ae;margin-top:3px}
.skin-b .calpill{background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.35)}
`;
  document.head.appendChild(css);
  const ics = location.host + location.pathname.replace(/[^/]*$/, "") + "partite.ics";
  const upd = document.getElementById("upd");
  if (upd) {
    const ico = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`;
    const row = document.createElement("div");
    row.className = "calrow";
    row.innerHTML = `<span class="callbl">Aggiungi al calendario</span>` +
      `<a class="calpill" href="webcal://${ics}">${ico}iPhone</a>` +
      `<button type="button" class="calpill" id="andbtn" aria-expanded="false">${ico}Android</button>` +
      `<div class="andbox" id="andbox" hidden>
        <ol>
          <li><a class="andact" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent("https://" + ics)}" target="_blank" rel="noopener">Apri Google Calendar</a> e conferma <b>Aggiungi</b>. Se dal telefono non compare la richiesta, apri il link da un computer, oppure in Chrome dal menu ⋮ attiva <b>Sito desktop</b> e riprova.</li>
          <li>Poi nell'app <b>Google Calendar</b>: menu ☰ → <b>Impostazioni</b> → tocca <b>Partite Milan · Cantù · Como</b> → attiva <b>Sincronizza</b>. Senza questo passaggio le partite non compaiono sul telefono.</li>
        </ol>
        <div class="androw"><button type="button" class="andact" id="andcopy">Copia indirizzo</button><a class="andact" href="partite.ics" download="partite-mcc.ics">Scarica .ics</a></div>
        <p class="andnote">"Copia indirizzo" serve per Google Calendar da computer (<i>Altri calendari → Da URL</i>) o per app come ICSx⁵. "Scarica .ics" importa le partite una volta sola, senza aggiornamenti.</p>
      </div>`;
    (document.querySelector("header") || upd).after(row);
    const ab = row.querySelector("#andbtn"), box = row.querySelector("#andbox");
    ab.addEventListener("click", () => { box.hidden = !box.hidden; ab.setAttribute("aria-expanded", !box.hidden); });
    row.querySelector("#andcopy").addEventListener("click", e => {
      const u = "https://" + ics;
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => { e.target.textContent = "Copiato ✓"; })
        .catch(() => { prompt("Copia questo indirizzo:", u); });
    });
  }

  renderHl();

  /* Tasto ↻: chiede subito i dati più recenti (notizie, risultati, classifiche, live) senza ricaricare la pagina */
  const rf = document.getElementById("rf");
  if (rf) {
    const nb = rf.cloneNode(true); rf.replaceWith(nb);
    nb.addEventListener("click", () => {
      if (nb.classList.contains("spin")) return;
      nb.classList.add("spin");
      const t0 = Date.now();
      Promise.all([loadData(), Promise.resolve().then(pollLive)]).finally(() => {
        setTimeout(() => {
          nb.classList.remove("spin");
          const el = document.getElementById("upd");
          if (el && !/· controllato/.test(el.textContent)) el.dataset.base = el.textContent;
          const hm = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(new Date());
          if (el) el.textContent = (el.dataset.base || el.textContent) + " · controllato alle " + hm;
        }, Math.max(0, 600 - (Date.now() - t0)));
      });
    });
  }

  /* ---------- intestazione: due stili a scelta (Stadio / Tabellone) ---------- */
  (function skins() {
    const header = document.querySelector("header");
    if (!header) return;
    const hero = document.createElement("div");
    hero.className = "hero";
    header.parentNode.insertBefore(hero, header);
    hero.appendChild(header);
    const cal = document.querySelector(".calrow");
    const board = document.createElement("div");
    board.className = "board";
    hero.appendChild(board);
    if (cal) hero.appendChild(cal);
    hero.insertAdjacentHTML("beforeend", '<div class="hstripe" aria-hidden="true"></div>');
    const skin = "b";
    document.body.classList.add("skin-b");
    const apply = () => tick();
    function tick() {
      if (skin !== "b") { board.innerHTML = ""; return; }
      const lv = liveNow()[0];
      const x = lv || upcoming()[0];
      if (!x) { board.innerHTML = ""; return; }
      let cd, sub;
      if (lv) { const L = LIVE[x.m[0] + "|" + x.m[2]]; cd = L ? L.s : "LIVE"; sub = L ? L.c : "in corso"; }
      else {
        const ms = x.ts - Date.now(), mi = Math.floor(ms / 60000), d = Math.floor(mi / 1440), h = Math.floor(mi % 1440 / 60), m = mi % 60;
        cd = d ? `${d}G ${h}H` : h ? `${h}H ${String(m).padStart(2, "0")}M` : `${m} MIN`;
        sub = x.m[4] ? "al calcio d'inizio" : "orario da definire";
      }
      const t = x.teams[0];
      if (ONLY && !lv) {
        const ms = Math.max(0, x.ts - Date.now()), mi = Math.floor(ms / 60000);
        const parts = [[Math.floor(mi / 1440), "giorni"], [Math.floor(mi % 1440 / 60), "ore"], [mi % 60, "min"]];
        board.innerHTML = `<div class="bk">Prossima · ${esc(x.m[3].split(" · ")[0])}</div><div class="bm">${esc(x.m[2])}</div>` +
          `<div class="bcd" role="timer" aria-label="Mancano ${parts.map(p => p[0] + " " + p[1]).join(", ")}">${parts.map(([v, l]) => `<div><b>${v}</b><small>${l}</small></div>`).join("")}</div>` +
          `<div class="bt">${esc(tvFor(x.m))}${x.m[4] ? " · " + esc(x.m[4]) : ""}</div>`;
        return;
      }
      board.innerHTML = `<div><div class="bk">${lv ? "In corso" : "Prossima"} · ${esc(N[t])}</div><div class="bm">${esc(x.m[2])}</div><div class="bt">${esc(tvFor(x.m))}</div></div><div class="bc${lv ? " live" : ""}">${esc(String(cd))}<small>${esc(sub)}</small></div>`;
    }
    apply();
    window.__mccTick = tick;
    setInterval(tick, 30000);
    const _rn2 = renderNext; renderNext = function () { _rn2(); tick(); };
  })();

  /* Formazione in campo durante la partita (dati ESPN letti dal telefono) */
  const LIVE_LU = {};
  const depth = p => { p = (p || "").toUpperCase(); if (p === "G" || p === "GK") return 0; if (p.startsWith("CD") || ["LB", "RB", "D", "SW"].includes(p) || p.includes("WB")) return 1; if (p.startsWith("DM")) return 2; if (p.startsWith("CM") || ["LM", "RM", "M"].includes(p)) return 3; if (p.startsWith("AM") || ["LW", "RW"].includes(p)) return 4; return 5; };
  const side = p => { p = (p || "").toUpperCase(); return p.endsWith("-L") ? -1 : p.endsWith("-R") ? 1 : p[0] === "L" ? -2 : p[0] === "R" ? 2 : 0; };
  const sname = a => a.shortName || a.displayName || "";
  function liveLineup(x, ev, lg) {
    const t = x.teams.find(k => NAME[k]);
    return fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/summary?event=${ev.id}`).then(r => r.json()).then(sm => {
      const ro = (sm.rosters || []).find(r => isTeam(r.team, t));
      if (!ro) return;
      const st = (ro.roster || []).filter(p => p.starter);
      if (st.length < 11) return;
      const pos = p => (p.position || {}).abbreviation;
      const sizes = ((ro.formation || "").match(/\d/g) || ["4", "4", "2"]).map(Number);
      const gk = st.filter(p => depth(pos(p)) === 0).slice(0, 1);
      const out = st.filter(p => !gk.includes(p)).sort((a, b) => depth(pos(a)) - depth(pos(b)) || (+a.formationPlace || 0) - (+b.formationPlace || 0));
      const lines = [gk]; let i = 0;
      sizes.forEach(n => { const ln = out.slice(i, i + n); i += n; ln.sort((a, b) => side(pos(a)) - side(pos(b)) || (+a.formationPlace || 0) - (+b.formationPlace || 0)); lines.push(ln); });
      if (i < out.length) lines[lines.length - 1].push(...out.slice(i));
      /* cambi: "X replaces Y" nei fatti salienti */
      const changes = [];
      (sm.keyEvents || []).forEach(k => {
        const tx = k.text || "";
        const m = tx.match(/Substitution,\s*([^.]+)\.\s*(.+?)\s+replaces\s+(.+?)(?:\s+because|\.|$)/i);
        if (!m || !isTeam({ displayName: m[1], location: m[1], name: m[1] }, t)) return;
        changes.push({ in: m[2].trim(), out: m[3].trim(), min: (k.clock || {}).displayValue || "" });
      });
      const sur = n => String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(" ").slice(-1)[0];
      const goals = (sm.keyEvents || []).filter(k => k.scoringPlay || /goal|penalty - scored/i.test(((k.type || {}).text || "") + " " + ((k.type || {}).type || ""))).map(k => {
        const tt = ((k.type || {}).text || "");
        const who = ((k.participants || [])[0] || {}).athlete || {};
        return { n: who.shortName || who.displayName || "", full: who.displayName || "", min: (k.clock || {}).displayValue || "",
          mine: isTeam(k.team || {}, t), og: /own/i.test(tt), pen: /penal/i.test(tt) };
      }).filter(g => g.n);
      const byName = n => (ro.roster || []).find(p => [p.athlete.displayName, p.athlete.shortName].includes(n)) ||
        (ro.roster || []).find(p => sur(p.athlete.displayName) === sur(n));
      const cell = p => ({ n: sname(p.athlete), j: p.jersey || "" });
      const L = lines.map(ln => ln.map(cell));
      changes.forEach(c => {
        const o = byName(c.out), n = byName(c.in);
        L.forEach(ln => ln.forEach((q, k) => { if (o && q.n === sname(o.athlete)) ln[k] = n ? { ...cell(n), in: true } : { n: c.in, j: "", in: true }; }));
        c.in = n ? sname(n.athlete) : c.in; c.out = o ? sname(o.athlete) : c.out;
      });
      const comp = ev.competitions[0], cs = comp.competitors;
      const h = cs.find(z => z.homeAway === "home"), a = cs.find(z => z.homeAway === "away");
      const homeInM = x.m[2].split(" – ")[0].includes(NAME[t]);
      const sameSide = homeInM === (cs.find(z => isTeam(z.team, t)).homeAway === "home");
      const ty = (comp.status && comp.status.type) || {};
      LIVE_LU[t] = { match: x.m[2], date: x.m[0], formation: ro.formation || "", lines: L, changes, goals,
        live: ty.state === "in", today: true,
        score: ty.state === "pre" ? "" : (sameSide ? `${h.score}-${a.score}` : `${a.score}-${h.score}`),
        clock: ty.state === "in" ? (ty.shortDetail || "") : ty.state === "post" ? "Finale" : (x.m[4] ? "inizio " + x.m[4] : "") };
      LU_TEAM = LU_TEAM && LIVE_LU[LU_TEAM] ? LU_TEAM : t;
      drawLineup();
    }).catch(() => {});
  }

  /* Ultima formazione ufficiale con il campo disegnato (versione squadra singola) */
  function drawLineup() {
    const avail = TEAMS.filter(t => LINEUPS[t] || LIVE_LU[t]);
    if (!avail.length) return;
    if (!LU_TEAM || !avail.includes(LU_TEAM)) LU_TEAM = avail[0];
    const L = LIVE_LU[LU_TEAM] || LINEUPS[LU_TEAM];
    let sec = document.getElementById("lineup");
    if (!sec) {
      sec = document.createElement("section");
      sec.id = "lineup"; sec.className = "lu";
      const board = document.querySelector(".hero .board");
      if (board) board.parentNode.insertBefore(sec, board.nextSibling);
      else { const nx = document.getElementById("next"); nx.parentNode.insertBefore(sec, nx); }
    }
    const W = 340, H = 460, lines = L.lines || [];
    const sur = n => String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(" ").slice(-1)[0];
    const G = L.goals || [];
    const scored = n => G.filter(g => g.mine && !g.og && sur(g.n) === sur(n)).length;
    const n = lines.length;
    let dots = "";
    lines.forEach((ln, i) => {
      const y = H - 38 - i * ((H - 90) / Math.max(1, n - 1));
      ln.forEach((p, k) => {
        const x = W * (k + 1) / (ln.length + 1);
        const nm = String(p.n).split(" ").slice(-1)[0];
        dots += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="15" class="lp${i === 0 ? " gk" : ""}"/><text class="lj" dy="5">${esc(String(p.j))}</text>` +
          `<text class="ln" dy="30">${p.in ? "↑ " : ""}${esc(nm)}${p.out ? " ↓" : ""}</text>` +
          (scored(p.n) ? `<text class="lg" x="12" y="-10">${"⚽".repeat(Math.min(3, scored(p.n)))}</text>` : "") + `</g>`;
      });
    });
    const [y, m, d] = L.date.split("-");
    sec.style.setProperty("--tc", T[LU_TEAM]);
    const tabs = avail.length > 1 ? `<div class="ltabs">${avail.map(t => `<button type="button" data-t="${t}" aria-pressed="${t === LU_TEAM}">${esc(N[t])}</button>`).join("")}</div>` : "";
    const title = L.live ? `<span class="lvt"><i></i>In campo ora</span>` : (L.today ? "Formazione ufficiale" : "Ultima formazione ufficiale");
    sec.classList.toggle("islive", !!L.live);
    const same = !!(L.live || L.today);
    sec.innerHTML = `<h2><span>${same ? (L.live ? "In campo ora" : "Formazione ufficiale") : title}</span><span class="lf">${esc(L.formation || "")}</span></h2>${tabs}
      <p class="lm"${same ? " hidden" : ""}>${esc(L.match)}${L.score ? ` · <b class="lsc">${esc(L.score)}</b>` : ""}${L.clock ? ` · <span class="lck">${esc(L.clock)}</span>` : ` · ${+d}/${+m}`}</p>
      <svg viewBox="0 0 ${W} ${H}" class="pitch" role="img" aria-label="Formazione ${esc(L.formation || "")}">
        <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" class="pf"/>
        ${[0,1,2,3,4,5,6,7].map(k => `<rect x="1" y="${1 + k * (H - 2) / 8}" width="${W - 2}" height="${(H - 2) / 16}" class="ps"/>`).join("")}
        <g class="pl"><rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10"/><line x1="1" y1="${H / 2}" x2="${W - 1}" y2="${H / 2}"/><circle cx="${W / 2}" cy="${H / 2}" r="42"/>
        <rect x="${W / 2 - 80}" y="${H - 66}" width="160" height="65"/><rect x="${W / 2 - 36}" y="${H - 24}" width="72" height="23"/>
        <rect x="${W / 2 - 80}" y="1" width="160" height="65"/><rect x="${W / 2 - 36}" y="1" width="72" height="23"/></g>
        ${dots}
      </svg>
      ${G.length ? `<div class="lgoals">${[true, false].map(mine => {
          const gs = G.filter(g => g.mine === mine);
          if (!gs.length) return "";
          const lab = mine ? N[LU_TEAM] : (L.match.split(" – ").find(x => !x.includes(N[LU_TEAM])) || "Avversari");
          return `<p><b>⚽ ${esc(lab)}:</b> ${gs.map(g => `${esc(sur(g.n) ? g.n.split(" ").slice(-1)[0] : g.n)} ${esc(g.min)}${g.pen ? " (rig.)" : ""}${g.og ? " (aut.)" : ""}`).join(", ")}</p>`;
        }).join("")}</div>` : ""}
      ${L.changes && L.changes.length ? `<p class="lsub"><b>Cambi:</b> ${L.changes.map(c => `↑ ${esc(c.in)} ↓ ${esc(c.out)}${c.min ? " (" + esc(c.min) + ")" : ""}`).join(" · ")}</p>`
        : L.subs && L.subs.length ? `<p class="lsub"><b>Entrati:</b> ${L.subs.map(p => esc(String(p.n))).join(", ")}</p>` : ""}`;
    sec.querySelectorAll(".ltabs button").forEach(b => b.addEventListener("click", () => { LU_TEAM = b.dataset.t; drawLineup(); }));
  }

  /* Note sulle emittenti: testo espandibile */
  (function notesBox() {
    const nt = document.querySelector("section.notes");
    if (!nt || nt.closest("details")) return;
    const d = document.createElement("details");
    d.className = "hl notesbox";
    d.innerHTML = `<summary><span>Note su emittenti e orari</span><span class="pm" aria-hidden="true"></span></summary>`;
    nt.parentNode.insertBefore(d, nt);
    d.appendChild(nt);
  })();

  /* Offrimi un caffè (Revolut) in fondo alla pagina */
  (function coffee() {
    const wrap = document.querySelector(".wrap");
    if (!wrap || document.getElementById("coffee")) return;
    const c = document.createElement("section");
    c.id = "coffee"; c.className = "coffee";
    const R = "https://revolut.me/mauirock";
    const T3 = [["🍺", "Una", 3, "https://revolut.me/mauirock?currency=EUR&amount=300&note=%F0%9F%8D%BA%20Grazie!"],
      ["🍻", "Due", 6, "https://revolut.me/mauirock?currency=EUR&amount=600&note=%F0%9F%8D%BB%20Grazie!!"],
      ["🍻", "Giro", 15, "https://revolut.me/mauirock?currency=EUR&amount=1500&note=%F0%9F%8D%BB%20Grazie!!!"]];
    c.innerHTML = `<h2>Offrici una birra</h2><p class="cs">MCC Fans è gratis e senza pubblicità. Se ti è utile, il giro lo offri tu? 🍻</p>` +
      `<div class="cmenu"><div class="chd">★ Menu del chiosco ★</div>${T3.map(([i, n, e, u]) => `<a class="citem" href="${u.replace(/&/g, "&amp;")}"><span class="ci" aria-hidden="true">${i}</span><span class="cn">${n}</span><span class="cdots" aria-hidden="true"></span><span class="ce">${e} €</span><span class="cgo" aria-hidden="true">›</span></a>`).join("")}</div>` +
      `<small>Si apre Revolut con l'importo già impostato: basta confermare.</small>`;
    const nt = document.querySelector("section.notes");
    nt ? wrap.insertBefore(c, nt.closest("details") || nt) : wrap.appendChild(c);
  })();

  /* ---------- versione nuova? ricarica subito, senza aspettare la cache ---------- */
  (function autoUpdate() {
    const me = [...document.scripts].find(x => /live\.js\?v=/.test(x.src));
    const cur = me ? (me.src.match(/v=(\d+)/) || [])[1] : null;
    if (!cur) return;
    const check = () => fetch(BASE + "version.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(v => {
      if (!v || !v.v || String(v.v) === cur) return;
      let n = 0; try { n = +sessionStorage.getItem("mcc-upd-" + v.v) || 0; sessionStorage.setItem("mcc-upd-" + v.v, n + 1); } catch (e) {}
      if (n < 2) location.replace(location.pathname + "?v=" + v.v + location.hash);
    }).catch(() => {});
    check();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  })();

  /* ---------- avvio ---------- */
  loadData().then(pollLive);
  setInterval(pollLive, 30000);
  setInterval(loadData, 5 * 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { loadData().then(pollLive); } });
})();
