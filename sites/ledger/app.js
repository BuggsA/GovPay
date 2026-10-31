/* Paybook — "my pay" first. Set up once, see your number, see your next level. */
(function () {
  "use strict";
  const G = window.GovPay, f = G.fmt;
  const $ = (s, el) => (el || document).querySelector(s);
  const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
  const ALL_MIL = [].concat(G.MIL_GRADES.enlisted, G.MIL_GRADES.warrant, G.MIL_GRADES.officer, G.MIL_GRADES.priorEnlisted);
  const COLORS = { base: "var(--bar-1)", locality: "var(--bar-2)", leap: "var(--bar-3)", bah: "var(--bar-2)", bas: "var(--bar-3)" };
  const SYSTEMS = [
    { k: "GS", t: "General Schedule", s: "Most federal civilians (GS-1 to GS-15)", ico: "🏛️" },
    { k: "LEO", t: "Law enforcement", s: "Federal LEOs and criminal investigators", ico: "🛡️" },
    { k: "FWS", t: "Trades (wage grade)", s: "WG, WL and WS hourly jobs", ico: "🔧" },
    { k: "SES", t: "Senior Executive", s: "SES members", ico: "⭐" },
    { k: "MIL", t: "Military", s: "Enlisted, warrant officers and officers", ico: "🎖️" },
  ];
  const KIND = { step: "Next step", grade: "Promotion", top: "Top of grade", yos: "Longevity raise", promo: "Promotion", role: "New role" };
  const STORE = "paybook.v1";

  const state = {
    year: G.CURRENT_YEAR, loc: "dc", me: null, draft: null, preview: null,
    tab: "tables", tableKind: "GS", tripStart: G.CURRENT_YEAR + "-04-14", tripNights: 3,
    b: Object.assign({}, G.DEFAULT_PROFILE, { system: "MIL", mgrade: "O-3", yos: 8 }),
  };
  load();

  // ---------- persistence (per-viewer convenience only) ----------
  function load() {
    const q = new URLSearchParams(location.hash.slice(1));
    if (q.has("s")) { fromHash(q); return; }
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) { const d = JSON.parse(raw); state.me = d.me; state.loc = d.loc || state.loc; }
    } catch (e) { /* storage unavailable: just show setup */ }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ me: state.me, loc: state.loc })); } catch (e) { /* ignore */ }
    writeHash();
  }
  function writeHash() {
    const p = state.me; if (!p) { history.replaceState(null, "", location.pathname); return; }
    const parts = [`y=${state.year}`, `l=${state.loc}`, `s=${p.system}`];
    if (p.system === "MIL") parts.push(`g=${p.mgrade}`, `yos=${p.yos}`, `d=${p.deps ? 1 : 0}`);
    else if (p.system === "SES") parts.push(`pt=${p.sesPoint}`);
    else { parts.push(`g=${p.grade}`, `st=${p.step}`); if (p.system === "FWS") parts.push(`sch=${p.schedule}`); if (p.system === "LEO") parts.push(`leap=${p.leap ? 1 : 0}`); }
    history.replaceState(null, "", "#" + parts.join("&"));
  }
  function fromHash(q) {
    state.year = +q.get("y") || state.year;
    if (G.locations().some((l) => l.id === q.get("l"))) state.loc = q.get("l");
    const p = Object.assign({}, G.DEFAULT_PROFILE, { system: q.get("s") });
    if (p.system === "MIL") { p.mgrade = q.get("g") || p.mgrade; p.yos = +q.get("yos") || 0; p.deps = q.get("d") !== "0"; }
    else if (p.system === "SES") p.sesPoint = +q.get("pt") || 0;
    else { p.grade = +q.get("g") || p.grade; p.step = +q.get("st") || p.step; p.schedule = q.get("sch") || p.schedule; p.leap = q.get("leap") !== "0"; }
    state.me = p;
  }

  // ---------- reusable controls ----------
  // Stepper: [−][select][+] — one tap to move a level, or jump straight to any value.
  function stepper(name, values, current, label) {
    const i = values.findIndex((v) => String(v) === String(current));
    return `<div class="stepper" data-stepper="${name}">
      <button type="button" class="st-btn" data-dir="-1" aria-label="Lower ${label}" ${i <= 0 ? "disabled" : ""}>−</button>
      <select aria-label="${label}">${values.map((v) => `<option value="${v}" ${String(v) === String(current) ? "selected" : ""}>${fmtVal(name, v)}</option>`).join("")}</select>
      <button type="button" class="st-btn" data-dir="1" aria-label="Raise ${label}" ${i >= values.length - 1 ? "disabled" : ""}>+</button>
    </div>`;
  }
  function fmtVal(name, v) {
    if (name === "grade") return v.prefix + v.n;
    return { gsGrade: "GS-" + v, step: "Step " + v, yos: v + (v === 1 ? " year" : " years") }[name] || v;
  }
  function wireSteppers(el, p, onChange) {
    el.querySelectorAll("[data-stepper]").forEach((w) => {
      const sel = $("select", w), name = w.dataset.stepper;
      const setv = (v) => { applyField(p, name, v); onChange(); };
      sel.onchange = () => setv(sel.value);
      w.querySelectorAll(".st-btn").forEach((b) => (b.onclick = () => {
        const i = sel.selectedIndex + +b.dataset.dir;
        if (i >= 0 && i < sel.options.length) setv(sel.options[i].value);
      }));
    });
  }
  function applyField(p, name, v) {
    if (name === "gsGrade" || name === "fwsGrade") p.grade = +v;
    else if (name === "step") p.step = +v;
    else if (name === "rank") { p.mgrade = v; }
    else if (name === "yos") p.yos = +v;
    else if (name === "schedule") p.schedule = v;
  }
  function gradeControls(p, compact) {
    // Returns the HTML controls for the "grade/rank" part of a profile.
    if (p.system === "GS" || p.system === "LEO") {
      const minG = p.system === "LEO" ? 3 : 1;
      if (p.grade < minG) p.grade = minG;
      return [
        field("Grade", stepper("gsGrade", range(minG, 15), p.grade, "grade"), compact),
        field("Step", stepper("step", range(1, 10), p.step, "step"), compact, compact ? "" : "Not sure? Your step is shown on your SF-50 and on your Leave and Earnings Statement."),
        p.system === "LEO" ? field("", `<label class="toggle"><input type="checkbox" data-leap ${p.leap ? "checked" : ""}> I get LEAP (25%)</label>`, compact) : "",
      ].join("");
    }
    if (p.system === "FWS") {
      const max = G.FWS_SCHEDULES[p.schedule].grades;
      if (p.grade > max) p.grade = max;
      if (p.step > 5) p.step = 2;
      return [
        field("Schedule", `<select data-sched>${Object.keys(G.FWS_SCHEDULES).map((k) => `<option value="${k}" ${k === p.schedule ? "selected" : ""}>${k} · ${G.FWS_SCHEDULES[k].name}</option>`).join("")}</select>`, compact),
        field("Grade", stepper("fwsGrade", range(1, max), p.grade, "grade").replace(/>(\d+)<\/option>/g, `>${p.schedule}-$1</option>`), compact),
        field("Step", stepper("step", range(1, 5), Math.min(p.step, 5), "step"), compact),
      ].join("");
    }
    if (p.system === "SES") {
      return field("Your pay in the band", `<div class="range-row"><input type="range" min="0" max="1" step="0.05" value="${p.sesPoint}" data-ses><output>${Math.round(p.sesPoint * 100)}%</output></div>`, compact, compact ? "" : "There are no grades in the SES. Slide to roughly where your salary sits.");
    }
    return [
      field("Rank", `<div class="stepper" data-stepper="rank"><button type="button" class="st-btn" data-dir="-1" aria-label="Lower rank">−</button><select aria-label="Rank">${
        [["Enlisted", G.MIL_GRADES.enlisted], ["Warrant officer", G.MIL_GRADES.warrant], ["Officer", G.MIL_GRADES.officer], ["Officer, 4+ yrs prior enlisted", G.MIL_GRADES.priorEnlisted]]
          .map(([lbl, gs]) => `<optgroup label="${lbl}">${gs.map((g) => `<option ${g === p.mgrade ? "selected" : ""}>${g}</option>`).join("")}</optgroup>`).join("")
      }</select><button type="button" class="st-btn" data-dir="1" aria-label="Raise rank">+</button></div>`, compact),
      field("Years of service", stepper("yos", range(0, 40), p.yos, "years of service"), compact),
      field("", `<label class="toggle"><input type="checkbox" data-deps ${p.deps ? "checked" : ""}> I have dependents</label>`, compact),
    ].join("");
  }
  function field(label, inner, compact, hint) {
    return `<div class="${compact ? "ifield" : "field"}">${label ? `<span class="lbl">${label}</span>` : ""}${inner}${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
  }
  function wireGrade(el, p, onChange) {
    wireSteppers(el, p, onChange);
    const leap = $("[data-leap]", el); if (leap) leap.onchange = () => { p.leap = leap.checked; onChange(); };
    const dp = $("[data-deps]", el); if (dp) dp.onchange = () => { p.deps = dp.checked; onChange(); };
    const sc = $("[data-sched]", el); if (sc) sc.onchange = () => { p.schedule = sc.value; onChange(); };
    const sr = $("[data-ses]", el); if (sr) sr.oninput = () => { p.sesPoint = +sr.value; sr.nextElementSibling.textContent = Math.round(p.sesPoint * 100) + "%"; onChange(true); };
  }
  function locSelect(id) { return `<div class="lp-mount" id="${id}"></div>`; }
  function mountLoc(id, onChange) { GovPayUI.locationPicker(document.getElementById(id), { value: state.loc, onChange }); }
  function badge(status) { const s = G.STATUS_INFO[status]; return `<span class="badge ${status}" title="${s.desc}">${s.label}</span>`; }

  // ---------- year ----------
  function renderYear() {
    const seg = $("#yearSeg");
    seg.innerHTML = G.YEARS.map((y) => `<button type="button" role="radio" aria-checked="${y.year === state.year}" data-y="${y.year}" title="${y.note}">${y.year > G.CURRENT_YEAR ? y.year + " est." : y.year}</button>`).join("");
    seg.querySelectorAll("button").forEach((b) => (b.onclick = () => { state.year = +b.dataset.y; render(); }));
  }

  // ---------- setup ----------
  function renderSetup() {
    const d = state.draft || (state.draft = state.me ? Object.assign({}, state.me) : { system: null, grade: 9, step: 1, schedule: "WG", leap: true, mgrade: "E-4", yos: 3, deps: false, sesPoint: 0.3 });
    const el = $("#setup");
    const sysCards = SYSTEMS.map((s) => `<button type="button" class="sys-card" data-sys="${s.k}" aria-pressed="${d.system === s.k}"><span class="ico" aria-hidden="true">${s.ico}</span><b>${s.t}</b><small>${s.s}</small></button>`).join("");
    const preview = d.system ? G.compute(d, state.year, state.loc) : null;
    el.innerHTML = `
      <div class="setup-head">
        <h1>${state.me ? "Update your pay details" : "Let's find your pay."}</h1>
        <p class="muted">Three quick questions. They're saved in this browser only, so you won't have to answer them again.</p>
      </div>
      <ol class="qs">
        <li class="q"><h2><span class="qn">1</span> How are you paid?</h2><div class="sys-cards">${sysCards}</div>
          <p class="hint">Thinking about joining? Pick the path you're curious about.</p></li>
        <li class="q ${d.system ? "" : "q-off"}"><h2><span class="qn">2</span> ${d.system === "MIL" ? "What's your rank?" : d.system === "SES" ? "Where are you in the SES band?" : "What's your grade and step?"}</h2>
          <div class="q-body" id="qGrade">${d.system ? gradeControls(d, false) : '<p class="muted">Answer question 1 first.</p>'}</div></li>
        <li class="q ${d.system ? "" : "q-off"}"><h2><span class="qn">3</span> Where do you work?</h2>
          <div class="field">${locSelect("setupLoc", state.loc)}<div class="hint">${d.system === "MIL" ? "Your duty station sets your BAH." : "Your duty station sets your locality pay."}</div></div></li>
      </ol>
      <div class="setup-foot">
        <div class="setup-peek">${preview && preview.annual ? `That's about <b>${f.usd(preview.annual)}</b> a year.` : ""}</div>
        <div class="setup-actions">
          ${state.me ? '<button type="button" class="btn ghost" id="cancelSetup">Cancel</button>' : ""}
          <button type="button" class="btn" id="doneSetup" ${d.system ? "" : "disabled"}>Show my pay →</button>
        </div>
      </div>`;
    el.querySelectorAll("[data-sys]").forEach((b) => (b.onclick = () => { d.system = b.dataset.sys; renderSetup(); }));
    if (d.system) wireGrade($("#qGrade", el), d, (slider) => { if (slider) updatePeek(); else renderSetup(); });
    mountLoc("setupLoc", (id) => { state.loc = id; renderSetup(); });
    $("#doneSetup", el).onclick = () => { state.me = Object.assign({}, d); state.draft = null; state.preview = null; state.editing = false; save(); render(); window.scrollTo(0, 0); };
    const c = $("#cancelSetup", el); if (c) c.onclick = () => { state.draft = null; state.editing = false; render(); };
    function updatePeek() { const r = G.compute(d, state.year, state.loc); $(".setup-peek", el).innerHTML = r.annual ? `That's about <b>${f.usd(r.annual)}</b> a year.` : ""; }
  }

  // ---------- my pay ----------
  function shown() { return state.preview || state.me; }
  function renderMe(fromSlider) {
    const p = shown(), r = G.compute(p, state.year, state.loc);
    const el = $("#me");
    const prevYear = G.YEARS.some((y) => y.year === state.year - 1) ? G.compute(p, state.year - 1, state.loc) : null;
    const yoy = prevYear && prevYear.annual && r.annual ? r.annual - prevYear.annual : null;
    const isMil = p.system === "MIL";
    const checks = isMil ? 24 : 26;
    const total = r.annual;
    if (!fromSlider) {
      el.innerHTML = `
        <div class="me-top">
          <div class="me-title">${state.preview ? "What if: " : "Your pay"} · ${state.year} ${badge(r.status)}</div>
          <button type="button" class="btn ghost small" id="editMe">Change my details</button>
        </div>
        <div class="me-controls" id="meControls">
          <div class="ifield"><span class="lbl">Pay system</span><select id="meSys">${SYSTEMS.map((s) => `<option value="${s.k}" ${s.k === p.system ? "selected" : ""}>${s.t}</option>`).join("")}</select></div>
          ${gradeControls(p, true)}
          <div class="ifield"><span class="lbl">Location</span>${locSelect("meLoc", state.loc)}</div>
        </div>
        <div id="meNumbers"></div>`;
      wireGrade($("#meControls", el), p, (slider) => { afterEdit(slider); });
      $("#meSys", el).onchange = (e) => { p.system = e.target.value; afterEdit(); };
      mountLoc("meLoc", (id) => { state.loc = id; if (!state.preview) save(); render(); });
      $("#editMe", el).onclick = () => { state.editing = true; state.draft = Object.assign({}, state.me); render(); window.scrollTo(0, 0); };
    }
    const bar = r.rows.map((row) => `<span style="width:${total ? (row.annual / total) * 100 : 0}%;background:${COLORS[row.key]}" title="${row.label}"></span>`).join("");
    $("#meNumbers", el).innerHTML = total == null ? `<div class="big">—</div><p class="muted">${r.notes[0]}</p>` : `
      <div class="me-hero">
        <div>
          <div class="me-who">${r.title} · ${G.location(state.loc).name}</div>
          <div class="big">${f.usd(total)}<small> a year</small></div>
          ${yoy != null ? `<div class="yoy ${yoy >= 0 ? "up" : "down"}">${yoy >= 0 ? "▲" : "▼"} ${f.usd(Math.abs(yoy))} vs ${state.year - 1} (${(yoy / prevYear.annual * 100).toFixed(1)}%)</div>` : ""}
        </div>
        <div class="tiles">
          <div class="tile"><span>Per paycheck</span><b>${f.usd(total / checks)}</b><small>${isMil ? "1st & 15th" : "every 2 weeks"}</small></div>
          <div class="tile"><span>Per month</span><b>${f.usd(total / 12)}</b><small>before taxes</small></div>
          ${isMil ? `<div class="tile"><span>Tax advantage</span><b>${f.usd(r.mil.taxAdvantage)}</b><small>a year, rough estimate</small></div>`
                  : r.hourly ? `<div class="tile"><span>Per hour</span><b>${f.usd2(r.hourly)}</b><small>2,087 hrs/yr</small></div>` : ""}
        </div>
      </div>
      <div class="stackbar">${bar}</div>
      <table class="rows"><tbody>${r.rows.map((row) => `<tr><td><span class="dot" style="background:${COLORS[row.key]}"></span>${row.label}${row.taxFree ? ' <span class="muted">· tax-free</span>' : ""}</td><td>${f.usd(row.annual)}<span class="muted"> /yr</span></td></tr>`).join("")}</tbody></table>
      <details class="notes"><summary>How this is calculated</summary>${r.notes.map((n) => `<p>${n}</p>`).join("")}</details>`;
  }
  function afterEdit(slider) {
    if (!state.preview) save();
    if (slider) { renderMe(true); renderNext(); return; }
    render();
  }

  function renderBanner() {
    const el = $("#previewBanner");
    if (!state.preview) { el.hidden = true; return; }
    const a = G.compute(state.me, state.year, state.loc), b = G.compute(state.preview, state.year, state.loc);
    const d = (b.annual || 0) - (a.annual || 0);
    el.hidden = false;
    el.innerHTML = `<span>Previewing <b>${b.title}</b>: ${d >= 0 ? "+" : "−"}${f.usd(Math.abs(d))} a year compared with your pay (${a.title}).</span>
      <span class="banner-actions"><button type="button" class="btn ghost small" id="keepPrev">Make this my pay</button><button type="button" class="btn small" id="backMe">← Back to my pay</button></span>`;
    $("#backMe").onclick = () => { state.preview = null; render(); };
    $("#keepPrev").onclick = () => { state.me = state.preview; state.preview = null; save(); render(); };
  }

  function renderNext() {
    const p = shown();
    const items = G.progression(p, state.year, state.loc);
    const isMil = p.system === "MIL";
    const el = $("#nextGrid");
    if (!items.length) { el.innerHTML = `<div class="next-card done"><b>You're at the top of this pay schedule. 🎉</b><p class="muted">Use Compare below to look at other pay systems.</p></div>`; return; }
    el.innerHTML = items.map((x, i) => `
      <button type="button" class="next-card" data-i="${i}">
        <span class="kind kind-${x.kind}">${KIND[x.kind]}</span>
        <span class="nc-title">${x.title}</span>
        <span class="nc-delta ${x.delta >= 0 ? "up" : "down"}">${x.delta >= 0 ? "+" : "−"}${f.usd(Math.abs(x.delta))}<small> /yr</small></span>
        <span class="nc-sub">${x.delta >= 0 ? "+" : "−"}${f.usd(Math.abs(x.delta) / (isMil ? 24 : 26))} per paycheck · new total ${f.usd(x.annual)}</span>
        <span class="nc-when">${x.sub}, ${x.when}.</span>
        <span class="nc-cta">Preview →</span>
      </button>`).join("");
    el.querySelectorAll(".next-card[data-i]").forEach((b) => (b.onclick = () => {
      state.preview = Object.assign({}, items[+b.dataset.i].profile);
      render(); $("#me").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  // ---------- explore tabs ----------
  function renderTab() {
    document.querySelectorAll(".tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
    ({ tables: tabTables, allowances: tabAllowances, travel: tabTravel, compare: tabCompare, guide: tabGuide })[state.tab]($("#tabPanel"));
  }
  document.querySelectorAll(".tabs [role=tab]").forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; renderTab(); }));

  function tabTables(el) {
    const a = shown();
    if (["GS", "LEO", "FWS", "MIL", "SES"].indexOf(state.tableKind) < 0) state.tableKind = "GS";
    const kinds = [["GS", "GS"], ["LEO", "LEO"], ["FWS", "FWS"], ["MIL", "Military"], ["SES", "SES & EX"]];
    let html = `<div class="tab-toolbar"><div class="seg">${kinds.map(([k, t]) => `<button type="button" data-k="${k}" aria-checked="${state.tableKind === k}">${t}</button>`).join("")}</div><span class="muted small">Your cell is highlighted. Tap any cell to preview it.</span></div>`;
    if (state.tableKind === "GS" || state.tableKind === "LEO") {
      const leoMode = state.tableKind === "LEO";
      const first = leoMode ? G.leo(state.year, 3, 1, state.loc) : G.gs(state.year, 1, 1, state.loc);
      html += `<p class="muted">${state.year} yearly pay · ${first.localityName} (${f.pct(first.localityPct)})${leoMode ? ", without LEAP" : ""} ${badge(first.status)}</p>`;
      html += `<div class="table-scroll"><table class="grid"><thead><tr><th>Grade</th>${range(1, 10).map((s) => `<th>Step ${s}</th>`).join("")}</tr></thead><tbody>`;
      (leoMode ? range(3, 15) : range(1, 15)).forEach((g) => {
        html += `<tr><td>GS-${g}</td>${range(1, 10).map((s) => {
          const v = leoMode ? G.leo(state.year, g, s, state.loc).adjusted : G.gs(state.year, g, s, state.loc).annual;
          const hit = a.system === state.tableKind && a.grade === g && a.step === s;
          return `<td class="${hit ? "hit" : ""}" data-pick='${JSON.stringify({ system: state.tableKind, grade: g, step: s })}'>${f.usd(v)}</td>`;
        }).join("")}</tr>`;
      });
      html += `</tbody></table></div>`;
    } else if (state.tableKind === "FWS") {
      const sch = a.system === "FWS" ? a.schedule : "WG";
      html += `<p class="muted">${sch} hourly rates · ${G.fws(state.year, sch, 1, 1, state.loc).areaName} ${badge("simulated")}</p>`;
      html += `<div class="table-scroll"><table class="grid"><thead><tr><th>Grade</th>${range(1, 5).map((s) => `<th>Step ${s}</th>`).join("")}</tr></thead><tbody>`;
      range(1, G.FWS_SCHEDULES[sch].grades).forEach((g) => {
        html += `<tr><td>${sch}-${g}</td>${range(1, 5).map((s) => {
          const hit = a.system === "FWS" && a.schedule === sch && a.grade === g && a.step === s;
          return `<td class="${hit ? "hit" : ""}" data-pick='${JSON.stringify({ system: "FWS", schedule: sch, grade: g, step: s })}'>${f.usd2(G.fws(state.year, sch, g, s, state.loc).hourly)}</td>`;
        }).join("")}</tr>`;
      });
      html += `</tbody></table></div>`;
    } else if (state.tableKind === "MIL") {
      const t = G.milTable(state.year);
      const col = t.columns.reduce((acc, c) => (a.yos >= c ? c : acc), 0);
      html += `<p class="muted">${state.year} monthly basic pay by years of service (the same at every location) ${badge(state.year > G.CURRENT_YEAR ? "projected" : "approx")}</p>`;
      html += `<div class="table-scroll"><table class="grid"><thead><tr><th>Grade</th>${t.columns.map((c) => `<th>${c === 0 ? "&lt;2" : c}</th>`).join("")}</tr></thead><tbody>`;
      ALL_MIL.forEach((g) => {
        html += `<tr><td>${g}</td>${t.rows[g].map((v, i) => {
          const hit = a.system === "MIL" && a.mgrade === g && t.columns[i] === col;
          return `<td class="${v == null ? "na" : ""} ${hit ? "hit" : ""}" ${v == null ? "" : `data-pick='${JSON.stringify({ system: "MIL", mgrade: g, yos: t.columns[i], deps: a.deps !== false })}'`}>${v == null ? "·" : f.usd(v)}</td>`;
        }).join("")}</tr>`;
      });
      html += `</tbody></table></div>`;
    } else {
      const s = G.ses(state.year), ex = G.executiveSchedule(state.year);
      html += `<div class="cards">
        <div class="mini"><div class="k">SES minimum</div><div class="v">${f.usd(s.min)}</div></div>
        <div class="mini"><div class="k">SES max (certified)</div><div class="v">${f.usd(s.maxCertified)}</div></div>
        <div class="mini"><div class="k">SES max (not certified)</div><div class="v">${f.usd(s.maxUncertified)}</div></div>
        ${["I", "II", "III", "IV", "V"].map((l) => `<div class="mini"><div class="k">Executive Schedule ${l}</div><div class="v">${f.usd(ex[l])}</div></div>`).join("")}
      </div><p class="muted">${s.note} EX-IV (${f.usd(ex.IV)}) also caps GS pay including locality. ${badge(s.status)}</p>`;
    }
    el.innerHTML = html;
    el.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { state.tableKind = b.dataset.k; renderTab(); }));
    el.querySelectorAll("[data-pick]").forEach((td) => (td.onclick = () => {
      const pick = JSON.parse(td.dataset.pick);
      const np = Object.assign({}, state.me, pick);
      if (JSON.stringify(np) === JSON.stringify(state.me)) state.preview = null; else state.preview = np;
      render(); $("#me").scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  function tabAllowances(el) {
    const loc = G.location(state.loc), a = shown();
    const first = G.bah(state.year, "E-5", true, state.loc);
    let html = `<div class="cards" style="margin-bottom:16px">
      <div class="mini"><div class="k">BAS · enlisted</div><div class="v">${f.usd2(G.bas(state.year, "E-5"))}</div><div class="muted">per month, tax-free</div></div>
      <div class="mini"><div class="k">BAS · officers &amp; warrants</div><div class="v">${f.usd2(G.bas(state.year, "O-3"))}</div><div class="muted">per month, tax-free</div></div>
      <div class="mini"><div class="k">Housing area</div><div class="v" style="font-size:18px">${first.mhaName}</div><div class="muted">${loc.name}</div></div>
    </div><p class="muted">${state.year} monthly BAH ${badge(first.status)}</p>
    <div class="table-scroll"><table class="grid"><thead><tr><th>Grade</th><th>With dependents</th><th>Without</th><th>Yearly (with)</th></tr></thead><tbody>`;
    ALL_MIL.forEach((g) => {
      const w = G.bah(state.year, g, true, state.loc).monthly, wo = G.bah(state.year, g, false, state.loc).monthly;
      const hit = a.system === "MIL" && a.mgrade === g;
      html += `<tr><td>${g}</td><td class="${hit && a.deps ? "hit" : ""}">${f.usd(w)}</td><td class="${hit && !a.deps ? "hit" : ""}">${f.usd(wo)}</td><td>${f.usd(w * 12)}</td></tr>`;
    });
    el.innerHTML = html + `</tbody></table></div>`;
  }

  function tabTravel(el) {
    const pd = G.perDiem(state.year, state.loc, 1);
    const months = range(1, 12).map((m) => G.perDiem(state.year, state.loc, m));
    const max = Math.max.apply(null, months.map((m) => m.lodging));
    const t = G.trip(state.year, state.loc, state.tripStart, state.tripNights);
    el.innerHTML = `
      <h3 title="${pd.areaDetail}">${pd.areaName} ${badge(pd.status)}</h3>
      <p class="muted">${pd.fiscalYear} per diem. M&amp;IE is ${f.usd(pd.mie)} a day, and ${f.usd2(pd.firstLastMie)} (75%) on the first and last travel days.</p>
      <div class="months">${months.map((m, i) => `<div class="month" style="background:color-mix(in srgb, var(--accent) ${Math.round((0.15 + 0.85 * (m.lodging / max)) * 60)}%, var(--surface-2))"><span>${"JFMAMJJASOND"[i]}</span><b>${f.usd(m.lodging)}</b></div>`).join("")}</div>
      <h3>Trip estimator</h3>
      <div class="tab-toolbar">
        <label class="ctl">Arrive<input type="date" id="tripStart" value="${state.tripStart}"></label>
        <label class="ctl">Nights<input type="number" id="tripNights" min="0" max="60" value="${state.tripNights}"></label>
      </div>
      <div class="cards">
        <div class="mini"><div class="k">Lodging max</div><div class="v">${f.usd(t.lodging)}</div></div>
        <div class="mini"><div class="k">M&amp;IE</div><div class="v">${f.usd2(t.mie)}</div></div>
        <div class="mini"><div class="k">Total allowable</div><div class="v">${f.usd2(t.total)}</div></div>
      </div>
      <p class="hint">Lodging covers ${state.tripNights} night(s), and M&amp;IE covers ${state.tripNights + 1} travel day(s). This is an estimate only. JTR/FTR rules decide the actual amount.</p>`;
    $("#tripStart", el).onchange = (e) => { state.tripStart = e.target.value; tabTravel(el); };
    $("#tripNights", el).onchange = (e) => { state.tripNights = Math.max(0, Math.min(60, +e.target.value || 0)); tabTravel(el); };
  }

  function tabCompare(el) {
    const b = state.b;
    const ra = G.compute(state.me, state.year, state.loc);
    const draw = () => {
      const rb = G.compute(b, state.year, state.loc);
      const d = (rb.annual || 0) - (ra.annual || 0);
      $("#cmpOut", el).innerHTML = `<div class="cmp-nums"><div><span class="muted">Your pay</span><b>${f.usd(ra.annual)}</b><small>${ra.title}</small></div><div><span class="muted">Other job</span><b>${f.usd(rb.annual)}</b><small>${rb.title}</small></div></div>
        <div class="delta">${ra.annual && rb.annual ? `${rb.title} pays <b>${f.usd(Math.abs(d))}</b> a year ${d >= 0 ? "more" : "less"} (${Math.abs(Math.round((d / ra.annual) * 100))}%). Cash only: benefits, retirement and taxes aren't compared.` : "Pick a valid grade and years of service."}</div>`;
    };
    el.innerHTML = `<p class="muted">Compare your pay with any other job, in the same year and location.</p>
      <div class="cmp-form"><div class="ifield"><span class="lbl">Pay system</span><select id="cmpSys">${SYSTEMS.map((s) => `<option value="${s.k}" ${s.k === b.system ? "selected" : ""}>${s.t}</option>`).join("")}</select></div><div id="cmpGrade" class="cmp-grade">${gradeControls(b, true)}</div></div>
      <div id="cmpOut"></div>`;
    $("#cmpSys", el).onchange = (e) => { b.system = e.target.value; tabCompare(el); };
    wireGrade($("#cmpGrade", el), b, (slider) => { if (slider) draw(); else tabCompare(el); });
    draw();
  }

  function tabGuide(el) {
    el.innerHTML = `<h3>Federal pay in four ideas</h3>
      <ol class="guide-steps">
        <li><strong>Grade = level, step = time.</strong> Civilians are hired at a grade (GS-1 to 15), and step raises come with time. Service members advance by rank (E, W or O) and years of service.</li>
        <li><strong>Where you work matters.</strong> Civilians get <em>locality pay</em>, from 17% to 45%+ on top of base pay. Military members get <em>BAH</em> for housing, which is tax-free and changes by ZIP code and rank.</li>
        <li><strong>Trades and executives use their own tables.</strong> FWS (WG, WL, WS) pays by the hour from local wage surveys. SES pay is one band with no locality pay.</li>
        <li><strong>Travel is paid separately.</strong> Per diem covers lodging plus meals and incidentals while you're on official travel. It isn't income.</li>
      </ol>
      <h3 style="margin-top:20px">Rough equivalents <span class="badge approx">Unofficial</span></h3>
      <div class="table-scroll"><table class="grid"><thead><tr><th>Civilian</th><th>Military</th><th>Typical role</th></tr></thead><tbody>
      ${G.EQUIVALENTS.map((e) => `<tr><td>${e.gs}</td><td style="text-align:left">${e.mil}</td><td style="text-align:left">${e.role}</td></tr>`).join("")}
      </tbody></table></div>`;
  }

  // ---------- render ----------
  $("#homeLink").onclick = (e) => { e.preventDefault(); state.preview = null; state.editing = false; render(); };
  function render() {
    renderYear();
    const setup = !state.me || state.editing;
    $("#setup").hidden = !setup; $("#dash").hidden = setup;
    if (setup) { renderSetup(); return; }
    renderBanner(); renderMe(); renderNext(); renderTab();
    if (!state.preview) writeHash();
  }
  render();
})();
