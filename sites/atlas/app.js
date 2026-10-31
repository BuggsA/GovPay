/* GovPay Atlas — place-first editorial explorer. */
(function () {
  "use strict";
  const G = window.GovPay, f = G.fmt;
  const $ = (s, el) => (el || document).querySelector(s);
  const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
  const MONTH = new Date().getMonth() + 1;

  // US tile-grid layout [col,row]
  const TILES = {
    AK: [0, 0], ME: [11, 0], VT: [10, 1], NH: [11, 1],
    WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], WI: [7, 2], MI: [8, 2], NY: [9, 2], RI: [10, 2], MA: [11, 2],
    OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3],
    CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4],
    AZ: [2, 5], NM: [3, 5], KS: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5], DC: [9, 5],
    OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6],
    HI: [0, 7], TX: [4, 7], FL: [9, 7],
  };
  const METRICS = [
    { key: "locality", label: "GS locality %", val: (l) => G.gs(state.year, 1, 1, l.id).localityPct, fmt: (v) => v.toFixed(1) + "%" },
    { key: "gs12", label: "GS-12 step 1", val: (l) => G.gs(state.year, 12, 1, l.id).annual, fmt: (v) => "$" + Math.round(v / 1000) + "k" },
    { key: "bah", label: "BAH (E-5 w/ dep)", val: (l) => G.bah(state.year, "E-5", true, l.id).monthly, fmt: (v) => f.usd(v) },
    { key: "perdiem", label: "Per diem", val: (l) => { const p = G.perDiem(state.year, l.id, MONTH); return p.total; }, fmt: (v) => f.usd(v) + "/day" },
  ];
  const JOBS = [
    { key: "gs7", label: "GS-7 step 1 (new grad)", p: { system: "GS", grade: 7, step: 1 } },
    { key: "gs12", label: "GS-12 step 1", p: { system: "GS", grade: 12, step: 1 } },
    { key: "gs13", label: "GS-13 step 5", p: { system: "GS", grade: 13, step: 5 } },
    { key: "leo", label: "LEO GS-12 step 5 + LEAP", p: { system: "LEO", grade: 12, step: 5, leap: true } },
    { key: "wg10", label: "WG-10 step 2 (trades)", p: { system: "FWS", schedule: "WG", grade: 10, step: 2 } },
    { key: "e5", label: "E-5, 6 yrs, w/ dependents", p: { system: "MIL", mgrade: "E-5", yos: 6, deps: true } },
    { key: "o3", label: "O-3, 6 yrs, w/ dependents", p: { system: "MIL", mgrade: "O-3", yos: 6, deps: true } },
    { key: "w2", label: "W-2, 12 yrs, w/ dependents", p: { system: "MIL", mgrade: "W-2", yos: 12, deps: true } },
  ];

  const state = { year: G.CURRENT_YEAR, metric: "locality", state: "DC", loc: "dc", job: "gs12", gsG: 11, gsS: 1, mG: "E-6", mY: 10 };

  function locsIn(st) { return G.locations().filter((l) => l.state === st); }
  function statusTag(s) { return `<span class="status ${s}" title="${G.STATUS_INFO[s].desc}">${G.STATUS_INFO[s].label}</span>`; }

  // ---------- masthead ----------
  function renderYears() {
    $("#years").innerHTML = G.YEARS.map((y) => `<button type="button" role="radio" aria-checked="${y.year === state.year}" data-y="${y.year}">${y.year}${y.year > G.CURRENT_YEAR ? " (forecast)" : ""}</button>`).join(" ");
    $("#years").querySelectorAll("button").forEach((b) => (b.onclick = () => { state.year = +b.dataset.y; render(); }));
    $("#placeTitle").textContent = G.location(state.loc).name.replace(/ \(.*\)$/, "");
  }

  // ---------- tile map ----------
  function renderMap() {
    const M = METRICS.find((m) => m.key === state.metric);
    $("#metric").innerHTML = METRICS.map((m) => `<button type="button" role="radio" aria-checked="${m.key === state.metric}" data-m="${m.key}">${m.label}</button>`).join("");
    $("#metric").querySelectorAll("button").forEach((b) => (b.onclick = () => { state.metric = b.dataset.m; renderMap(); }));
    const vals = {};
    Object.keys(TILES).forEach((st) => {
      const ls = locsIn(st);
      if (ls.length) vals[st] = ls.reduce((a, l) => a + M.val(l), 0) / ls.length;
    });
    const arr = Object.values(vals), lo = Math.min.apply(null, arr), hi = Math.max.apply(null, arr);
    const bin = (v) => Math.min(5, Math.floor(((v - lo) / (hi - lo || 1)) * 6));
    const S = 48, gap = 2, ox = 6, oy = 6;
    $("#tiles").innerHTML = Object.entries(TILES).map(([st, [c, r]]) => {
      const focus = !!G.FOCUS_STATES[st];
      const b = bin(vals[st]);
      const fill = focus ? `var(--seq-${b})` : `url(#hatch${b})`;
      const ink = b >= 3 ? "var(--paper)" : "var(--tile-ink)";
      return `<g class="tile ${focus ? "focus" : ""} ${st === state.state ? "sel" : ""}" data-st="${st}" tabindex="0" role="button" aria-label="${st}: ${M.fmt(vals[st])}${focus ? "" : " (simulated)"}">
        <rect x="${ox + c * (S + gap)}" y="${oy + r * (S + gap)}" width="${S}" height="${S}" rx="4" fill="${fill}"/>
        <text x="${ox + c * (S + gap) + S / 2}" y="${oy + r * (S + gap) + S / 2 + 5}" text-anchor="middle" fill="${ink}">${st}</text></g>`;
    }).join("") + `<defs>${range(0, 5).map((b) => `<pattern id="hatch${b}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--seq-${b})" opacity=".55"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--paper)" stroke-width="2"/></pattern>`).join("")}</defs>`;
    $("#tiles").querySelectorAll(".tile").forEach((t) => {
      const go = () => { state.state = t.dataset.st; state.loc = locsIn(state.state)[0].id; render(); };
      t.onclick = go; t.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
    });
    $("#legend").innerHTML = `<span>${M.fmt(lo)}</span><span class="ramp">${range(0, 5).map((b) => `<span style="background:var(--seq-${b})"></span>`).join("")}</span><span>${M.fmt(hi)}</span>
      <span style="margin-left:12px"><span class="swatch" style="background:var(--seq-2)"></span>Focus states (UT, MD, DC, PA, VA)</span>
      <span><svg width="14" height="14" style="vertical-align:-2px;margin-right:4px"><rect width="14" height="14" fill="url(#hatch2)"/></svg>Simulated</span>`;
  }

  function renderStatePanel() {
    const ls = locsIn(state.state);
    const focus = !!G.FOCUS_STATES[state.state];
    const name = focus ? G.FOCUS_STATES[state.state] : G.OTHER_STATES[state.state];
    $("#statePanel").innerHTML = `<h3>${name}</h3>
      <p class="muted">${focus ? `${ls.length} duty location${ls.length > 1 ? "s" : ""} included. Choose one:` : "This state hasn't been researched yet."}</p>
      <ul class="loclist">${ls.map((l) => `<li><button type="button" data-l="${l.id}" aria-current="${l.id === state.loc}">${l.name}<small>${G.gs(state.year, 1, 1, l.id).localityPct.toFixed(2)}% · ${l.kind}</small></button></li>`).join("")}</ul>
      ${focus ? "" : `<div class="simnote">The numbers shown for ${name} are <b>simulated</b> so the layout can be tested. The first data release covers Utah, Maryland, DC, Pennsylvania and Virginia.</div>`}`;
    $("#statePanel").querySelectorAll("[data-l]").forEach((b) => (b.onclick = () => { state.loc = b.dataset.l; render(); }));
  }

  // ---------- place profile ----------
  function renderProfile() {
    const l = G.location(state.loc), y = state.year;
    const g1 = G.gs(y, 1, 1, l.id);
    const pd = G.perDiem(y, l.id, MONTH);
    const months = range(1, 12).map((m) => G.perDiem(y, l.id, m));
    const pmax = Math.max.apply(null, months.map((m) => m.lodging)), pmin = Math.min.apply(null, months.map((m) => m.lodging));
    const bahE5 = G.bah(y, "E-5", true, l.id);
    const ses = G.ses(y);
    const fwsA = G.fws(y, "WG", 1, 2, l.id);
    const mine = G.compute({ system: "GS", grade: state.gsG, step: state.gsS }, y, l.id);
    const mil = G.compute({ system: "MIL", mgrade: state.mG, yos: state.mY, deps: true }, y, l.id);
    const opt = (vals, cur, lab) => vals.map((v) => `<option value="${v}" ${v == cur ? "selected" : ""}>${lab ? lab(v) : v}</option>`).join("");
    const allMil = [].concat(G.MIL_GRADES.enlisted, G.MIL_GRADES.warrant, G.MIL_GRADES.officer, G.MIL_GRADES.priorEnlisted);

    $("#profile").innerHTML = `
      <div class="profile-head"><div><span class="muted">${l.stateName} · ${l.kind === "base" ? "Installation" : l.kind === "city" ? "City" : "State"} · ${y}</span><h2>${l.name}</h2></div>${statusTag(l.simulated ? "simulated" : y > G.CURRENT_YEAR ? "projected" : "approx")}</div>
      <div class="boxes">
        <div class="box">
          <h3>Civilian (GS) ${statusTag(g1.status)}</h3>
          <div class="lead-num">+${g1.localityPct.toFixed(2)}%</div>
          <div class="lead-cap">Locality pay on top of base pay · ${g1.localityName}</div>
          <table class="t"><thead><tr><th>Grade</th><th>Step 1</th><th>Step 10</th></tr></thead><tbody>
            ${[5, 7, 9, 11, 12, 13, 14, 15].map((g) => `<tr><td>GS-${g}</td><td>${f.usd(G.gs(y, g, 1, l.id).annual)}</td><td>${f.usd(G.gs(y, g, 10, l.id).annual)}</td></tr>`).join("")}
          </tbody></table>
          <div class="calc-line">Your grade <select data-gsg>${opt(range(1, 15), state.gsG, (v) => "GS-" + v)}</select> step <select data-gss>${opt(range(1, 10), state.gsS)}</select> → <b>${f.usd(mine.annual)}</b> / yr</div>
          <table class="t" style="margin-top:14px"><thead><tr><th>Law enforcement</th><th>Base + locality</th><th>With LEAP</th></tr></thead><tbody>
            ${[[5, 1], [7, 1], [9, 1], [12, 5], [13, 5]].map(([g, s]) => { const r = G.leo(y, g, s, l.id, { leap: true }); return `<tr><td>LEO GS-${g}/${s}</td><td>${f.usd(r.adjusted)}</td><td>${f.usd(r.annual)}</td></tr>`; }).join("")}
          </tbody></table>
        </div>
        <div class="box">
          <h3>Military ${statusTag(bahE5.status)}</h3>
          <div class="lead-num">${f.usd(bahE5.monthly)}<span style="font-size:18px">/mo</span></div>
          <div class="lead-cap">BAH for an E-5 with dependents · ${bahE5.mhaName}</div>
          <table class="t"><thead><tr><th>Grade</th><th>BAH w/ dep</th><th>BAH w/o</th></tr></thead><tbody>
            ${["E-4", "E-6", "E-8", "W-2", "W-4", "O-1", "O-3", "O-5"].map((g) => `<tr><td>${g}</td><td>${f.usd(G.bah(y, g, true, l.id).monthly)}</td><td>${f.usd(G.bah(y, g, false, l.id).monthly)}</td></tr>`).join("")}
          </tbody></table>
          <p class="muted" style="font-size:13px;margin:8px 0 0">BAS: ${f.usd2(G.bas(y, "E-5"))} enlisted, ${f.usd2(G.bas(y, "O-1"))} officers, per month. Basic pay is the same everywhere.</p>
          <div class="calc-line">Grade <select data-mg>${opt(allMil, state.mG)}</select> with <select data-my>${opt(range(0, 40), state.mY)}</select> yrs → <b>${mil.annual ? f.usd(mil.annual / 12) + " / mo" : "n/a at this YOS"}</b></div>
        </div>
        <div class="box">
          <h3>Trades &amp; executives ${statusTag("simulated")}</h3>
          <div class="lead-num">${f.usd2(G.fws(y, "WG", 10, 2, l.id).hourly)}<span style="font-size:18px">/hr</span></div>
          <div class="lead-cap">WG-10 step 2 · ${fwsA.areaName}</div>
          <table class="t"><thead><tr><th>Schedule</th><th>Hourly</th><th>Yearly</th></tr></thead><tbody>
            ${[["WG", 2], ["WG", 5], ["WG", 8], ["WG", 10], ["WG", 12], ["WL", 8], ["WS", 8], ["WS", 12]].map(([s, g]) => { const r = G.fws(y, s, g, 2, l.id); return `<tr><td>${s}-${g} step 2</td><td>${f.usd2(r.hourly)}</td><td>${f.usd(r.annual)}</td></tr>`; }).join("")}
          </tbody></table>
          <p class="muted" style="font-size:13px;margin:10px 0 0"><b>SES</b> pay is the same in every location: ${f.usd(ses.min)} – ${f.usd(ses.maxCertified)} ${statusTag(ses.status)}</p>
        </div>
        <div class="box">
          <h3>Travel per diem ${statusTag(pd.status)}</h3>
          <div class="lead-num">${f.usd(pd.total)}<span style="font-size:18px">/day</span></div>
          <div class="lead-cap">${pd.fiscalYear} · ${pd.areaName} · ${f.usd(pd.lodging)} lodging + ${f.usd(pd.mie)} M&amp;IE this month</div>
          <div class="months">${months.map((m, i) => { const b = pmax === pmin ? 2 : Math.round(((m.lodging - pmin) / (pmax - pmin)) * 5); return `<div style="background:var(--seq-${b});${b >= 3 ? "color:var(--paper)" : ""}">${"JFMAMJJASOND"[i]}<b>${m.lodging}</b></div>`; }).join("")}</div>
          <p class="muted" style="font-size:13px;margin:10px 0 0">Maximum nightly lodging by month. M&amp;IE is ${f.usd(pd.mie)} a day, and 75% (${f.usd2(pd.firstLastMie)}) on the first and last travel days.</p>
        </div>
      </div>`;
    const p = $("#profile");
    $("[data-gsg]", p).onchange = (e) => { state.gsG = +e.target.value; renderProfile(); };
    $("[data-gss]", p).onchange = (e) => { state.gsS = +e.target.value; renderProfile(); };
    $("[data-mg]", p).onchange = (e) => { state.mG = e.target.value; renderProfile(); };
    $("[data-my]", p).onchange = (e) => { state.mY = +e.target.value; renderProfile(); };
  }

  // ---------- ranking dot plot ----------
  function renderRanking() {
    const J = JOBS.find((j) => j.key === state.job);
    const rows = G.focusLocations().map((l) => ({ l, v: G.compute(J.p, state.year, l.id).annual || 0 })).sort((a, b) => b.v - a.v);
    const max = rows[0].v, min = rows[rows.length - 1].v;
    const lo = min * 0.9;
    $("#ranking").innerHTML = `<div class="rank-head"><h2 class="sec-title">Same job, every place</h2>
      <div class="rank-controls"><select id="jobSel" aria-label="Job">${JOBS.map((j) => `<option value="${j.key}" ${j.key === state.job ? "selected" : ""}>${j.label}</option>`).join("")}</select></div></div>
      <p class="muted">Yearly cash pay for a <b>${J.label}</b> in ${state.year}, across the ${rows.length} locations in our five focus states. The gap from top to bottom is <b>${f.usd(max - min)}</b>.</p>
      <div class="dotplot">${rows.map((r) => { const pct = ((r.v - lo) / (max - lo)) * 100; return `<div class="dp-row ${r.l.id === state.loc ? "sel" : ""}" data-l="${r.l.id}"><span>${r.l.name} <span class="muted">${r.l.state}</span></span><div class="dp-track"><div class="dp-bar" style="width:${pct}%"></div><div class="dp-dot" style="left:${pct}%"></div></div><span class="dp-val">${f.usd(r.v)}</span></div>`; }).join("")}</div>
      <p class="muted" style="font-size:12px">The scale starts at 90% of the lowest value, to make differences easier to see. Military figures include BAH and BAS.</p>`;
    $("#jobSel").onchange = (e) => { state.job = e.target.value; renderRanking(); };
    $("#ranking").querySelectorAll(".dp-row").forEach((r) => (r.onclick = () => { state.loc = r.dataset.l; state.state = G.location(state.loc).state; render(); window.scrollTo({ top: $("#profile").offsetTop - 10, behavior: "smooth" }); }));
  }

  // ---------- explainer ----------
  function renderExplainer() {
    const y = state.year, l = G.location(state.loc);
    const gsA = G.gs(y, 9, 1, l.id), leoA = G.leo(y, 7, 1, l.id), gsB = G.gs(y, 7, 1, l.id);
    const ses = G.ses(y), e4 = G.milBasic(y, "E-4", 2), o1 = G.milBasic(y, "O-1", 0);
    $("#explainCols").innerHTML = `
      <article><h3>The General Schedule</h3><p class="dropcap">Most federal civilians are paid on the GS, which has 15 grades with 10 steps each. Your <b>grade</b> reflects the job's level. You move up a <b>step</b> with time: one year per step at first, then two, then three.</p><p class="ex">Example: GS-9 step 1 in ${l.name} pays ${f.usd(gsA.annual)} in ${y}.</p></article>
      <article><h3>Why location matters</h3><p>Base pay is the same nationwide. Then <b>locality pay</b> is added, ranging from ${G.GS_LOCALITIES.RUS.pct}% (Rest of U.S.) to more than 40% in the most expensive cities. Total pay can't go above Executive Schedule level IV (${f.usd(G.executiveSchedule(y).IV)}).</p></article>
      <article><h3>Law enforcement</h3><p>LEOs from GS-3 to GS-10 are paid on <b>special base rates</b> that sit above the regular GS table. Criminal investigators usually get <b>LEAP</b> too: 25% extra for being available for overtime.</p><p class="ex">LEO GS-7 step 1 here: ${f.usd(leoA.adjusted)}, compared with ${f.usd(gsB.annual)} on the regular GS.</p></article>
      <article><h3>Trades: the Federal Wage System</h3><p>Electricians, mechanics, machinists and other trades are paid <b>by the hour</b> on the FWS. The schedules are WG (worker), WL (leader) and WS (supervisor), with 5 steps. Rates come from local wage surveys, so each area has its own table.</p></article>
      <article><h3>The Senior Executive Service</h3><p>Federal executives are in one pay band with no steps and no locality pay: ${f.usd(ses.min)} – ${f.usd(ses.maxCertified)} in ${y}. Agencies set each executive's pay based on performance.</p></article>
      <article><h3>Military basic pay</h3><p>Service members are paid by <b>grade</b> (E for enlisted, W for warrant officer, O for officer) and <b>years of service</b>. Basic pay is the same everywhere and is taxable.</p><p class="ex">E-4 with 2 years: ${f.usd(e4)}/mo. New O-1: ${f.usd(o1)}/mo.</p></article>
      <article><h3>Housing and food: BAH and BAS</h3><p><b>BAH</b> depends on ZIP code, grade and whether you have dependents. <b>BAS</b> is a flat amount for food. Neither one is taxed, so a military paycheck goes further than a civilian one of the same size.</p></article>
      <article><h3>Per diem</h3><p>On official travel, you're reimbursed up to a nightly <b>lodging</b> limit and paid a daily <b>M&amp;IE</b> rate for meals and incidentals. You get 75% of M&amp;IE on the first and last day. Rates are set for each fiscal year and many change by season.</p></article>
      <article class="soon"><h3>Overseas (coming later)</h3><p>OCONUS pay adds OHA, overseas COLA, post allowance, LQA, danger pay and more. It's written up in the project docs and will be added after the focus states.</p></article>`;
  }

  function render() { renderYears(); renderMap(); renderStatePanel(); renderProfile(); renderRanking(); renderExplainer(); }
  render();
})();
