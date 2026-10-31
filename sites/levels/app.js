/* GovPay Levels — playful career-path explorer. */
(function () {
  "use strict";
  const G = window.GovPay, f = G.fmt;
  const $ = (s, el) => (el || document).querySelector(s);
  const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };

  // Typical-time-in-grade helpers --------------------------------------------
  const GS_STEP_WAIT = [1, 1, 1, 2, 2, 2, 3, 3, 3]; // years from step n to n+1
  function gsLadder(promos, horizon, extra) {
    const out = []; let grade = promos[0], step = 1, sinceStep = 0;
    for (let yr = 0; yr <= horizon; yr++) {
      if (yr > 0 && promos[yr] != null) { grade = promos[yr]; step = 1; sinceStep = 0; }
      else if (yr > 0) { sinceStep++; if (step < 10 && sinceStep >= GS_STEP_WAIT[step - 1]) { step++; sinceStep = 0; } }
      out.push({ yr, profile: Object.assign({ grade, step }, extra), label: `GS-${grade}` });
    }
    return out;
  }
  function milLadder(promos, horizon, yosOffset) {
    const out = []; let g = promos[0];
    for (let yr = 0; yr <= horizon; yr++) {
      if (promos[yr]) g = promos[yr];
      out.push({ yr, profile: { system: "MIL", mgrade: g, yos: yr + (yosOffset || 0) }, label: g });
    }
    return out;
  }

  const PATHS = [
    { key: "civ", name: "Civilian", sub: "General Schedule", ico: "🏛️", system: "GS",
      levels: range(1, 15).map((g) => ({ code: "GS-" + g, p: { system: "GS", grade: g } })),
      career: () => gsLadder({ 0: 7, 1: 9, 2: 11, 3: 12, 8: 13, 14: 14, 20: 15 }, 30, { system: "GS" }),
      careerName: "Typical GS-7 → 12 career ladder, then competitive promotions" },
    { key: "leo", name: "Law Enforcement", sub: "LEO / GS-1811", ico: "🛡️", system: "LEO",
      levels: range(3, 15).map((g) => ({ code: "GS-" + g, p: { system: "LEO", grade: g } })),
      career: () => gsLadder({ 0: 5, 1: 7, 2: 9, 3: 11, 4: 12, 5: 13, 15: 14 }, 30, { system: "LEO", leap: true }),
      careerName: "Criminal investigator ladder to GS-13 journey level, with LEAP" },
    { key: "fws", name: "Skilled Trades", sub: "Federal Wage System", ico: "🔧", system: "FWS",
      levels: range(1, 15).map((g) => ({ code: "WG-" + g, p: { system: "FWS", schedule: "WG", grade: g } })),
      career: () => range(0, 30).map((yr) => ({
        yr, profile: { system: "FWS", schedule: yr < 8 ? "WG" : yr < 15 ? "WL" : "WS", grade: yr < 8 ? 10 : yr < 15 ? 10 : 9,
          step: yr >= 6 ? 5 : yr >= 4 ? 4 : yr >= 2 ? 3 : yr >= 1 ? 2 : 1 }, label: yr < 8 ? "WG-10" : yr < 15 ? "WL-10" : "WS-9" })),
      careerName: "WG-10 mechanic → WL-10 leader → WS-9 supervisor" },
    { key: "ses", name: "Executive", sub: "Senior Executive Service", ico: "⭐", system: "SES",
      levels: [["SES entry", 0], ["SES mid", 0.5], ["SES top", 1]].map(([c, pt]) => ({ code: c, p: { system: "SES", sesPoint: pt } })),
      career: () => range(0, 15).map((yr) => ({ yr, profile: { system: "SES", sesPoint: Math.min(1, yr / 12) }, label: "SES" })),
      careerName: "New SES moving through the band (agency-set)" },
    { key: "enl", name: "Enlisted", sub: "E-1 to E-9", ico: "🎖️", system: "MIL",
      levels: G.MIL_GRADES.enlisted.map((g) => ({ code: g, p: { system: "MIL", mgrade: g } })),
      career: () => milLadder({ 0: "E-1", 1: "E-3", 2: "E-4", 4: "E-5", 8: "E-6", 13: "E-7", 17: "E-8", 21: "E-9" }, 30),
      careerName: "Strong enlisted career: E-1 to E-9 in 21 years" },
    { key: "wo", name: "Warrant Officer", sub: "W-1 to W-5", ico: "🪖", system: "MIL",
      levels: G.MIL_GRADES.warrant.map((g) => ({ code: g, p: { system: "MIL", mgrade: g } })),
      career: () => milLadder({ 0: "W-1", 2: "W-2", 8: "W-3", 14: "W-4", 20: "W-5" }, 22, 8),
      careerName: "Warrant appointment after 8 years enlisted" },
    { key: "off", name: "Officer", sub: "O-1 to O-10", ico: "🎓", system: "MIL",
      levels: G.MIL_GRADES.officer.concat(G.MIL_GRADES.priorEnlisted).map((g) => ({ code: g, p: { system: "MIL", mgrade: g } })),
      career: () => milLadder({ 0: "O-1", 2: "O-2", 4: "O-3", 10: "O-4", 16: "O-5", 22: "O-6" }, 30),
      careerName: "On-time officer promotions to O-6" },
  ];
  const TYPICAL_YOS = { "E-1": 0, "E-2": 1, "E-3": 1, "E-4": 3, "E-5": 6, "E-6": 10, "E-7": 15, "E-8": 18, "E-9": 22,
    "W-1": 8, "W-2": 12, "W-3": 16, "W-4": 22, "W-5": 26, "O-1": 0, "O-2": 2, "O-3": 6, "O-4": 12, "O-5": 18, "O-6": 24,
    "O-7": 26, "O-8": 30, "O-9": 32, "O-10": 34, "O-1E": 6, "O-2E": 8, "O-3E": 12 };

  const state = { year: G.CURRENT_YEAR, loc: "dc", path: "civ", level: 11, step: 1, deps: true, leap: true, careerYr: 10, pins: [], tripStart: G.CURRENT_YEAR + "-07-06", tripNights: 4 };

  function pathObj() { return PATHS.find((p) => p.key === state.path); }
  function colorVar(key) { return `var(--${key})`; }
  function profileFor(level) {
    const p = Object.assign({}, level.p);
    if (p.system === "GS" || p.system === "LEO") p.step = state.step;
    if (p.system === "FWS") p.step = Math.min(state.step, 5);
    if (p.system === "LEO") p.leap = state.leap;
    if (p.system === "MIL") { p.yos = state.yosOverride != null ? state.yosOverride : TYPICAL_YOS[p.mgrade]; p.deps = state.deps; }
    return p;
  }
  const calc = (p) => G.compute(p, state.year, state.loc);

  // ---------- top bar ----------
  function renderBar() {
    $("#season").innerHTML = G.YEARS.map((y) => `<button type="button" role="radio" aria-checked="${y.year === state.year}" data-y="${y.year}" title="${y.note}">${y.year}${y.year > G.CURRENT_YEAR ? "*" : ""}</button>`).join("");
    $("#season").querySelectorAll("button").forEach((b) => (b.onclick = () => { state.year = +b.dataset.y; render(); }));
    if (!state.picker) state.picker = GovPayUI.locationPicker($("#loc"), { value: state.loc, onChange: (id) => { state.loc = id; render(); } });
    else state.picker.set(state.loc);
  }

  // ---------- paths ----------
  function renderPaths() {
    $("#paths").innerHTML = PATHS.map((p) => {
      const vals = p.levels.map((l) => calc(profileFor(l)).annual).filter(Boolean);
      const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      return `<button class="path" type="button" data-k="${p.key}" aria-pressed="${p.key === state.path}" style="--c:${colorVar(p.key)}">
        <span class="ico" aria-hidden="true">${p.ico}</span><b>${p.name}</b><small>${p.sub}</small>
        <div class="range">${short(lo)}–${short(hi)}</div></button>`;
    }).join("");
    $("#paths").querySelectorAll(".path").forEach((b) => (b.onclick = () => {
      state.path = b.dataset.k; const P = pathObj();
      state.level = Math.min(Math.floor(P.levels.length / 2), P.levels.length - 1); state.yosOverride = null; state.careerYr = 10;
      render();
    }));
    document.documentElement.style.setProperty("--track", colorVar(state.path));
  }

  // ---------- deck ----------
  function pinIndex(path, code) { return state.pins.findIndex((pp) => pp.path === path && pp.code === code); }
  function renderDeck() {
    const P = pathObj();
    $("#deckTitle").textContent = `${P.ico} ${P.name} levels`;
    $("#deckSub").textContent = P.system === "MIL" ? "Cards show pay at a typical point in a career, including BAH and BAS." : P.system === "SES" ? "SES has one pay band, no steps." : `Cards show step ${P.system === "FWS" ? Math.min(state.step, 5) : state.step}. You can change the step below.`;
    const vals = P.levels.map((l) => calc(profileFor(l)).annual || 0);
    const max = Math.max.apply(null, vals);
    $("#deck").innerHTML = P.levels.map((l, i) => {
      const r = calc(profileFor(l));
      const pi = pinIndex(P.key, l.code);
      return `<button class="lvl ${r.annual ? "" : "locked"}" type="button" data-i="${i}" aria-pressed="${i === state.level}" style="--t:${(i + 1) / P.levels.length}">
        ${pi >= 0 ? `<span class="vs-mark" title="In head-to-head">VS ${"AB"[pi]}</span>` : ""}
        <div class="code">${l.code}</div>
        <div><div class="pay">${r.annual ? f.usd(r.annual) : "locked"}<small>${r.annual ? "per year" : "needs more years"}</small></div>
        <div class="meter"><span style="width:${((r.annual || 0) / max) * 100}%"></span></div></div></button>`;
    }).join("");
    $("#deck").querySelectorAll(".lvl").forEach((b) => (b.onclick = () => {
      state.level = +b.dataset.i; state.yosOverride = null; renderDeck(); renderSheet();
    }));
  }
  function toggleCurrentPin() {
    const P = pathObj(), l = P.levels[state.level];
    const idx = pinIndex(P.key, l.code);
    if (idx >= 0) state.pins.splice(idx, 1);
    else { state.pins.push({ path: P.key, code: l.code, p: profileFor(l), name: P.name }); if (state.pins.length > 2) state.pins.shift(); }
    renderDeck(); fillSheet(); renderVersus();
  }

  // ---------- sheet ----------
  // Built once per level; sliders only refresh numbers (fillSheet) so dragging stays smooth.
  const STAT_COLORS = { base: "var(--track)", locality: "var(--civ)", leap: "var(--ses)", bah: "var(--wo)", bas: "var(--fws)" };
  function renderSheet() {
    const P = pathObj(), p = profileFor(P.levels[state.level]);
    const knobs = [];
    if (P.system === "GS" || P.system === "LEO" || P.system === "FWS") {
      const maxStep = P.system === "FWS" ? 5 : 10;
      knobs.push(`<label class="knob">Step <input type="range" min="1" max="${maxStep}" value="${Math.min(state.step, maxStep)}" data-step> <b data-stepv>${Math.min(state.step, maxStep)}</b></label>`);
    }
    if (P.system === "LEO") knobs.push(`<label class="knob"><input type="checkbox" data-leap ${state.leap ? "checked" : ""}> LEAP</label>`);
    if (P.system === "MIL") {
      knobs.push(`<label class="knob">Years <input type="range" min="0" max="40" value="${p.yos}" data-yos> <b data-yosv>${p.yos}</b></label>`);
      knobs.push(`<label class="knob"><input type="checkbox" data-deps ${state.deps ? "checked" : ""}> Dependents</label>`);
    }
    $("#sheet").innerHTML = `
      <div>
        <p class="eyebrow">${P.name} · ${G.location(state.loc).name} · ${state.year}</p>
        <div class="lvl-nav"><button type="button" class="nav-btn" data-nav="-1" aria-label="Previous level" ${state.level <= 0 ? "disabled" : ""}>−</button><h2 id="sheetTitle"></h2><button type="button" class="nav-btn" data-nav="1" aria-label="Next level" ${state.level >= P.levels.length - 1 ? "disabled" : ""}>+</button></div>
        <div id="sheetNums"></div>
        <div class="knobs">${knobs.join("")}</div>
        <button type="button" class="vs-add" id="vsAdd"></button>
        <div class="fine" id="sheetNotes"></div>
      </div>
      <div class="chart-card" id="chartCard"></div>`;
    const sh = $("#sheet");
    sh.querySelectorAll("[data-nav]").forEach((b) => (b.onclick = () => { state.level = Math.max(0, Math.min(P.levels.length - 1, state.level + +b.dataset.nav)); state.yosOverride = null; renderDeck(); renderSheet(); }));
    const st = $("[data-step]", sh); if (st) st.oninput = () => { state.step = +st.value; $("[data-stepv]", sh).textContent = st.value; renderPaths(); renderDeck(); fillSheet(); };
    const yo = $("[data-yos]", sh); if (yo) yo.oninput = () => { state.yosOverride = +yo.value; $("[data-yosv]", sh).textContent = yo.value; renderDeck(); fillSheet(); };
    const lp = $("[data-leap]", sh); if (lp) lp.onchange = () => { state.leap = lp.checked; render(); };
    const dp = $("[data-deps]", sh); if (dp) dp.onchange = () => { state.deps = dp.checked; render(); };
    $("#vsAdd").onclick = toggleCurrentPin;
    fillSheet();
    renderChart();
  }
  function fillSheet() {
    const P = pathObj(), l = P.levels[state.level], r = calc(profileFor(l));
    const total = r.annual || 1;
    $("#sheetTitle").textContent = r.title;
    $("#sheetNums").innerHTML = `
      <div class="big">${r.annual ? f.usd(r.annual) : "Locked"}</div>
      <div class="per">${r.annual ? `${f.usd(r.annual / 12)} / month${r.hourly ? ` · ${f.usd2(r.hourly)} / hour` : ""}` : ""} <span class="tag ${r.status}">${G.STATUS_INFO[r.status].label}</span></div>
      ${r.rows.map((row) => `<div class="stat"><div class="row"><span>${row.label}${row.taxFree ? " 🛡 tax-free" : ""}</span><b>${f.usd(row.annual)}</b></div><div class="track"><span style="width:${(row.annual / total) * 100}%;background:${STAT_COLORS[row.key]}"></span></div></div>`).join("")}`;
    $("#sheetNotes").innerHTML = r.notes.map((n) => `<p>${n}</p>`).join("");
    const pi = pinIndex(P.key, l.code);
    const btn = $("#vsAdd");
    btn.setAttribute("aria-pressed", String(pi >= 0));
    btn.innerHTML = pi >= 0 ? `✓ In head-to-head (${"AB"[pi]}) · tap to remove` : state.pins.length === 1 ? `⚔️ Compare with ${state.pins[0].code}` : state.pins.length === 2 ? "⚔️ Swap into head-to-head" : "⚔️ Add to head-to-head";
  }

  // ---------- career chart ----------
  // Chart is drawn once; the slider only moves the cursor and readout.
  function renderChart() {
    const P = pathObj();
    const pts = P.career().map((c) => {
      const r = calc(Object.assign({ deps: state.deps }, c.profile));
      return { yr: c.yr, label: c.label, annual: r.annual || 0, title: r.title };
    });
    const horizon = pts[pts.length - 1].yr;
    state.careerYr = Math.min(state.careerYr, horizon);
    const W = 640, H = 300, m = { l: 56, r: 16, t: 20, b: 30 };
    const maxV = Math.max.apply(null, pts.map((p) => p.annual)) * 1.08;
    const x = (yr) => m.l + (yr / horizon) * (W - m.l - m.r);
    const y = (v) => H - m.b - (v / maxV) * (H - m.t - m.b);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.yr).toFixed(1)},${y(p.annual).toFixed(1)}`).join("");
    const area = `${line}L${x(horizon)},${y(0)}L${x(0)},${y(0)}Z`;
    const grid = range(0, 4).map((i) => (maxV / 4) * i);
    const ms = pts.filter((p, i) => i === 0 || p.label !== pts[i - 1].label);
    const card = $("#chartCard");
    card.innerHTML = `
      <h3><span>Career path</span><span class="fine">${P.careerName}</span></h3>
      <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pay over a ${horizon}-year career">
        <g class="grid">${grid.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>
        <g class="axis">${grid.map((v) => `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`).join("")}
          ${range(0, horizon).filter((v) => v % 5 === 0).map((v) => `<text x="${x(v)}" y="${H - 8}" text-anchor="middle">yr ${v}</text>`).join("")}</g>
        <path class="area" d="${area}"/><path class="line" d="${line}"/>
        <g class="ms">${ms.map((p, i) => `<circle cx="${x(p.yr)}" cy="${y(p.annual)}" r="5"/><text x="${x(p.yr) + (i % 2 ? 6 : -6)}" y="${y(p.annual) - 10}" text-anchor="${i % 2 ? "start" : "end"}">${p.label}</text>`).join("")}</g>
        <g class="cursor"><line y1="${m.t}" y2="${H - m.b}"/><circle r="7"/></g>
      </svg>
      <input class="yearslider" type="range" min="0" max="${horizon}" step="1" value="${state.careerYr}" aria-label="Year in career">
      <div class="readout"></div>
      <p class="fine">Drag the slider to move through a career. Uses ${state.year} tables (today's dollars). Real promotions and timing vary.</p>`;
    const cLine = $(".cursor line", card), cDot = $(".cursor circle", card), readout = $(".readout", card), first = pts[0].annual;
    const move = () => {
      const cur = pts.find((p) => p.yr === state.careerYr) || pts[0];
      cLine.setAttribute("x1", x(cur.yr)); cLine.setAttribute("x2", x(cur.yr));
      cDot.setAttribute("cx", x(cur.yr)); cDot.setAttribute("cy", y(cur.annual));
      readout.innerHTML = `<span>Year ${cur.yr}: <b>${cur.title}</b></span><span><b>${f.usd(cur.annual)}</b> / yr · ${first ? "+" + Math.round(((cur.annual - first) / first) * 100) + "% since day one" : ""}</span>`;
    };
    $(".yearslider", card).oninput = (e) => { state.careerYr = +e.target.value; move(); };
    move();
  }

  // ---------- versus + tray ----------
  function renderVersus() {
    renderTray();
    const el = $("#versus");
    if (state.pins.length < 2) {
      el.innerHTML = `<div class="vs-empty">⚔️ <b>Head to head:</b> open any level and tap <b>Add to head-to-head</b>. Add two levels, from the same path or different ones. ${state.pins.length === 1 ? `<br><b>${state.pins[0].name} ${state.pins[0].code}</b> is ready. Pick one more.` : ""}</div>`;
      return;
    }
    const [a, b] = state.pins.map((pp) => Object.assign({ r: calc(pp.p) }, pp));
    const d = (b.r.annual || 0) - (a.r.annual || 0);
    const side = (s) => `<div class="vs-side" style="--c:${colorVar(s.path)}"><div class="fine">${s.name}</div><div class="name">${s.r.title}</div><div class="amt">${f.usd(s.r.annual)}</div><div class="fine">${s.r.rows.map((r) => `${r.label}: ${f.usd(r.annual)}`).join("<br>")}</div></div>`;
    el.innerHTML = `<div class="vs-card">${side(a)}<div class="vs-badge">VS</div>${side(b)}
      <div class="vs-result">${d === 0 ? "Dead even." : `<b>${(d > 0 ? b : a).r.title}</b> earns <b>${f.usd(Math.abs(d))}</b> more a year (cash only, in ${G.location(state.loc).name}).`}</div></div>`;
  }
  function renderTray() {
    const el = $("#vsTray");
    if (!state.pins.length) { el.hidden = true; return; }
    el.hidden = false;
    const slot = (pp, i) => pp
      ? `<span class="tray-slot" style="--c:${colorVar(pp.path)}"><b>${"AB"[i]}</b> ${pp.code}<button type="button" data-rm="${i}" aria-label="Remove ${pp.code}">×</button></span>`
      : `<span class="tray-slot empty"><b>B</b> pick another level</span>`;
    el.innerHTML = `<div class="wrap tray-inner"><span class="tray-label">⚔️ Head to head</span>${slot(state.pins[0], 0)}<span class="tray-vs">vs</span>${slot(state.pins[1], 1)}
      <button type="button" class="tray-go" ${state.pins.length < 2 ? "disabled" : ""}>See result ↓</button></div>`;
    el.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { state.pins.splice(+b.dataset.rm, 1); renderDeck(); fillSheet(); renderVersus(); }));
    $(".tray-go", el).onclick = () => $("#versus").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---------- side quests ----------
  function renderQuests() {
    const t = G.trip(state.year, state.loc, state.tripStart, state.tripNights);
    const pd = G.perDiem(state.year, state.loc, +state.tripStart.slice(5, 7));
    $("#tripQuest").innerHTML = `<h3>🧳 Trip ticket</h3><p class="muted">Per diem for official travel to your selected location.</p>
      <div class="inputs"><label>Arrive<input type="date" value="${state.tripStart}" data-ts></label><label>Nights<input type="number" min="0" max="60" value="${state.tripNights}" data-tn></label></div>
      <div class="ticket"><div class="main">
        <div class="kv"><span>Area</span><b title="${pd.areaDetail}">${pd.areaName}</b></div>
        <div class="kv"><span>Lodging (max/night)</span><b>${f.usd(pd.lodging)}</b></div>
        <div class="kv"><span>M&amp;IE (per day · 75% first/last)</span><b>${f.usd(pd.mie)} · ${f.usd2(pd.firstLastMie)}</b></div>
        <div class="kv"><span>Lodging total</span><b>${f.usd(t.lodging)}</b></div>
        <div class="kv"><span>M&amp;IE total</span><b>${f.usd2(t.mie)}</b></div>
      </div><div class="stub"><span class="fine">TOTAL</span><b>${f.usd(t.total)}</b><span class="tag ${pd.status}">${G.STATUS_INFO[pd.status].label}</span></div></div>`;
    $("[data-ts]").onchange = (e) => { state.tripStart = e.target.value; renderQuests(); };
    $("[data-tn]").onchange = (e) => { state.tripNights = Math.max(0, Math.min(60, +e.target.value || 0)); renderQuests(); };

    const grades = G.MIL_GRADES.enlisted.concat(G.MIL_GRADES.warrant, G.MIL_GRADES.officer.slice(0, 7));
    const vals = grades.map((g) => G.bah(state.year, g, state.deps, state.loc));
    const max = Math.max.apply(null, vals.map((v) => v.monthly));
    $("#housingQuest").innerHTML = `<h3>🏠 Housing (BAH)</h3><p class="muted">${vals[0].mhaName} · ${state.deps ? "with" : "without"} dependents · BAS ${f.usd2(G.bas(state.year, "E-5"))} enlisted / ${f.usd2(G.bas(state.year, "O-1"))} officer per month. <span class="tag ${vals[0].status}">${G.STATUS_INFO[vals[0].status].label}</span></p>
      <div class="bars-wrap"><div class="bars">${vals.map((v, i) => `<div style="height:${(v.monthly / max) * 100}%" title="${grades[i]}: ${f.usd(v.monthly)}/mo"><span>${grades[i].replace("-", "")}</span></div>`).join("")}</div></div>
      <p class="fine">Hover a bar to see the monthly amount. BAH is tax-free and changes by ZIP code, rank and dependency status.</p>`;
  }

  function short(n) { return n >= 1000 ? "$" + Math.round(n / 1000) + "k" : "$" + Math.round(n); }
  function render() { renderBar(); renderPaths(); renderDeck(); renderSheet(); renderVersus(); renderQuests(); }
  render();
})();
