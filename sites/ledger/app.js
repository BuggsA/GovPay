/* GovPay Ledger — calculator-first dashboard. */
(function () {
  "use strict";
  const G = window.GovPay, f = G.fmt;
  const $ = (s, el) => (el || document).querySelector(s);
  const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content; };
  const ALL_MIL = [].concat(G.MIL_GRADES.enlisted, G.MIL_GRADES.warrant, G.MIL_GRADES.officer, G.MIL_GRADES.priorEnlisted);
  const COLORS = { base: "var(--bar-1)", locality: "var(--bar-2)", leap: "var(--bar-3)", bah: "var(--bar-2)", bas: "var(--bar-3)" };
  const SYSTEMS = [
    ["GS", "GS", "General Schedule"], ["LEO", "LEO", "Law enforcement"], ["FWS", "FWS", "Wage grade"],
    ["SES", "SES", "Executive"], ["MIL", "Military", "Enl / WO / Off"],
  ];

  const state = {
    year: G.CURRENT_YEAR, loc: "dc", period: "year", tab: "tables",
    a: Object.assign({}, G.DEFAULT_PROFILE),
    b: Object.assign({}, G.DEFAULT_PROFILE, { system: "MIL", mgrade: "O-3", yos: 8 }),
    tableKind: "GS", tripStart: G.CURRENT_YEAR + "-04-14", tripNights: 3,
  };
  readHash();

  // ---------- global controls ----------
  function renderYear() {
    const seg = $("#yearSeg");
    seg.innerHTML = "";
    G.YEARS.forEach((y) => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(y.year === state.year));
      b.textContent = y.year === 2027 ? "2027 est." : y.label;
      b.title = y.note;
      b.onclick = () => { state.year = y.year; renderAll(); };
      seg.appendChild(b);
    });
  }
  function renderLoc() {
    const sel = $("#locSelect");
    const groups = {};
    G.locations().forEach((l) => {
      const g = l.simulated ? "Other states (simulated)" : l.stateName;
      (groups[g] = groups[g] || []).push(l);
    });
    sel.innerHTML = Object.keys(groups).map((g) =>
      `<optgroup label="${g}">${groups[g].map((l) => `<option value="${l.id}">${l.name}</option>`).join("")}</optgroup>`).join("");
    sel.value = state.loc;
    sel.onchange = () => { state.loc = sel.value; renderAll(); };
  }

  // ---------- profile form (reused for compare) ----------
  function chips(values, current, labelFn) {
    return `<div class="chips">${values.map((v) => `<button type="button" data-v="${v}" aria-pressed="${v == current}">${labelFn ? labelFn(v) : v}</button>`).join("")}</div>`;
  }
  function renderProfile(el, p, onChange, compact) {
    const sys = SYSTEMS.map(([k, t, s]) => `<button type="button" data-sys="${k}" aria-pressed="${p.system === k}">${t}<small>${compact ? "" : s}</small></button>`).join("");
    let body = "";
    if (p.system === "GS" || p.system === "LEO") {
      const minG = p.system === "LEO" ? 3 : 1;
      if (p.grade < minG) p.grade = minG;
      body += `<div class="field"><span class="lbl">Grade</span>${chips(range(minG, 15), p.grade, (v) => "GS-" + v)}</div>`;
      body += `<div class="field"><span class="lbl">Step</span>${chips(range(1, 10), p.step)}</div>`;
      if (p.system === "LEO") body += `<div class="field"><label class="toggle"><input type="checkbox" data-leap ${p.leap ? "checked" : ""}> Include LEAP (25% availability pay)</label><div class="hint">Criminal investigators (GS-1811) usually get LEAP. Uniformed police generally don't.</div></div>`;
    } else if (p.system === "FWS") {
      const max = G.FWS_SCHEDULES[p.schedule].grades;
      if (p.grade > max) p.grade = max;
      if (p.step > 5) p.step = 2;
      body += `<div class="field"><span class="lbl">Schedule</span>${chips(Object.keys(G.FWS_SCHEDULES), p.schedule, (v) => v)}<div class="hint">${G.FWS_SCHEDULES[p.schedule].name}</div></div>`;
      body += `<div class="field"><span class="lbl">Grade</span>${chips(range(1, max), p.grade, (v) => p.schedule + "-" + v)}</div>`;
      body += `<div class="field"><span class="lbl">Step</span>${chips(range(1, 5), p.step)}</div>`;
    } else if (p.system === "SES") {
      body += `<div class="field"><span class="lbl">Where in the range?</span><div class="range-row"><input type="range" min="0" max="1" step="0.05" value="${p.sesPoint}" data-ses><output>${Math.round(p.sesPoint * 100)}%</output></div><div class="hint">There are no grades or steps in the SES. The agency sets pay within one band, and there is no locality pay.</div></div>`;
    } else {
      body += `<div class="field"><label>Pay grade</label><select data-mgrade>${
        [["Enlisted", G.MIL_GRADES.enlisted], ["Warrant officer", G.MIL_GRADES.warrant], ["Commissioned officer", G.MIL_GRADES.officer], ["Officer w/ 4+ yrs prior enlisted", G.MIL_GRADES.priorEnlisted]]
          .map(([lbl, gs]) => `<optgroup label="${lbl}">${gs.map((g) => `<option ${g === p.mgrade ? "selected" : ""}>${g}</option>`).join("")}</optgroup>`).join("")
      }</select></div>`;
      body += `<div class="field"><span class="lbl">Years of service</span><div class="range-row"><input type="range" min="0" max="40" value="${p.yos}" data-yos><output>${p.yos} yrs</output></div></div>`;
      body += `<div class="field"><label class="toggle"><input type="checkbox" data-deps ${p.deps ? "checked" : ""}> I have dependents (for BAH)</label></div>`;
    }
    el.innerHTML = `<div class="sys-tabs">${sys}</div>${body}`;

    el.querySelectorAll("[data-sys]").forEach((b) => (b.onclick = () => { p.system = b.dataset.sys; onChange(); }));
    const grids = el.querySelectorAll(".field");
    grids.forEach((fd) => {
      const lbl = (fd.querySelector(".lbl") || {}).textContent || "";
      fd.querySelectorAll(".chips button").forEach((b) => (b.onclick = () => {
        const v = b.dataset.v;
        if (lbl === "Grade") p.grade = +v;
        else if (lbl === "Step") p.step = +v;
        else if (lbl === "Schedule") p.schedule = v;
        onChange();
      }));
    });
    const leap = $("[data-leap]", el); if (leap) leap.onchange = () => { p.leap = leap.checked; onChange(); };
    const mg = $("[data-mgrade]", el); if (mg) mg.onchange = () => { p.mgrade = mg.value; onChange(); };
    const yos = $("[data-yos]", el); if (yos) yos.oninput = () => { p.yos = +yos.value; yos.nextElementSibling.textContent = p.yos + " yrs"; onChange(true); };
    const dp = $("[data-deps]", el); if (dp) dp.onchange = () => { p.deps = dp.checked; onChange(); };
    const sr = $("[data-ses]", el); if (sr) sr.oninput = () => { p.sesPoint = +sr.value; sr.nextElementSibling.textContent = Math.round(p.sesPoint * 100) + "%"; onChange(true); };
  }

  // ---------- result ----------
  function periodDivisor(p) {
    if (state.period === "month") return 12;
    if (state.period === "check") return p.system === "MIL" ? 24 : 26;
    if (state.period === "hour") return 2087;
    return 1;
  }
  function periodLabel(p) {
    return { year: "per year", month: "per month", check: p.system === "MIL" ? "per paycheck (1st/15th)" : "per biweekly paycheck", hour: "per hour" }[state.period];
  }
  function badge(status) { const s = G.STATUS_INFO[status]; return `<span class="badge ${status}" title="${s.desc}">${s.label}</span>`; }

  function renderResult(el, p, compact) {
    const r = G.compute(p, state.year, state.loc);
    if (state.period === "hour" && p.system === "MIL") state.period = "month";
    const d = periodDivisor(p);
    const periods = [["year", "Year"], ["month", "Month"], ["check", "Paycheck"]].concat(p.system === "MIL" ? [] : [["hour", "Hour"]]);
    const total = r.annual;
    const bar = r.rows.map((row) => `<span style="width:${total ? (row.annual / total) * 100 : 0}%;background:${COLORS[row.key]}" title="${row.label}"></span>`).join("");
    const rows = r.rows.map((row) => `<tr><td><span class="dot" style="background:${COLORS[row.key]}"></span>${row.label}${row.taxFree ? ' <span class="muted">· tax-free</span>' : ""}</td><td>${f.usd(row.annual / d)}</td></tr>`).join("");
    const loc = G.location(state.loc);
    el.innerHTML = `
      <div class="result-head">
        <div><div class="result-title">${r.title} · ${loc.name} · ${state.year}</div></div>
        <div>${badge(r.status)}</div>
      </div>
      <div class="big">${total == null ? "—" : f.usd(total / d)} <small>${periodLabel(p)}</small></div>
      <div class="subline">${total == null ? "" : `${f.usd(total)} a year${r.hourly ? ` · ${f.usd2(r.hourly)}/hr` : ""}${p.system === "MIL" ? ` · ≈ ${f.usd(r.mil.rmc)} counting the tax advantage` : ""}`}</div>
      ${compact ? "" : `<div class="seg" role="radiogroup" aria-label="Show amounts">${periods.map(([k, t]) => `<button type="button" role="radio" data-per="${k}" aria-checked="${state.period === k}">${t}</button>`).join("")}</div>`}
      <div class="stackbar">${bar}</div>
      <table class="rows"><tbody>${rows}<tr class="total"><td>Total</td><td>${f.usd(total / d)}</td></tr></tbody></table>
      <div class="notes">${r.notes.map((n) => `<p>${n}</p>`).join("")}</div>`;
    el.querySelectorAll("[data-per]").forEach((b) => (b.onclick = () => { state.period = b.dataset.per; renderCalc(); }));
    return r;
  }

  function renderCalc(fromSlider) {
    if (!fromSlider) renderProfile($("#profileA"), state.a, (s) => { renderCalc(s); if (state.tab === "tables" || state.tab === "compare") renderTab(); writeHash(); });
    renderResult($("#resultA"), state.a);
  }

  // ---------- tabs ----------
  function renderTab() {
    document.querySelectorAll(".tabs [role=tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === state.tab)));
    const el = $("#tabPanel");
    ({ tables: tabTables, allowances: tabAllowances, travel: tabTravel, compare: tabCompare, guide: tabGuide })[state.tab](el);
  }
  document.querySelectorAll(".tabs [role=tab]").forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; renderTab(); writeHash(); }));

  function tabTables(el) {
    const kinds = [["GS", "GS (with locality)"], ["LEO", "LEO special rates"], ["FWS", "FWS hourly"], ["MIL", "Military basic pay"], ["SES", "SES & Executive Schedule"]];
    let html = `<div class="tab-toolbar"><div class="seg">${kinds.map(([k, t]) => `<button type="button" data-k="${k}" aria-checked="${state.tableKind === k}">${t}</button>`).join("")}</div></div>`;
    const loc = G.location(state.loc), a = state.a;
    if (state.tableKind === "GS" || state.tableKind === "LEO") {
      const leoMode = state.tableKind === "LEO";
      const grades = leoMode ? range(3, 10) : range(1, 15);
      const first = leoMode ? G.leo(state.year, 3, 1, state.loc) : G.gs(state.year, 1, 1, state.loc);
      html += `<p class="muted">${state.year} annual pay, ${first.localityName} (${f.pct(first.localityPct)}). ${leoMode ? "This is the LEO special base rate plus locality, without LEAP." : "The highlighted cell is your selection."} ${badge(first.status)}</p>`;
      html += `<div class="table-scroll"><table class="grid"><thead><tr><th>Grade</th>${range(1, 10).map((s) => `<th>Step ${s}</th>`).join("")}</tr></thead><tbody>`;
      grades.forEach((g) => {
        html += `<tr><td>GS-${g}</td>${range(1, 10).map((s) => {
          const v = leoMode ? G.leo(state.year, g, s, state.loc).adjusted : G.gs(state.year, g, s, state.loc).annual;
          const hit = a.system === state.tableKind && a.grade === g && a.step === s;
          return `<td class="${hit ? "hit" : ""}">${f.usd(v)}</td>`;
        }).join("")}</tr>`;
      });
      html += `</tbody></table></div>`;
    } else if (state.tableKind === "FWS") {
      const sch = a.system === "FWS" ? a.schedule : "WG";
      const r0 = G.fws(state.year, sch, 1, 1, state.loc);
      html += `<p class="muted">${sch} hourly rates · ${r0.areaName} ${badge("simulated")}</p>`;
      html += `<div class="table-scroll"><table class="grid"><thead><tr><th>Grade</th>${range(1, 5).map((s) => `<th>Step ${s}</th>`).join("")}<th>Step 2 annual</th></tr></thead><tbody>`;
      range(1, G.FWS_SCHEDULES[sch].grades).forEach((g) => {
        html += `<tr><td>${sch}-${g}</td>${range(1, 5).map((s) => {
          const hit = a.system === "FWS" && a.grade === g && a.step === s;
          return `<td class="${hit ? "hit" : ""}">${f.usd2(G.fws(state.year, sch, g, s, state.loc).hourly)}</td>`;
        }).join("")}<td>${f.usd(G.fws(state.year, sch, g, 2, state.loc).annual)}</td></tr>`;
      });
      html += `</tbody></table></div>`;
    } else if (state.tableKind === "MIL") {
      const t = G.milTable(state.year);
      html += `<p class="muted">${state.year} monthly basic pay by years of service. It's the same everywhere; only BAH changes with location. ${badge(state.year > G.CURRENT_YEAR ? "projected" : "approx")}</p>`;
      html += `<div class="table-scroll"><table class="grid"><thead><tr><th>Grade</th>${t.columns.map((c) => `<th>${c === 0 ? "&lt;2" : c}</th>`).join("")}</tr></thead><tbody>`;
      ALL_MIL.forEach((g) => {
        const col = t.columns.reduce((acc, c) => (a.yos >= c ? c : acc), 0);
        html += `<tr><td>${g}</td>${t.rows[g].map((v, i) => {
          const hit = a.system === "MIL" && a.mgrade === g && t.columns[i] === col;
          return `<td class="${v == null ? "na" : ""} ${hit ? "hit" : ""}">${v == null ? "·" : f.usd(v)}</td>`;
        }).join("")}</tr>`;
      });
      html += `</tbody></table></div>`;
    } else {
      const s = G.ses(state.year), ex = G.executiveSchedule(state.year);
      html += `<div class="cards">
        <div class="mini"><div class="k">SES minimum</div><div class="v">${f.usd(s.min)}</div></div>
        <div class="mini"><div class="k">SES max (certified system)</div><div class="v">${f.usd(s.maxCertified)}</div></div>
        <div class="mini"><div class="k">SES max (not certified)</div><div class="v">${f.usd(s.maxUncertified)}</div></div>
        ${["I", "II", "III", "IV", "V"].map((l) => `<div class="mini"><div class="k">Executive Schedule level ${l}</div><div class="v">${f.usd(ex[l])}</div></div>`).join("")}
      </div><p class="muted">${s.note} EX-IV (${f.usd(ex.IV)}) is also the cap on GS pay including locality. ${badge(s.status)}</p>`;
    }
    el.innerHTML = html;
    el.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { state.tableKind = b.dataset.k; renderTab(); }));
  }

  function tabAllowances(el) {
    const loc = G.location(state.loc);
    const first = G.bah(state.year, "E-5", true, state.loc);
    let html = `<div class="cards" style="margin-bottom:16px">
      <div class="mini"><div class="k">BAS · enlisted</div><div class="v">${f.usd2(G.bas(state.year, "E-5"))}</div><div class="muted">per month, tax-free</div></div>
      <div class="mini"><div class="k">BAS · officers &amp; warrants</div><div class="v">${f.usd2(G.bas(state.year, "O-3"))}</div><div class="muted">per month, tax-free</div></div>
      <div class="mini"><div class="k">Housing area</div><div class="v" style="font-size:18px">${first.mhaName}</div><div class="muted">${loc.name}</div></div>
    </div>`;
    html += `<p class="muted">${state.year} monthly BAH for ${first.mhaName}. ${badge(first.status)}</p>`;
    html += `<div class="table-scroll"><table class="grid"><thead><tr><th>Grade</th><th>With dependents</th><th>Without</th><th>Yearly (with)</th></tr></thead><tbody>`;
    ALL_MIL.forEach((g) => {
      const w = G.bah(state.year, g, true, state.loc).monthly, wo = G.bah(state.year, g, false, state.loc).monthly;
      const hit = state.a.system === "MIL" && state.a.mgrade === g;
      html += `<tr><td>${g}</td><td class="${hit && state.a.deps ? "hit" : ""}">${f.usd(w)}</td><td class="${hit && !state.a.deps ? "hit" : ""}">${f.usd(wo)}</td><td>${f.usd(w * 12)}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    el.innerHTML = html;
  }

  function tabTravel(el) {
    const pd = G.perDiem(state.year, state.loc, 1);
    const months = range(1, 12).map((m) => G.perDiem(state.year, state.loc, m));
    const max = Math.max.apply(null, months.map((m) => m.lodging));
    const t = G.trip(state.year, state.loc, state.tripStart, state.tripNights);
    el.innerHTML = `
      <h3>${pd.areaName} ${badge(pd.status)}</h3>
      <p class="muted">${pd.fiscalYear} per diem. M&amp;IE (meals and incidentals) is ${f.usd(pd.mie)} a day, and ${f.usd2(pd.firstLastMie)} (75%) on the first and last travel days.</p>
      <div class="months">${months.map((m, i) => {
        const alpha = 0.15 + 0.85 * (m.lodging / max);
        return `<div class="month" style="background:color-mix(in srgb, var(--accent) ${Math.round(alpha * 60)}%, var(--surface-2))"><span>${"JFMAMJJASOND"[i]}</span><b>${f.usd(m.lodging)}</b></div>`;
      }).join("")}</div>
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
      <p class="hint">Lodging covers ${state.tripNights} night(s), and M&amp;IE covers ${state.tripNights + 1} travel day(s). This is an estimate only. Your agency's travel rules (JTR/FTR) decide the actual amount.</p>`;
    $("#tripStart", el).onchange = (e) => { state.tripStart = e.target.value; tabTravel(el); };
    $("#tripNights", el).onchange = (e) => { state.tripNights = Math.max(0, Math.min(60, +e.target.value || 0)); tabTravel(el); };
  }

  function tabCompare(el) {
    el.innerHTML = `<p class="muted">Compare your profile (left) with any other job, using the same year and location.</p>
      <div class="compare"><div class="col"><div id="cmpA"></div></div><div class="col"><div id="cmpBForm"></div><div id="cmpB"></div></div></div>
      <div class="delta" id="cmpDelta"></div>`;
    const draw = () => {
      const ra = renderResult($("#cmpA", el), state.a, true);
      const rb = renderResult($("#cmpB", el), state.b, true);
      const d = (rb.annual || 0) - (ra.annual || 0);
      $("#cmpDelta", el).textContent = ra.annual && rb.annual
        ? `${rb.title} pays ${f.usd(Math.abs(d))} a year ${d >= 0 ? "more" : "less"} than ${ra.title} in cash (${Math.abs(Math.round((d / ra.annual) * 100))}%). Benefits, retirement and taxes are not compared.`
        : "Pick a valid grade and years of service.";
    };
    renderProfile($("#cmpBForm", el), state.b, (slider) => { if (slider) draw(); else tabCompare(el); }, true);
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
      </tbody></table></div>
      <p class="hint">These are for orientation only. Protocol and benefit equivalencies differ by agency.</p>`;
  }

  // ---------- URL hash (shareable state) ----------
  function writeHash() {
    const p = state.a;
    const parts = [`y=${state.year}`, `l=${state.loc}`, `s=${p.system}`, `t=${state.tab}`];
    if (p.system === "MIL") parts.push(`g=${p.mgrade}`, `yos=${p.yos}`, `d=${p.deps ? 1 : 0}`);
    else if (p.system === "SES") parts.push(`pt=${p.sesPoint}`);
    else parts.push(`g=${p.grade}`, `st=${p.step}`, p.system === "FWS" ? `sch=${p.schedule}` : "", p.system === "LEO" ? `leap=${p.leap ? 1 : 0}` : "");
    history.replaceState(null, "", "#" + parts.filter(Boolean).join("&"));
  }
  function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    if (!q.has("y")) return;
    state.year = +q.get("y") || state.year;
    if (G.locations().some((l) => l.id === q.get("l"))) state.loc = q.get("l");
    state.tab = q.get("t") || state.tab;
    const p = state.a; p.system = q.get("s") || p.system;
    if (p.system === "MIL") { p.mgrade = q.get("g") || p.mgrade; p.yos = +q.get("yos") || 0; p.deps = q.get("d") !== "0"; }
    else if (p.system === "SES") p.sesPoint = +q.get("pt") || 0.5;
    else { p.grade = +q.get("g") || p.grade; p.step = +q.get("st") || p.step; p.schedule = q.get("sch") || p.schedule; p.leap = q.get("leap") !== "0"; }
  }

  function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }
  function renderAll() { renderYear(); renderLoc(); renderCalc(); renderTab(); writeHash(); }
  renderAll();
})();
