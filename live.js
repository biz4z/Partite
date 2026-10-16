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
      const img = `<img src="${u.replace(/"/g, "")}" alt="${N[k]}" loading="lazy">`;
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
    sec.innerHTML = `<h2>Notizie${NEWS_OPEN ? `<button type="button" class="anx" aria-label="Chiudi le notizie">Chiudi ✕</button>` : ""}</h2>${shown.map(item).join("")}` +
      (all.length > 3 ? `<button type="button" class="anb">${NEWS_OPEN ? "Mostra meno" : "Mostra tutte (" + all.length + ")"}</button>` : "");
    const close = () => { NEWS_OPEN = false; renderHl(); const y = sec.getBoundingClientRect().top + scrollY - 8; if (y < scrollY) scrollTo({ top: y }); };
    const x = sec.querySelector(".anx");
    if (x) x.addEventListener("click", close);
    const btn = sec.querySelector(".anb");
    if (btn) btn.addEventListener("click", () => { if (NEWS_OPEN) close(); else { NEWS_OPEN = true; renderHl(); } });
  };
  const _rn = renderNext;
  renderNext = function () { _rn(); decorate(); };

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
.calrow{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;max-width:360px}
.callbl{grid-column:1/-1;font:600 .78rem var(--display);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.calpill{display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 14px;border-radius:999px;background:var(--fg);color:var(--bg);font:700 .85rem var(--display);letter-spacing:.08em;text-transform:uppercase;text-decoration:none}
.calpill svg{width:16px;height:16px;display:block;flex:none}
.calpill:focus-visible{outline:2px solid var(--como);outline-offset:2px}
.cal .hint{font-size:.8rem;color:var(--muted);margin:4px 0 8px}`;
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
    upd.after(row);
  }

  renderHl();

  /* ---------- avvio ---------- */
  loadData().then(pollLive);
  setInterval(pollLive, 30000);
  setInterval(loadData, 5 * 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { loadData().then(pollLive); } });
})();
