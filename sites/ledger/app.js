/* Paybook app · "my pay" first, in the paper / ink / highlighter look. */
(function () {
  "use strict";
  const G = window.GovPay, f = G.fmt;
  const $ = (s, el) => (el || document).querySelector(s);
  const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ALL_MIL = [].concat(G.MIL_GRADES.enlisted, G.MIL_GRADES.warrant, G.MIL_GRADES.officer, G.MIL_GRADES.priorEnlisted);
  const SYSTEMS = [
    { k: "GS", t: "General Schedule", s: "Most federal civilians, GS-1 to GS-15" },
    { k: "LEO", t: "Law enforcement", s: "LEOs and criminal investigators" },
    { k: "FWS", t: "Trades (wage grade)", s: "WG, WL and WS hourly jobs" },
    { k: "SES", t: "Senior Executive", s: "SES members" },
    { k: "MIL", t: "Military", s: "Enlisted, warrant officers, officers" },
  ];
  const KIND = { step: "Next step", grade: "Promotion", top: "Top of grade", yos: "Longevity raise", promo: "Promotion", role: "New role" };
  const STORE = "paybook.v1";

  const state = {
    year: G.CURRENT_YEAR, loc: "dc", me: null, preview: null, draft: null, editing: false, assumed: [],
    period: "year", tab: "tables", tableKind: null, tripStart: G.CURRENT_YEAR + "-04-14", tripNights: 3,
    b: Object.assign({}, G.DEFAULT_PROFILE, { system: "MIL", mgrade: "O-3", yos: 8, deps: true }),
    tax: { filing: "single", state: null, county: null, fers: "4.4", tspPct: 5, tspType: "trad", health: "", ownRate: "", otherRate: "", chosen: false },
    thOpen: false,
  };
  load();

  // ------------------------------------------------------------ persistence
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { /* storage off */ }
    if (d && d.tax) Object.assign(state.tax, d.tax);          // tax settings are personal: always from this browser
    const q = new URLSearchParams(location.hash.slice(1));
    if (q.has("s")) { fromHash(q); return; }                   // a shared link sets the job and place
    if (d && d.me) { state.me = d.me; state.loc = d.loc || state.loc; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ me: state.me, loc: state.loc, tax: state.tax })); } catch (e) { /* storage off */ }
    writeHash();
  }
  function writeHash() {
    const p = state.me; if (!p) return;
    const parts = [`y=${state.year}`, `l=${state.loc}`, `s=${p.system}`];
    if (p.system === "MIL") parts.push(`g=${p.mgrade}`, `yos=${p.yos}`, `d=${p.deps ? 1 : 0}`);
    else if (p.system === "SES") parts.push(`pt=${p.sesPoint}`);
    else { parts.push(`g=${p.grade}`, `st=${p.step}`); if (p.system === "FWS") parts.push(`sch=${p.schedule}`); if (p.system === "LEO") parts.push(`leap=${p.leap ? 1 : 0}`); }
    history.replaceState(null, "", "#" + parts.join("&"));
  }
  function fromHash(q) {
    state.year = G.YEARS.some((y) => y.year === +q.get("y")) ? +q.get("y") : state.year;
    if (G.locations().some((l) => l.id === q.get("l"))) state.loc = q.get("l");
    const p = Object.assign({}, G.DEFAULT_PROFILE, { system: q.get("s") });
    if (p.system === "MIL") { p.mgrade = q.get("g") || p.mgrade; p.yos = +q.get("yos") || 0; p.deps = q.get("d") !== "0"; }
    else if (p.system === "SES") p.sesPoint = +q.get("pt") || 0;
    else { p.grade = +q.get("g") || p.grade; p.step = +q.get("st") || p.step; p.schedule = q.get("sch") || p.schedule; p.leap = q.get("leap") !== "0"; }
    if (SYSTEMS.some((s) => s.k === p.system)) state.me = p;
  }

  // ------------------------------------------------------------ shared controls
  function stepper(name, values, current, label, fmtv) {
    const i = values.findIndex((v) => String(v) === String(current));
    return `<div class="pb-stepper" data-stepper="${name}">
      <button type="button" data-dir="-1" aria-label="Lower ${label}" ${i <= 0 ? "disabled" : ""}>−</button>
      <select aria-label="${label}">${values.map((v) => `<option value="${v}" ${String(v) === String(current) ? "selected" : ""}>${fmtv ? fmtv(v) : v}</option>`).join("")}</select>
      <button type="button" data-dir="1" aria-label="Raise ${label}" ${i >= values.length - 1 ? "disabled" : ""}>+</button></div>`;
  }
  const field = (label, inner) => `<div class="pb-field">${label ? `<span class="pb-field__label">${label}</span>` : ""}${inner}</div>`;
  function gradeControls(p) {
    if (p.system === "GS" || p.system === "LEO") {
      const minG = p.system === "LEO" ? 3 : 1; if (p.grade < minG) p.grade = minG; if (p.step > 10) p.step = 10;
      return field("Grade", stepper("grade", range(minG, 15), p.grade, "grade", (v) => "GS-" + v)) +
        field("Step", stepper("step", range(1, 10), p.step, "step", (v) => "Step " + v)) +
        (p.system === "LEO" ? field("", `<label class="check"><input type="checkbox" data-leap ${p.leap ? "checked" : ""}> I get LEAP (25%)</label>`) : "");
    }
    if (p.system === "FWS") {
      const max = G.FWS_SCHEDULES[p.schedule].grades; if (p.grade > max) p.grade = max; if (p.step > 5) p.step = 2;
      return field("Schedule", `<select class="pb-input pb-select" data-sched>${Object.keys(G.FWS_SCHEDULES).map((k) => `<option value="${k}" ${k === p.schedule ? "selected" : ""}>${k} · ${G.FWS_SCHEDULES[k].name}</option>`).join("")}</select>`) +
        field("Grade", stepper("grade", range(1, max), p.grade, "grade", (v) => p.schedule + "-" + v)) +
        field("Step", stepper("step", range(1, 5), p.step, "step", (v) => "Step " + v));
    }
    if (p.system === "SES") return field("Where you are in the band", `<div class="rangewrap"><input type="range" min="0" max="1" step="0.05" value="${p.sesPoint}" data-ses aria-label="Position in the SES band"><output class="num">${Math.round(p.sesPoint * 100)}%</output></div>`);
    return field("Rank", stepper("rank", ALL_MIL, p.mgrade, "rank")) +
      field("Years of service", stepper("yos", range(0, 40), p.yos, "years of service", (v) => v + (v === 1 ? " year" : " years"))) +
      field("Dependents", `<div class="pb-seg" role="radiogroup" aria-label="Dependents"><button type="button" role="radio" data-deps="0" aria-checked="${!p.deps}">None</button><button type="button" role="radio" data-deps="1" aria-checked="${!!p.deps}">With dependents</button></div>`);
  }
  function wireGrade(el, p, onChange) {
    el.querySelectorAll("[data-stepper]").forEach((w) => {
      const sel = $("select", w), name = w.dataset.stepper;
      const apply = (v) => {
        if (name === "grade") p.grade = +v; else if (name === "step") p.step = +v; else if (name === "rank") p.mgrade = v; else if (name === "yos") p.yos = +v;
        onChange();
      };
      sel.onchange = () => apply(sel.value);
      w.querySelectorAll("button").forEach((b) => (b.onclick = () => { const i = sel.selectedIndex + +b.dataset.dir; if (i >= 0 && i < sel.options.length) apply(sel.options[i].value); }));
    });
    const lp = $("[data-leap]", el); if (lp) lp.onchange = () => { p.leap = lp.checked; onChange(); };
    const sc = $("[data-sched]", el); if (sc) sc.onchange = () => { p.schedule = sc.value; onChange(); };
    const sr = $("[data-ses]", el); if (sr) sr.oninput = () => { p.sesPoint = +sr.value; sr.nextElementSibling.textContent = Math.round(p.sesPoint * 100) + "%"; onChange(true); };
    el.querySelectorAll("[data-deps]").forEach((b) => (b.onclick = () => { p.deps = b.dataset.deps === "1"; onChange(); }));
  }
  function stamp(status, mil) {
    if (status === "verified") return '<span class="pb-stamp pb-stamp--official">Official</span>';
    if (status === "projected") return '<span class="pb-stamp pb-stamp--proposed">Proposed</span>';
    if (status === "simulated") return '<span class="pb-stamp pb-stamp--estimate">Simulated</span>';
    return '<span class="pb-stamp pb-stamp--estimate">Estimate</span>';
  }
  function placeName(id) { return G.location(id).name; }
  function sourceLine(year) { return year === 2025 ? "EO 14132" : year === 2026 ? "EO 14368" : "projected"; }

  // ------------------------------------------------------------ first visit
  function renderWelcome() {
    const el = $("#welcome");
    const d = state.draft || (state.draft = { system: null, grade: 9, step: 1, schedule: "WG", leap: true, mgrade: "E-4", yos: 3, deps: true, sesPoint: 0.3 });
    const peek = d.system ? G.compute(d, state.year, state.loc) : null;
    el.innerHTML = `<div class="welcome">
      <div class="pb-section-label"><b>paybook</b> · federal &amp; military pay</div>
      <h1>${state.editing ? "Update your pay details." : 'What does your job <span class="hl">actually pay</span>?'}</h1>
      <p class="lede">Type your grade, rank or a job posting. You'll see your pay for where you work, and what your next step or promotion is worth.</p>
      <div id="askBig"></div>
      <div class="or">or answer three questions</div>
      <ol class="steps">
        <li class="step"><h2><span class="label">01</span> How are you paid?</h2>
          <div class="sys-list">${SYSTEMS.map((s) => `<button type="button" class="sys" data-sys="${s.k}" aria-pressed="${d.system === s.k}"><b>${s.t}</b><small>${s.s}</small></button>`).join("")}</div></li>
        <li class="step ${d.system ? "" : "is-off"}"><h2><span class="label">02</span> ${d.system === "MIL" ? "Your rank" : d.system === "SES" ? "Your place in the SES band" : "Your grade and step"}</h2>
          <div class="controls" id="wGrade">${d.system ? gradeControls(d) : '<p class="sub" style="margin:0">Answer 01 first.</p>'}</div>
          ${d.system && d.system !== "MIL" && d.system !== "SES" ? '<p class="sub">Not sure of your step? It\'s on your SF-50 and your Leave and Earnings Statement.</p>' : ""}</li>
        <li class="step ${d.system ? "" : "is-off"}"><h2><span class="label">03</span> Where you work</h2><div id="wPicker"></div></li>
      </ol>
      <div class="done-row"><div class="peek">${peek && peek.annual ? `That's about <span class="hl num">${d.system === "MIL" ? f.usd(peek.annual / 12) + "</span> a month" : f.usd(peek.annual) + "</span> a year"}.` : ""}</div>
        <div style="display:flex;gap:8px">${state.editing ? '<button type="button" class="pb-btn pb-btn--line" id="wCancel">Cancel</button>' : ""}<button type="button" class="pb-btn" id="wDone" ${d.system ? "" : "disabled"}>Show my pay</button></div></div>
    </div>`;
    PB.searchBox($("#askBig", el), { getLoc: () => state.loc, getYear: () => state.year, onPick: pickFromSearch });
    el.querySelectorAll("[data-sys]").forEach((b) => (b.onclick = () => { d.system = b.dataset.sys; renderWelcome(); }));
    if (d.system) {
      wireGrade($("#wGrade", el), d, (slider) => { if (!slider) renderWelcome(); });
      PB.locationPicker($("#wPicker", el), { value: state.loc, getYear: () => state.year, onChange: (id) => { state.loc = id; renderWelcome(); } });
    }
    $("#wDone", el).onclick = () => { setMe(Object.assign({}, d), []); window.scrollTo(0, 0); };
    const c = $("#wCancel", el); if (c) c.onclick = () => { state.editing = false; state.draft = null; render(); };
  }
  // Anonymous usage counts (shared/analytics.js, /privacy). Optional: the app works the same without it.
  const A = window.PaybookAnalytics || null;
  const track = (name, props) => { if (A) A.track(name, props); };
  function setMe(p, assumed) { state.me = p; state.assumed = assumed || []; state.preview = null; state.editing = false; state.draft = null; save(); render(); if (A) A.profile(p, state.loc); }
  function pickFromSearch(r) {
    if (r.locId) state.loc = r.locId;
    if (r.kind === "profile") { state.posting = null; setMe(r.profile, r.assumed); }
    else if (r.kind === "posting") { state.posting = r; if (A) track("posting", { sys: r.system, family: r.series.slice(0, 2) + "00", band: A.band({ system: r.system, grade: r.grades[r.grades.length - 1], schedule: r.schedule }) }); setMe({ system: r.system, grade: r.grades[0], step: 1, leap: r.system === "LEO", schedule: r.schedule }, ["step 1"]); }
    else if (r.kind === "place" && state.me) { save(); render(); }
  }

  // ------------------------------------------------------------ my pay
  const shown = () => state.preview || state.me;
  function renderControls() {
    const p = shown(), el = $("#controls");
    el.innerHTML = field("Pay system", `<select class="pb-input pb-select" id="sysSel">${SYSTEMS.map((s) => `<option value="${s.k}" ${s.k === p.system ? "selected" : ""}>${s.t}</option>`).join("")}</select>`) + gradeControls(p);
    $("#sysSel").onchange = (e) => { p.system = e.target.value; changed(); };
    wireGrade(el, p, (slider) => changed(slider));
  }
  function changed(slider) {
    state.assumed = [];
    if (!state.preview) save();
    if (slider) { renderStub(); renderLadder(); return; }
    renderDash();
  }
  function renderStub() {
    const p = shown(), r = G.compute(p, state.year, state.loc), mil = p.system === "MIL", el = $("#stub");
    if (!state.periodTouched) state.period = mil ? "month" : "year";
    if (mil && state.period === "hour") state.period = "month";
    if (r.annual == null) { el.innerHTML = `<div class="pb-stub__head"><span>Pay stub · ${state.year}</span></div><p>${esc(r.notes[0])}</p>`; $("#notes").innerHTML = ""; return; }
    const prev = G.YEARS.some((y) => y.year === state.year - 1) ? G.compute(p, state.year - 1, state.loc) : null;
    const yoy = prev && prev.annual ? r.annual - prev.annual : null;
    const periods = mil ? [["month", "Month"], ["check", "Paycheck"], ["year", "Year"]] : [["year", "Year"], ["month", "Month"], ["check", "Paycheck"], ["hour", "Hour"]];
    const div = { year: 1, month: 12, check: mil ? 24 : 26, hour: 2087 }[state.period];
    const unit = { year: "a year", month: "a month", check: mil ? "per paycheck (1st and 15th)" : "per paycheck, every 2 weeks", hour: "an hour" }[state.period];
    const big = r.annual / div;
    const fmtBig = state.period === "hour" ? f.usd2(big) : f.usd(big);
    const perLine = mil
      ? `${unit} · RMC about ${f.usd(r.mil.rmc)} a year, counting the tax advantage`
      : `${unit}${state.period !== "year" ? " · " + f.usd(r.annual) + " a year" : " · " + f.usd(r.annual / 26) + " per paycheck"}${r.hourly && state.period !== "hour" ? " · " + f.usd2(r.hourly) + " an hour" : ""}`;
    const rowAmt = (a) => (state.period === "hour" ? f.usd2(a / div) : mil && state.period !== "year" ? f.usd2(a / div) : f.usd(a / div));
    el.innerHTML = `
      <div class="pb-stub__head"><span>${state.preview ? "What if · " : "Pay stub · "}${state.year}</span>${stamp(r.status, mil)}</div>
      <div class="pb-stub__who">${esc(r.title)}<small>${esc(placeName(state.loc))}</small></div>
      <div class="pb-stub__number"><span class="hl">${fmtBig}</span></div>
      <div class="pb-stub__per">${perLine}</div>
      <div class="pb-seg" role="radiogroup" aria-label="Show amounts per">${periods.map(([k, t]) => `<button type="button" role="radio" data-per="${k}" aria-checked="${state.period === k}">${t}</button>`).join("")}</div>
      <ul class="pb-ledger">${r.rows.map((row) => `<li><span>${esc(row.label)}${row.taxFree ? '<span class="pb-taxfree">tax-free</span>' : ""}</span><span>${rowAmt(row.annual)}</span></li>`).join("")}
        <li class="pb-ledger__total"><span>Total</span><span>${rowAmt(r.annual)}</span></li></ul>
      ${yoy != null ? `<p style="margin:var(--s3) 0 0;font-size:15px"><span class="pb-delta ${yoy >= 0 ? "pb-delta--up" : "pb-delta--down"}">${yoy >= 0 ? "+" : "−"}${f.usd(Math.abs(yoy))}</span> a year compared with ${state.year - 1} <span style="color:var(--ink-2)">(${(yoy / prev.annual * 100).toFixed(1)}%)</span></p>` : ""}
      <div id="th"></div>
      <div class="pb-stub__foot"><span>paybook · ${sourceLine(state.year)}${mil ? (r.mil && r.mil.bahStatus === "verified" ? " · BAH: DTMO" : " · BAH est.") : ""} · take-home est.</span><span>Not affiliated with the U.S. government</span></div>`;
    renderTakeHome(r, p);
    el.querySelectorAll("[data-per]").forEach((b) => (b.onclick = () => { state.period = b.dataset.per; state.periodTouched = true; renderStub(); }));
    $("#notes").innerHTML = `${state.assumed.length ? `<p class="sub" style="margin:var(--s2) 0"><b style="color:var(--ink)">Assumed:</b> ${esc(state.assumed.join(", "))}. Change it above.</p>` : ""}
      <details class="pb-details"><summary>How this is calculated</summary><div>${r.notes.map((n) => `<p style="margin:0 0 6px">${esc(n)}</p>`).join("")}</div></details>
      <p class="sub" style="margin-top:var(--s3)"><a href="#" class="pb-link pb-link--ink" data-edit>Start over with the three questions</a></p>`;
  }
  // ------------------------------------------------------------ take-home
  const T = window.GovPayTax;
  function taxOpts() {
    const t = state.tax, loc = G.location(state.loc);
    if (!t.chosen) { t.state = T.defaultState(loc.state); t.county = T.PLACE_COUNTY[loc.id] || mdCountyOf(loc) || (loc.state === "MD" ? "Montgomery" : t.county); }
    if (t.state === "MD" && !t.county) t.county = "Montgomery";
    return Object.assign({}, t, { dutyState: loc.state });
  }
  // "Howard County, MD" (or Columbia, MD, in Howard) -> "Howard"; "Baltimore city, MD" -> "Baltimore City"
  function mdCountyOf(loc) {
    if (loc.state !== "MD" || !(loc.kind === "county" || loc.census)) return null;
    const c = loc.census ? loc.county : loc.short;              // a Census city uses its main county
    if (c === "Baltimore city") return "Baltimore City";
    if (c === "Baltimore County") return "Baltimore County";
    const n = c.replace(/ County$/, "");
    return T.MD_COUNTIES[n] != null ? n : null;
  }
  const round10 = (n) => f.usd(Math.round(n / 10) * 10);
  function renderTakeHome(r, p) {
    const el = $("#th"); if (!el) return;
    const mil = p.system === "MIL", o = taxOpts(), e = T.estimate(T.payFrom(r, p), o);
    const stName = o.state === "NONE" ? "no state income tax" : T.STATES[o.state] && T.STATES[o.state].none ? `${T.STATES[o.state].name}: no state income tax` : o.state === "OTHER" ? (o.otherRate ? `state tax ${o.otherRate}%` : "state tax not included") : T.STATES[o.state].name + (o.state === "MD" ? ` + ${o.county}${/(City|County)$/.test(o.county) ? "" : " County"}` : "");
    const parts = [o.filing === "mfj" ? "Married, one income" : "Single", "standard deduction", stName];
    if (!mil) parts.push(`FERS ${(+o.fers + (p.system === "LEO" ? 0.5 : 0)).toFixed(1)}%`);
    parts.push(`TSP ${o.tspPct}% ${o.tspType === "roth" ? "Roth" : "traditional"}`);
    if (o.health) parts.push(`health $${o.health}/paycheck`);
    const assumptions = e.override ? `Using your own income tax rate of ${o.ownRate}%. ${parts.slice(-2).join(", ")}.` : parts.join(", ") + ".";
    el.innerHTML = `
      <div class="pb-takehome th">
        <div>Take-home is about <b>${round10(e.monthly)}</b> a month <span>(${round10(e.perCheck)} per paycheck)</span>.</div>
        <div class="th-assume"><span>${esc(assumptions)}${e.stateNote ? " " + esc(e.stateNote) : ""}</span>
          <button type="button" class="pb-btn pb-btn--quiet pb-btn--small" id="thEdit" aria-expanded="${state.thOpen}" aria-controls="thPanel">${state.thOpen ? "Close" : "Edit"}</button></div>
      </div>
      ${state.thOpen ? thPanel(o, mil, p) : ""}
      <details class="pb-details th-break"><summary>Where your pay goes</summary><div>
        <ul class="pb-ledger" style="margin-top:0">
          <li><span>Gross pay${mil ? " (incl. tax-free BAH and BAS)" : ""}</span><span>${f.usd(e.gross / 12)}</span></li>
          ${e.lines.map((l) => `<li><span>− ${esc(l.label)}</span><span>${f.usd(l.annual / 12)}</span></li>`).join("")}
          <li class="pb-ledger__total"><span>Take-home a month</span><span>${f.usd(e.monthly)}</span></li>
        </ul>
        <p style="margin:var(--s3) 0 0">Income tax is about ${(e.effectiveIncomeTax * 100).toFixed(1)}% of your gross pay. This is an estimate using ${e.taxYear} rules for every pay year: no tax credits, no itemizing and no spouse income. ${e.localNote ? `${e.localNote} isn't included. ` : ""}${mil && !e.noStateTax && !T.MIL_RULES[o.state] ? "Combat-zone and other special military exclusions aren't included. " : ""}Sources: <a class="pb-link" href="${T.SOURCES.federal}">IRS Rev. Proc. 2025-32</a>, <a class="pb-link" href="${T.SOURCES.states}">2026 state rates</a>${o.state === "MD" ? `, <a class="pb-link" href="${T.SOURCES.mdCounty}">Maryland Comptroller</a>` : ""}${o.state === "UT" ? `, <a class="pb-link" href="${T.SOURCES.utah}">Utah Tax Commission</a>` : ""}${mil ? `, <a class="pb-link" href="${T.MIL_SOURCE}">state military pay rules</a>` : ""}.</p>
      </div></details>`;
    $("#thEdit").onclick = () => { state.thOpen = !state.thOpen; if (state.thOpen) track("tool", { tool: "takehome" }); renderTakeHome(r, p); };
    if (state.thOpen) wireThPanel(r, p);
  }
  function thPanel(o, mil, p) {
    const counties = Object.keys(T.MD_COUNTIES);
    return `<form class="pb-th-panel" id="thPanel">
      <div class="pb-th-grid">
        <div class="pb-field"><span class="pb-field__label">Filing status</span><div class="pb-seg" role="radiogroup" aria-label="Filing status"><button type="button" role="radio" data-filing="single" aria-checked="${o.filing !== "mfj"}">Single</button><button type="button" role="radio" data-filing="mfj" aria-checked="${o.filing === "mfj"}">Married, one income</button></div></div>
        <div class="pb-field"><label class="pb-field__label" for="thState">${mil ? "State of legal residence" : "State you pay income tax to"}</label><select class="pb-input pb-select" id="thState">${T.STATE_CHOICES.map(([k, n]) => `<option value="${k}" ${k === o.state ? "selected" : ""}>${n}</option>`).join("")}</select>${mil ? '<span class="pb-field__hint">Usually your home of record, not where you\'re stationed.</span>' : ""}</div>
        ${o.state === "MD" ? `<div class="pb-field"><label class="pb-field__label" for="thCounty">Maryland county you live in</label><select class="pb-input pb-select" id="thCounty">${counties.map((c) => `<option ${c === o.county ? "selected" : ""}>${c}</option>`).join("")}</select></div>` : ""}
        ${o.state === "OTHER" ? `<div class="pb-field"><label class="pb-field__label" for="thOther">That state's rate (%)</label><input class="pb-input" id="thOther" inputmode="decimal" placeholder="e.g. 5" value="${esc(o.otherRate)}"></div>` : ""}
        ${mil ? "" : `<div class="pb-field"><label class="pb-field__label" for="thFers">FERS contribution</label><select class="pb-input pb-select" id="thFers">${["4.4", "3.1", "0.8"].map((k) => `<option value="${k}" ${k === o.fers ? "selected" : ""}>${p.system === "LEO" ? (+k + 0.5).toFixed(1) : k}% · ${T.FERS_LABEL[k]}</option>`).join("")}</select></div>`}
        <div class="pb-field"><label class="pb-field__label" for="thTsp">TSP contribution (%)</label><input class="pb-input" id="thTsp" inputmode="decimal" value="${esc(o.tspPct)}"><div class="pb-seg" role="radiogroup" aria-label="TSP type" style="margin-top:6px"><button type="button" role="radio" data-tsp="trad" aria-checked="${o.tspType !== "roth"}">Traditional</button><button type="button" role="radio" data-tsp="roth" aria-checked="${o.tspType === "roth"}">Roth</button></div></div>
        <div class="pb-field"><label class="pb-field__label" for="thHealth">Health premium per paycheck</label><input class="pb-input" id="thHealth" inputmode="decimal" placeholder="optional, e.g. 120" value="${esc(o.health)}"></div>
        <div class="pb-field"><label class="pb-field__label" for="thOwn">Or use your own income tax rate (%)</label><input class="pb-input" id="thOwn" inputmode="decimal" placeholder="e.g. 22" value="${esc(o.ownRate)}"><span class="pb-field__hint">For complicated situations. Replaces federal, state and local income tax.</span></div>
      </div>
      <div class="pb-th-actions"><button class="pb-btn" type="submit">Update</button><button class="pb-btn pb-btn--line" type="button" id="thReset">Reset to defaults</button></div>
    </form>`;
  }
  function wireThPanel(r, p) {
    const t = state.tax, form = $("#thPanel");
    const num = (id, max) => { const v = $(id).value.trim(); if (v === "") return ""; const n = parseFloat(v); return isNaN(n) ? "" : Math.max(0, Math.min(max, n)); };
    const read = () => {
      t.state = $("#thState").value; t.chosen = true;
      if ($("#thCounty")) t.county = $("#thCounty").value;
      if ($("#thOther")) t.otherRate = num("#thOther", 20);
      if ($("#thFers")) t.fers = $("#thFers").value;
      t.tspPct = num("#thTsp", 100) || 0; t.health = num("#thHealth", 5000); t.ownRate = num("#thOwn", 60);
      track("takehome", { filing: t.filing, tax: /^[A-Z]{2,5}$/.test(t.state || "") ? t.state : "" });
    };
    form.querySelectorAll("[data-filing]").forEach((b) => (b.onclick = () => { read(); t.filing = b.dataset.filing; save(); renderTakeHome(r, p); }));
    form.querySelectorAll("[data-tsp]").forEach((b) => (b.onclick = () => { read(); t.tspType = b.dataset.tsp; save(); renderTakeHome(r, p); }));
    $("#thState").onchange = () => { read(); save(); renderTakeHome(r, p); };
    form.onsubmit = (ev) => { ev.preventDefault(); read(); state.thOpen = false; save(); renderTakeHome(r, p); };
    $("#thReset").onclick = () => { Object.assign(t, { filing: "single", state: null, county: null, fers: "4.4", tspPct: 5, tspType: "trad", health: "", ownRate: "", otherRate: "", chosen: false }); save(); renderTakeHome(r, p); };
  }

  function renderPreviewBar() {
    const el = $("#preview");
    if (!state.preview) { el.hidden = true; return; }
    const a = G.compute(state.me, state.year, state.loc), b = G.compute(state.preview, state.year, state.loc);
    const d = (b.annual || 0) - (a.annual || 0);
    el.hidden = false;
    el.innerHTML = `<span>Previewing <b>${esc(b.title)}</b>: <span class="pb-delta ${d >= 0 ? "pb-delta--up" : "pb-delta--down"}">${d >= 0 ? "+" : "−"}${f.usd(Math.abs(d))}</span> a year compared with your pay.</span>
      <span class="acts"><button type="button" class="pb-btn pb-btn--line pb-btn--small" id="keep">Make this my pay</button><button type="button" class="pb-btn pb-btn--small" id="back">Back to my pay</button></span>`;
    $("#back").onclick = () => { state.preview = null; renderDash(); };
    $("#keep").onclick = () => { state.me = state.preview; state.preview = null; save(); renderDash(); };
  }
  // A decoded job posting (GS-0343-09/11/12): pay at each grade on it, here. Tap a grade to preview it.
  function renderPosting(el) {
    let box = $("#postingCard");
    if (!box) { box = document.createElement("div"); box.id = "postingCard"; el.parentNode.insertBefore(box, el); }
    const j = state.posting, me = state.me;
    if (!j || !me || me.system !== j.system) { box.innerHTML = ""; return; }
    const top = j.grades[j.grades.length - 1];
    const rows = j.grades.map((g, i) => {
      const prof = Object.assign({}, me, { grade: g, step: 1 }), r = G.compute(prof, state.year, state.loc), r10 = G.compute(Object.assign({}, prof, { step: 10 }), state.year, state.loc);
      const role = j.grades.length === 1 ? "The grade on this posting" : i === 0 ? "Entry grade" : g === top ? "Full performance level (top of the ladder)" : "Next on the ladder";
      const cur = me.grade === g && !state.preview;
      return `<li class="${cur ? "is-you" : ""}"><button type="button" data-g="${g}"><span class="pb-ladder__name">${esc(j.schedule)}-${g} · step 1</span>
        <span class="pb-ladder__when">${esc(role)} · up to ${f.usd(r10.annual)} at step 10</span><span class="pb-delta">${f.usd(r.annual)}<small>a year</small></span></button></li>`;
    }).join("");
    const notes = [].concat(j.retired ? ["USAJOBS lists this series as retired."] : [], j.assumed.filter((a) => !/^step/.test(a)).map((a) => a.charAt(0).toUpperCase() + a.slice(1) + "."));
    box.innerHTML = `<div class="pb-posting"><div class="pb-posting__head"><span><b>Job posting</b> · ${esc(j.schedule)}-${esc(j.series)}${j.seriesName ? " · " + esc(j.seriesName) : ""}</span><button type="button" class="pb-link" id="postingClear">Clear</button></div>
      <ol class="pb-ladder">${rows}</ol>${notes.length ? `<p class="pb-posting__note">${esc(notes.join(" "))}</p>` : ""}</div>`;
    box.querySelectorAll("button[data-g]").forEach((b) => (b.onclick = () => { const g = +b.dataset.g; state.preview = g === me.grade ? null : Object.assign({}, me, { grade: g, step: 1 }); renderDash(); $("#stub").scrollIntoView({ behavior: "smooth", block: "center" }); }));
    $("#postingClear").onclick = () => { state.posting = null; renderLadder(); };
  }
  function renderLadder() {
    const p = shown(), now = G.compute(p, state.year, state.loc), items = G.progression(p, state.year, state.loc), mil = p.system === "MIL";
    const el = $("#ladder");
    renderPosting(el);
    el.innerHTML = `<li class="is-you"><div class="pb-rung"><span class="pb-ladder__name">${esc(now.title)}</span><span class="pb-ladder__when">${state.preview ? "The level you're previewing" : "Where you are now"}</span><span class="pb-delta">${state.preview ? "Preview" : "You"}</span></div></li>` +
      (items.length ? items.map((x, i) => `<li><button type="button" data-i="${i}"><span class="pb-ladder__name">${esc(x.title)}</span>
        <span class="pb-ladder__when">${esc(KIND[x.kind])} · ${esc(x.when)}</span>
        <span class="pb-delta ${x.delta >= 0 ? "pb-delta--up" : "pb-delta--down"}">${x.delta >= 0 ? "+" : "−"}${mil ? f.usd(Math.abs(x.delta) / 12) : f.usd(Math.abs(x.delta))}<small>${mil ? "a month" : "a year"}</small></span></button></li>`).join("")
        : `<li><div class="pb-rung"><span class="pb-ladder__name">Top of this schedule</span><span class="pb-ladder__when">Use Compare below to look at other pay systems.</span></div></li>`);
    el.querySelectorAll("button[data-i]").forEach((b) => (b.onclick = () => { state.preview = Object.assign({}, items[+b.dataset.i].profile); renderDash(); $("#stub").scrollIntoView({ behavior: "smooth", block: "center" }); }));
  }
  function renderPlaceBtn() {
    $("#placeBtn").innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15s5-5.1 5-9A5 5 0 0 0 3 6c0 3.9 5 9 5 9z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="6" r="1.8" fill="currentColor"/></svg><span>${esc(placeName(state.loc))}</span>`;
  }

  // ------------------------------------------------------------ explore tabs
  function renderTab() {
    document.querySelectorAll("#tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
    ({ tables: tabTables, allowances: tabAllowances, travel: tabTravel, compare: tabCompare, guide: tabGuide })[state.tab]($("#tabPanel"));
  }
  document.querySelectorAll("#tabs [role=tab]").forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; track("tool", { tool: state.tab }); renderTab(); }));
  function pick(np) {
    const merged = Object.assign({}, state.me, np);
    state.preview = JSON.stringify(merged) === JSON.stringify(state.me) ? null : merged;
    renderDash(); $("#stub").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function tabTables(el) {
    const a = shown();
    if (!state.tableKind) state.tableKind = a.system === "SES" ? "SES" : a.system;
    const kinds = [["GS", "GS"], ["LEO", "LEO"], ["MIL", "Military"], ["SES", "SES & EX"], ["FWS", "Trades"]];
    let html = `<div class="toolbar"><div class="pb-seg" role="radiogroup" aria-label="Table">${kinds.map(([k, t]) => `<button type="button" role="radio" data-k="${k}" aria-checked="${state.tableKind === k}">${t}</button>`).join("")}</div><span class="hint">Your cell is highlighted. Tap any cell to preview it.</span></div>`;
    if (state.tableKind === "GS" || state.tableKind === "LEO") {
      const leoMode = state.tableKind === "LEO";
      const first = leoMode ? G.leo(state.year, 3, 1, state.loc) : G.gs(state.year, 1, 1, state.loc);
      html += `<div class="pb-table-wrap"><table class="pb-table"><thead><tr><th scope="col">Grade</th>${range(1, 10).map((s) => `<th scope="col">Step ${s}</th>`).join("")}</tr></thead><tbody>`;
      (leoMode ? range(3, 15) : range(1, 15)).forEach((g) => {
        const yours = a.system === state.tableKind && a.grade === g;
        html += `<tr class="${yours ? "is-yours" : ""}"><th scope="row">GS-${g}</th>${range(1, 10).map((s) => {
          const v = leoMode ? G.leo(state.year, g, s, state.loc).adjusted : G.gs(state.year, g, s, state.loc).annual;
          const you = yours && a.step === s;
          return `<td class="${you ? "is-you" : ""}" ${you ? "" : `data-pick='${JSON.stringify({ system: state.tableKind, grade: g, step: s })}'`}>${f.usd(v)}</td>`;
        }).join("")}</tr>`;
      });
      html += `</tbody><caption>${state.year} yearly pay${leoMode ? " (LEO special rates are estimates; LEAP not included)" : ""} · ${esc(first.localityName)} · ${f.pct(first.localityPct)} locality · Source: ${state.year <= 2026 ? `<a class="pb-link" href="${state.year === 2025 ? "https://www.govinfo.gov/content/pkg/FR-2024-12-30/pdf/2024-31466.pdf" : "https://www.govinfo.gov/content/pkg/FR-2025-12-23/pdf/2025-23844.pdf"}">${sourceLine(state.year)}</a>` : "projected"}</caption></table></div>`;
    } else if (state.tableKind === "MIL") {
      const t = G.milTable(state.year), col = t.columns.reduce((acc, c) => (a.system === "MIL" && a.yos >= c ? c : acc), 0);
      html += `<div class="pb-table-wrap"><table class="pb-table"><thead><tr><th scope="col">Grade</th>${t.columns.map((c) => `<th scope="col">${c === 0 ? "&lt;2" : c}</th>`).join("")}</tr></thead><tbody>`;
      ALL_MIL.forEach((g) => {
        const yours = a.system === "MIL" && a.mgrade === g;
        html += `<tr class="${yours ? "is-yours" : ""}"><th scope="row">${g}</th>${t.rows[g].map((v, i) => {
          const you = yours && t.columns[i] === col;
          if (v == null) return `<td class="is-empty">·</td>`;
          return `<td class="${you ? "is-you" : ""}" ${you ? "" : `data-pick='${JSON.stringify({ system: "MIL", mgrade: g, yos: t.columns[i], deps: a.deps !== false })}'`}>${f.usd(v)}</td>`;
        }).join("")}</tr>`;
      });
      html += `</tbody><caption>${state.year} monthly basic pay by years of service. The same at every location. Source: ${sourceLine(state.year)}</caption></table></div>`;
    } else if (state.tableKind === "FWS") {
      const sch = a.system === "FWS" ? a.schedule : "WG";
      html += `<div class="pb-table-wrap"><table class="pb-table"><thead><tr><th scope="col">Grade</th>${range(1, 5).map((s) => `<th scope="col">Step ${s}</th>`).join("")}</tr></thead><tbody>`;
      range(1, G.FWS_SCHEDULES[sch].grades).forEach((g) => {
        const yours = a.system === "FWS" && a.schedule === sch && a.grade === g;
        html += `<tr class="${yours ? "is-yours" : ""}"><th scope="row">${sch}-${g}</th>${range(1, 5).map((s) => {
          const you = yours && a.step === s;
          return `<td class="${you ? "is-you" : ""}" ${you ? "" : `data-pick='${JSON.stringify({ system: "FWS", schedule: sch, grade: g, step: s })}'`}>${f.usd2(G.fws(state.year, sch, g, s, state.loc).hourly)}</td>`;
        }).join("")}</tr>`;
      });
      const r0 = G.fws(state.year, sch, 1, 1, state.loc);
      const st = r0.status === "verified" ? `<span class="pb-stamp pb-stamp--official">Official</span> FY${state.year} schedule, effective ${esc(fmtDay(r0.effective))}` : r0.status === "projected" ? `<span class="pb-stamp pb-stamp--proposed">Projected</span> from the FY${state.year - 1} schedule` : r0.needsData ? "Loading wage schedules…" : '<span class="pb-stamp pb-stamp--estimate">Estimate</span>';
      html += `</tbody><caption>${sch} hourly rates for ${esc(r0.areaName)} · ${st}. Source: DoD Wage and Salary Division (DCPAS).</caption></table></div>`;
    } else {
      const s = G.ses(state.year), ex = G.executiveSchedule(state.year);
      html += `<div class="facts">
        <div class="fact"><span class="pb-field__label">SES minimum</span><b>${f.usd(s.min)}</b></div>
        <div class="fact"><span class="pb-field__label">SES max · certified</span><b>${f.usd(s.maxCertified)}</b></div>
        <div class="fact"><span class="pb-field__label">SES max · not certified</span><b>${f.usd(s.maxUncertified)}</b></div>
        ${["I", "II", "III", "IV", "V"].map((l) => `<div class="fact"><span class="pb-field__label">Executive Schedule ${l}</span><b>${f.usd(ex[l])}</b></div>`).join("")}</div>
        <p class="sub">${esc(s.note)} Level IV (${f.usd(ex.IV)}) also caps GS pay including locality. Source: ${sourceLine(state.year)}</p>`;
    }
    el.innerHTML = html;
    el.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { state.tableKind = b.dataset.k; track("tool", { tool: "table-" + b.dataset.k }); if (needsFws()) loadFws(); renderTab(); }));
    el.querySelectorAll("[data-pick]").forEach((td) => (td.onclick = () => pick(JSON.parse(td.dataset.pick))));
  }

  function tabAllowances(el) {
    const a = shown(), first = G.bah(state.year, "E-5", true, state.loc);
    let html = `<div class="facts">
      <div class="fact"><span class="pb-field__label">BAS · enlisted</span><b>${f.usd2(G.bas(state.year, "E-5"))}</b><small>a month, tax-free</small></div>
      <div class="fact"><span class="pb-field__label">BAS · officers &amp; warrants</span><b>${f.usd2(G.bas(state.year, "O-3"))}</b><small>a month, tax-free</small></div>
      <div class="fact"><span class="pb-field__label">Housing area</span><b style="font-size:17px">${esc(first.mhaName)}</b><small>${esc(placeName(state.loc))}</small></div></div>
      <div class="pb-table-wrap"><table class="pb-table"><thead><tr><th scope="col">Grade</th><th scope="col">With dependents</th><th scope="col">Without</th><th scope="col">Yearly, with</th></tr></thead><tbody>`;
    ALL_MIL.forEach((g) => {
      const w = G.bah(state.year, g, true, state.loc).monthly, wo = G.bah(state.year, g, false, state.loc).monthly, yours = a.system === "MIL" && a.mgrade === g;
      html += `<tr class="${yours ? "is-yours" : ""}"><th scope="row">${g}</th><td class="${yours && a.deps ? "is-you" : ""}">${f.usd(w)}</td><td class="${yours && !a.deps ? "is-you" : ""}">${f.usd(wo)}</td><td>${f.usd(w * 12)}</td></tr>`;
    });
    const st = first.status === "verified" ? '<span class="pb-stamp pb-stamp--official">Official</span> DTMO rate files' : first.status === "projected" ? '<span class="pb-stamp pb-stamp--proposed">Projected</span> from the latest DTMO rates' : '<span class="pb-stamp pb-stamp--estimate">Estimate</span>';
    el.innerHTML = html + `</tbody><caption>${state.year} monthly BAH for ${esc(first.mhaName)} · ${st}. BAS: DoD FMR Vol. 7A, Ch. 25. O-8 and above get the O-7 rate.</caption></table></div>`;
  }

  function tabTravel(el) {
    const months = range(1, 12).map((m) => G.perDiem(state.year, state.loc, m)), pd = months[0];
    const max = Math.max.apply(null, months.map((m) => m.lodging)), min = Math.min.apply(null, months.map((m) => m.lodging));
    const t = G.trip(state.year, state.loc, state.tripStart, state.tripNights);
    el.innerHTML = `<div class="facts">
        <div class="fact"><span class="pb-field__label">Per diem area</span><b style="font-size:17px" title="${esc(pd.areaDetail)}">${esc(pd.areaName)}</b><small>${pd.fiscalYear} · GSA · official</small></div>
        <div class="fact"><span class="pb-field__label">Meals &amp; incidentals</span><b>${f.usd(pd.mie)}</b><small>a day · ${f.usd2(pd.firstLastMie)} on first and last day</small></div>
        <div class="fact"><span class="pb-field__label">Lodging, max a night</span><b>${min === max ? f.usd(min) : f.usd(min) + "–" + f.usd(max)}</b><small>${min === max ? "all year" : "depends on the month"}</small></div></div>
      <div class="months">${months.map((m, i) => `<div class="month ${max !== min && m.lodging === max ? "peak" : ""}">${"JFMAMJJASOND"[i]}<b>${f.usd(m.lodging)}</b></div>`).join("")}</div>
      <div class="pb-section-label">Trip estimate</div>
      <div class="controls">
        <div class="pb-field"><label class="pb-field__label" for="tripStart">Arrive</label><input class="pb-input" type="date" id="tripStart" value="${state.tripStart}"></div>
        <div class="pb-field"><label class="pb-field__label" for="tripNights">Nights</label><input class="pb-input" type="number" id="tripNights" min="0" max="60" value="${state.tripNights}" style="max-width:120px"></div>
      </div>
      <ul class="pb-ledger" style="max-width:520px"><li><span>Lodging, ${state.tripNights} night${state.tripNights === 1 ? "" : "s"}</span><span>${f.usd(t.lodging)}</span></li><li><span>Meals &amp; incidentals, ${state.tripNights + 1} days</span><span>${f.usd2(t.mie)}</span></li><li class="pb-ledger__total"><span>Most you'd be reimbursed</span><span>${f.usd2(t.total)}</span></li></ul>
      <p class="sub" style="margin-top:var(--s3)">Each day uses its own month and fiscal year. Your agency's travel rules (JTR or FTR) decide the final amount.</p>`;
    $("#tripStart", el).onchange = (e) => { state.tripStart = e.target.value; tabTravel(el); };
    $("#tripNights", el).onchange = (e) => { state.tripNights = Math.max(0, Math.min(60, +e.target.value || 0)); tabTravel(el); };
  }

  function tabCompare(el) {
    const b = state.b, ra = G.compute(state.me, state.year, state.loc);
    el.innerHTML = `<p class="sub" style="margin-top:0">Compare your pay with another job, in the same year and place. Cash only for now; take-home and benefits come later.</p>
      <div class="controls">${field("Other job", `<select class="pb-input pb-select" id="cmpSys">${SYSTEMS.map((s) => `<option value="${s.k}" ${s.k === b.system ? "selected" : ""}>${s.t}</option>`).join("")}</select>`)}<span id="cmpGrade" class="controls" style="margin:0">${gradeControls(b)}</span></div>
      <div id="cmpOut"></div>`;
    const draw = () => {
      const rb = G.compute(b, state.year, state.loc), d = (rb.annual || 0) - (ra.annual || 0);
      $("#cmpOut", el).innerHTML = `<div class="cmp"><div><span class="pb-field__label">Your pay</span><b class="amt num">${f.usd(ra.annual)}</b><small>${esc(ra.title)}</small></div><div><span class="pb-field__label">Other job</span><b class="amt num">${rb.annual ? f.usd(rb.annual) : "—"}</b><small>${esc(rb.title)}</small></div></div>
        <div class="verdict">${ra.annual && rb.annual ? `${esc(rb.title)} pays <span class="pb-delta ${d >= 0 ? "pb-delta--up" : "pb-delta--down"}">${d >= 0 ? "+" : "−"}${f.usd(Math.abs(d))}</span> a year ${d >= 0 ? "more" : "less"}.${b.system === "MIL" || state.me.system === "MIL" ? " Military figures include tax-free BAH and BAS, so compare take-home before deciding." : ""}` : "Pick a valid grade and years of service."}</div>`;
    };
    $("#cmpSys", el).onchange = (e) => { b.system = e.target.value; tabCompare(el); };
    wireGrade($("#cmpGrade", el), b, (slider) => { if (slider) draw(); else tabCompare(el); });
    draw();
  }

  function tabGuide(el) {
    el.innerHTML = `<ol class="guide">
      <li><b>Grade is your level. Step is your time.</b>Civilians are hired at a grade (GS-1 to GS-15) and move up a step with time: one year per step at first, then two, then three. Service members are paid by rank and years of service.</li>
      <li><b>Where you work changes your pay.</b>Civilians get locality pay on top of base pay, from 17% to over 46%. Service members get BAH for housing, which is tax-free and depends on where you're stationed, your rank and whether you have dependents.</li>
      <li><b>Trades and executives have their own tables.</b>Trades jobs (WG, WL, WS) are paid by the hour from local wage surveys. SES pay is a single band with no locality pay.</li>
      <li><b>Travel money isn't income.</b>Per diem pays for lodging plus meals and incidentals while you're on official travel.</li></ol>
      <div class="pb-section-label">Rough equivalents · unofficial</div>
      <div class="pb-table-wrap"><table class="pb-table"><thead><tr><th scope="col">Civilian</th><th scope="col" style="text-align:left">Military</th><th scope="col" style="text-align:left">Typical role</th></tr></thead><tbody>
      ${G.EQUIVALENTS.map((e) => `<tr><th scope="row">${e.gs}</th><td style="text-align:left">${e.mil}</td><td style="text-align:left">${e.role}</td></tr>`).join("")}</tbody>
      <caption>For orientation only. Agencies and services set their own equivalencies.</caption></table></div>`;
  }

  // ------------------------------------------------------------ layout pieces
  let railPicker, sheetPicker, yearSw, ask;
  // Trades (FWS) schedules are a separate data file (about 125 KB compressed), loaded only when needed.
  let fwsLoading = false;
  function needsFws() { return !(window.GOVPAY_DATA && window.GOVPAY_DATA.fws) && (shown().system === "FWS" || state.tableKind === "FWS"); }
  function loadFws() {
    if (fwsLoading) return; fwsLoading = true;
    const near = document.querySelector('script[src*="data/bah.js"]');
    const sc = document.createElement("script");
    sc.src = near ? near.getAttribute("src").replace("bah.js", "fws.js") : "shared/data/fws.js";
    sc.onload = () => renderDash();
    sc.onerror = () => { fwsLoading = false; };
    document.head.appendChild(sc);
  }
  const fmtDay = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
  function renderDash() {
    if (needsFws()) loadFws();
    renderPreviewBar(); renderControls(); renderStub(); renderLadder(); renderPlaceBtn(); renderTab();
    if (railPicker) railPicker.set(state.loc);
    if (sheetPicker) sheetPicker.set(state.loc);
    if (!state.preview) writeHash();
  }
  function setLoc(id) { if (A) { const l = G.location(id); track("place", Object.assign({ kind: l.kind }, A.placeKeys(id))); } state.loc = id; if (!state.tax.chosen) { state.tax.state = null; state.tax.county = null; } if (!state.preview) save(); renderDash(); }
  function mountDash() {
    if (!ask) ask = PB.searchBox($("#ask"), { getLoc: () => state.loc, getYear: () => state.year, onPick: pickFromSearch });
    if (!yearSw) yearSw = PB.yearSwitch($("#year"), { value: state.year, onChange: (y) => { state.year = y; track("year", { y: String(y) }); if (!state.preview) save(); railPicker.refresh(); sheetPicker.refresh(); renderDash(); } });
    if (!railPicker) railPicker = PB.locationPicker($("#pickerRail"), { value: state.loc, getYear: () => state.year, onChange: setLoc });
    if (!sheetPicker) sheetPicker = PB.locationPicker($("#pickerSheet"), { value: state.loc, getYear: () => state.year, onChange: setLoc });
  }
  function render() {
    const first = !state.me || state.editing;
    $("#welcome").hidden = !first; $("#dash").hidden = first;
    if (first) { renderWelcome(); return; }
    mountDash(); renderDash();
    if (A) A.profile(state.me, state.loc);   // once per visit (repeats are dropped)
  }

  // header + sheet + theme
  $("#home").onclick = (e) => { e.preventDefault(); state.preview = null; state.editing = false; render(); window.scrollTo(0, 0); };
  document.querySelectorAll("[data-nav]").forEach((a) => (a.onclick = (e) => {
    if (!state.me) return;
    const n = a.dataset.nav;
    if (n === "pay") { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else { state.tab = n; renderTab(); }
    document.querySelectorAll("[data-nav]").forEach((x) => (x === a ? x.setAttribute("aria-current", "page") : x.removeAttribute("aria-current")));
  }));
  const sheet = $("#sheet"), opener = $("#placeBtn");
  opener.onclick = () => { sheet.hidden = false; document.body.style.overflow = "hidden"; const i = sheet.querySelector("input"); if (i) i.focus(); };
  const closeSheet = () => { sheet.hidden = true; document.body.style.overflow = ""; opener.focus(); };
  $("#sheetClose").onclick = closeSheet;
  sheet.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
  const themeBtn = $("#theme"), root = document.documentElement;
  const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  try { const t = localStorage.getItem("paybook.theme"); if (t) root.dataset.theme = t; } catch (e) { /* ignore */ }
  themeBtn.textContent = isDark() ? "Light" : "Dark";
  themeBtn.onclick = () => { root.dataset.theme = isDark() ? "light" : "dark"; themeBtn.textContent = isDark() ? "Light" : "Dark"; try { localStorage.setItem("paybook.theme", root.dataset.theme); } catch (e) { /* ignore */ } };

  render();
  // "Start over" link under the stub
  document.addEventListener("click", (e) => { if (e.target.closest("[data-edit]")) { e.preventDefault(); state.editing = true; state.draft = Object.assign({}, state.me); render(); window.scrollTo(0, 0); } });
})();
