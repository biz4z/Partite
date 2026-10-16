/* Estensioni della versione GitHub Pages:
   - risultati e classifiche aggiornati da GitHub Actions (data.json)
   - punteggio live di Milan e Como (API pubblica ESPN, se raggiungibile)
   - iscrizione al calendario dell'iPhone (partite.ics) */
(function () {
  "use strict";
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
    (d.fixtures || []).forEach(f => {
      const t = Date.parse(f.date);
      if (M.some(r => r[1] === f.team && Math.abs(Date.parse(r[0]) - t) <= 2 * 864e5)) return;
      const n = M.filter(r => r[1] === f.team && /Serie A calcio/.test(r[3]) && r[0] < f.date).length + 1;
      M.push([f.date, f.team, f.match, `Serie A calcio · ${n}ª giornata`, f.time, "DAZN"]);
      ch = true;
    });
    if (d.odds && JSON.stringify(d.odds) !== JSON.stringify(ODDS)) { ODDS = d.odds; ch = true; }
    if (d.press && JSON.stringify(d.press) !== JSON.stringify(PRESS)) { PRESS = d.press; ch = true; }
    const NW = d.news || {};
    ["milan", "cantu", "como"].forEach(k => {
      if (NW[k] && NW[k].length && JSON.stringify(NW[k]) !== JSON.stringify(NEWS[k])) { NEWS[k] = NW[k]; ch = true; }
    });
    if (S.milan) put(S.milan.eu, st.milan_eu);
    if (S.como) put(S.como.eu, st.como_eu);
    return ch;
  }
  function loadData() {
    return fetch("data.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.ok ? r.json() : null)
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
    const live = liveNow().filter(x => x.teams.some(t => NAME[t]) && LG(x.m[3]));
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
    document.querySelectorAll("#list .month").forEach((sec, i) => {
      if (i === 0) return;
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
    ["milan", "cantu", "como"].forEach(t => {
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
.an h2{position:sticky;top:0;z-index:3;background:var(--bg);display:flex;justify-content:space-between;align-items:center;padding-top:6px;font-family:var(--display);font-weight:600;font-size:.85rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 4px;padding-bottom:6px;border-bottom:1px solid var(--line)}
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
.coffee{display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px 0 6px;text-align:center}
.coffee h2{margin:0;font:700 1.2rem var(--display);letter-spacing:.06em;text-transform:uppercase;color:var(--fg)}
.coffee .cs{margin:0 0 4px;font-size:.85rem;color:var(--muted);max-width:30em}
.ctiers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;width:100%}
.ctier{display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 6px;border-radius:14px;background:#0b1a3a;color:#fff;text-decoration:none;border:2px solid transparent}
.ctier:hover,.ctier:focus-visible{border-color:#e9b949;outline:none}
.ctier .ci{font-size:1.6rem;line-height:1}
.ctier .cn{font:600 .78rem/1.15 var(--display);letter-spacing:.04em;text-transform:uppercase;display:flex;align-items:center;font-size:1rem}
.ctier .ce{font:700 1.05rem var(--display);color:#0b1a3a;background:#e9b949;border-radius:999px;padding:2px 12px}
.coffee small{font-size:.72rem;color:var(--muted)}
/* tema giorno "Ghiaccio" (di sera resta il tema scuro) */
@media (prefers-color-scheme: light){
html:root{--bg:#e9eef6;--surface:#ffffff;--fg:#0b1a3a;--muted:#56657e;--line:#d5deeb;--chip:#eef2f8}
html .st,html .next,html .month .row{box-shadow:0 1px 0 rgba(11,26,58,.04)}
html .st{border-top:4px solid var(--c)}
html .month h2,html .an h2{color:#0b1a3a;border-bottom:2px solid #e9b949}
html nav.filters button[aria-pressed="true"]{background:#0b1a3a;color:#fff;border-color:#0b1a3a}
html .hero{border-radius:0 0 26px 26px}}
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
      `<a class="calpill" href="https://calendar.google.com/calendar/render?cid=${encodeURIComponent("webcal://" + ics)}" target="_blank" rel="noopener">${ico}Android</a>`;
    (document.querySelector("header") || upd).after(row);
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
      board.innerHTML = `<div><div class="bk">${lv ? "In corso" : "Prossima"} · ${esc(N[t])}</div><div class="bm">${esc(x.m[2])}</div><div class="bt">${esc(tvFor(x.m))}</div></div><div class="bc${lv ? " live" : ""}">${esc(String(cd))}<small>${esc(sub)}</small></div>`;
    }
    apply();
    setInterval(tick, 30000);
    const _rn2 = renderNext; renderNext = function () { _rn2(); tick(); };
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
      `<div class="ctiers">${T3.map(([i, n, e, u]) => `<a class="ctier" href="${u.replace(/&/g, "&amp;")}"><span class="ci" aria-hidden="true">${i}</span><span class="cn">${n}</span><span class="ce">${e} €</span></a>`).join("")}</div>` +
      `<small>Si apre Revolut con l'importo già impostato: basta confermare.</small>`;
    wrap.appendChild(c);
  })();

  /* ---------- versione nuova? ricarica subito, senza aspettare la cache ---------- */
  (function autoUpdate() {
    const me = [...document.scripts].find(x => /live\.js\?v=/.test(x.src));
    const cur = me ? (me.src.match(/v=(\d+)/) || [])[1] : null;
    if (!cur) return;
    const check = () => fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(v => {
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
