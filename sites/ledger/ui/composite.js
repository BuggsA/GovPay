/*
 * Paybook composite components (L5) · plain JS, no framework.
 *   PB.searchBox(el, { getLoc, getYear, onPick })
 *   PB.locationPicker(el, { value, system, onChange })   -> { set(id), setSystem(sys) }
 *   PB.yearSwitch(el, { value, onChange })
 *   PB.takeHome(el)
 * Data comes from GovPay (engine) and GovPayParse (text parser).
 */
(function (global) {
  "use strict";
  const G = global.GovPay, P = global.GovPayParse, f = G.fmt;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let uid = 0;

  // ---------------------------------------------------------------- search box
  function searchBox(el, opts) {
    const id = "pb-sb-" + (++uid);
    el.classList.add("pb-search");
    el.innerHTML = `
      <label class="pb-field__label" for="${id}-in">Your grade, rank or a job posting</label>
      <div class="pb-ask" style="margin-top:6px">
        <input id="${id}-in" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" autocomplete="off" spellcheck="false"
          placeholder="e.g. GS-12 step 5 DC, E-5 Norfolk, GS-0343-09/11/12">
        <button type="button">Show pay</button>
      </div>
      <ul class="pb-suggest" id="${id}-list" role="listbox" hidden></ul>
      <div class="pb-field__hint" style="margin-top:6px">Try: <a class="pb-link pb-link--ink" href="#" data-try="E-5 6 years Norfolk">E-5 6 years Norfolk</a> · <a class="pb-link pb-link--ink" href="#" data-try="GS-0343-09/11/12 Richmond">GS-0343-09/11/12 Richmond</a> · <a class="pb-link pb-link--ink" href="#" data-try="SSG 8 years Fort Meade">SSG 8 years Fort Meade</a> · <a class="pb-link pb-link--ink" href="#" data-try="LEO GS-11 Quantico">LEO GS-11 Quantico</a></div>`;
    const input = $("input", el), list = $("ul", el), go = $(".pb-ask button", el);
    let items = [], active = -1;

    function payFor(profile, locId) { return G.compute(profile, opts.getYear(), locId || opts.getLoc()); }
    // Cities and job series load the first time someone uses the box; open suggestions refresh when they arrive.
    const warm = () => G.need(["cities", "series"]).then(() => { if (input.value.trim()) render(); }, () => {});
    input.addEventListener("focus", warm, { once: true });
    input.addEventListener("input", warm, { once: true });
    function render() {
      const q = input.value;
      const res = P.parse(q);
      items = [];
      res.forEach((r) => {
        if (r.kind === "posting") items.push(r);
        else if (r.kind === "place") items.push(r);
        else items.push(r);
      });
      if (!q.trim()) { close(); return; }
      list.hidden = false; input.setAttribute("aria-expanded", "true");
      if (!items.length) {
        list.innerHTML = `<li class="pb-suggest__empty" role="option" aria-disabled="true">Not sure what that is yet. Try a grade (GS-12), a rank (E-5, SSG), or a posting (GS-0343-09/11).</li>`;
        active = -1; return;
      }
      if (active >= items.length || active < 0) active = 0;
      list.innerHTML = items.map((r, i) => {
        const loc = G.location(r.locId || opts.getLoc());
        const where = r.locId ? loc.name : `${loc.name} (your place)`;
        const sid = `${id}-o${i}`;
        if (r.kind === "place") {
          return `<li id="${sid}" role="option" aria-selected="${i === active}" data-i="${i}"><span class="pb-suggest__title">Use ${esc(loc.name)} as your place</span><span class="pb-suggest__meta">${esc(loc.stateName)}</span><span class="pb-suggest__amt">Set place</span></li>`;
        }
        if (r.kind === "posting") {
          const ladder = r.grades.map((g, gi) => {
            const res = payFor(r.system === "FWS" ? { system: "FWS", schedule: r.schedule, grade: g, step: 2 } : { system: r.system, grade: g, step: 1, leap: r.system === "LEO" }, r.locId);
            return `<span><b>${gi === r.grades.length - 1 ? "FULL LEVEL · " : ""}${r.schedule}-${String(g).padStart(2, "0")}</b>${res.annual ? f.usd(res.annual) : "—"}</span>`;
          }).join("");
          return `<li id="${sid}" role="option" aria-selected="${i === active}" data-i="${i}">
            <span class="pb-suggest__title">Job posting · ${esc(r.series)}${r.seriesName ? " " + esc(r.seriesName) : ""}</span>
            <span class="pb-suggest__meta">Career ladder to ${r.schedule}-${r.grades[r.grades.length - 1]} · step 1 pay in ${esc(where)}</span>
            <span class="pb-suggest__amt">${r.grades.length} grades</span>
            <span class="pb-suggest__ladder">${ladder}</span></li>`;
        }
        const pay = payFor(r.profile, r.locId);
        const isMil = r.profile.system === "MIL";
        const amt = pay.annual == null ? "—" : isMil ? f.usd(pay.annual / 12) + "<small>a month</small>" : f.usd(pay.annual) + "<small>a year</small>";
        const assumed = r.assumed.length ? ` · assumed ${esc(r.assumed.join(", "))}` : "";
        return `<li id="${sid}" role="option" aria-selected="${i === active}" data-i="${i}">
          <span class="pb-suggest__title">${esc(r.label)}</span>
          <span class="pb-suggest__meta">${esc(where)}${assumed}${r.note ? " · " + esc(r.note) : ""}</span>
          <span class="pb-suggest__amt">${amt}</span></li>`;
      }).join("");
      input.setAttribute("aria-activedescendant", `${id}-o${active}`);
      list.querySelectorAll("li[data-i]").forEach((li) => {
        li.onmousedown = (e) => { e.preventDefault(); pick(+li.dataset.i); };
      });
    }
    function close() { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); }
    function pick(i) { const r = items[i]; if (!r) return; close(); opts.onPick(r); }
    input.addEventListener("input", () => { active = 0; render(); });
    input.addEventListener("focus", () => { if (input.value.trim()) render(); });
    input.addEventListener("blur", () => setTimeout(close, 120));
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) render(); active = Math.min(active + 1, items.length - 1); render(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
      else if (e.key === "Enter") { e.preventDefault(); if (items.length) pick(Math.max(active, 0)); }
      else if (e.key === "Escape") { close(); }
    });
    go.onclick = () => { render(); if (items.length) pick(0); else input.focus(); };
    el.querySelectorAll("[data-try]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); input.value = a.dataset.try; input.focus(); active = 0; render(); }));
    return { refresh: () => { if (!list.hidden) render(); } };
  }

  // ---------------------------------------------------------------- location picker
  const TILES = {
    AK: [0, 0], ME: [11, 0], VT: [10, 1], NH: [11, 1],
    WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], WI: [7, 2], MI: [8, 2], NY: [9, 2], RI: [10, 2], MA: [11, 2],
    OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3],
    CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4],
    AZ: [2, 5], NM: [3, 5], KS: [4, 5], AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5], DC: [9, 5],
    OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6], HI: [0, 7], TX: [4, 7], FL: [9, 7],
  };
  const STATE_NAMES = Object.assign({}, G.FOCUS_STATES, G.OTHER_STATES);
  const RECENT_KEY = "paybook.recentPlaces";
  function getRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; } }
  function addRecent(id) { try { const r = [id].concat(getRecent().filter((x) => x !== id)).slice(0, 4); localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch (e) { /* storage off */ } }
  const words = (s) => String(s).toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);

  // What areas a place uses, and whether they differ from each other.
  function placeKeys(locId, year) {
    const g = G.gs(year, 1, 1, locId);
    if (!G.has("bah") || !G.has("perDiem")) return { gs: `${g.localityName} · ${g.localityPct.toFixed(2)}%`, bah: "…", pd: "…", loading: true };
    const b = G.bah(year, "E-5", true, locId), p = G.perDiem(year, locId, 1);
    const gw = words(g.localityName);
    const bahDiff = !words(b.mhaName).some((w) => gw.indexOf(w) >= 0);
    const pdDiff = p.standard ? g.localityName !== "Rest of U.S." : !words(p.areaName + " " + p.areaDetail).some((w) => gw.indexOf(w) >= 0);
    return { gs: `${g.localityName} · ${g.localityPct.toFixed(2)}%`, bah: b.mhaName, pd: G.location(locId).perDiemNA ? "Not covered yet (Alaska and Hawaii)" : p.standard ? "Standard rate (no special area)" : p.areaName, bahDiff, pdDiff, bahEstimate: b.status === "simulated" };
  }

  function locationPicker(el, opts) {
    const id = "pb-lp-" + (++uid);
    let value = opts.value, filter = null, query = "";
    const year = () => (opts.getYear ? opts.getYear() : G.CURRENT_YEAR);
    el.classList.add("pb-picker");

    function render(keepFocus) {
      const all = G.locations();
      const q = query.trim().toLowerCase();
      let list;
      // researched bases and cities first, then Census cities and towns (biggest first), then counties
      const rank = (l) => (l.kind === "county" ? 2 : l.census ? 1 : 0);
      const order = (a, b) => rank(a) - rank(b) || (b.population || 0) - (a.population || 0);
      if (q) list = all.filter((l) => (l.name + " " + l.stateName + " " + l.state).toLowerCase().indexOf(q) >= 0).sort(order).slice(0, 60);   // search covers every state
      else if (filter) list = all.filter((l) => l.state === filter).sort(order);
      else list = all.filter((l) => l.kind !== "county" && !l.census);
      const recent = getRecent().filter((r) => all.some((l) => l.id === r));
      const k = placeKeys(value, year());
      const cur = G.location(value);
      el.innerHTML = `
        <div class="pb-field pb-picker__search"><label class="pb-field__label" for="${id}-q">Where you work</label>
          <input class="pb-input" id="${id}-q" type="search" placeholder="City, base or state" value="${esc(query)}" autocomplete="off"></div>
        ${recent.length ? `<div class="pb-picker__row"><span class="cap">Recent</span>${recent.map((r) => `<button type="button" class="pb-chip" data-recent="${r}">${esc(G.location(r).name)}</button>`).join("")}</div>` : ""}
        <div class="pb-tiles" role="group" aria-label="Filter places by state">${Object.keys(TILES).map((st) => {
          const c = TILES[st];
          return `<button type="button" style="grid-column:${c[0] + 1};grid-row:${c[1] + 1}" aria-pressed="${filter === st}" data-st="${st}" aria-label="${esc(STATE_NAMES[st] || st)}">${st}</button>`;
        }).join("")}</div>
        <div class="pb-tiles__legend">Tap a state to see its cities and counties.</div>
        ${filter && !q ? `<div class="pb-picker__row"><button type="button" class="pb-chip pb-chip--on" data-clear>${esc(STATE_NAMES[filter])} <span class="pb-chip__x" aria-hidden="true">×</span><span class="sr">clear filter</span></button></div>` : ""}
        ${!q && !filter ? '<div class="pb-picker__row"><span class="cap">Researched bases and cities · or search any city, town or county</span></div>' : ""}
        <ul class="pb-places" aria-label="Places">${list.length ? list.map((l) => {
          const g = G.gs(year(), 1, 1, l.id);
          return `<li><button type="button" data-id="${l.id}" aria-current="${l.id === value}"><b>${esc(l.kind === "county" || l.census ? l.short : l.name)}</b><span class="tag">${l.kind}</span><small>${esc(l.state)}${l.census ? " · " + esc(l.county) : ""} · GS locality ${g.localityPct.toFixed(2)}%</small></button></li>`;
        }).join("") : `<li class="pb-places__empty">No place matches "${esc(query)}". Try a state name.</li>`}</ul>
        <div class="pb-uses" aria-live="polite"><b>${esc(cur.name)}</b> uses three different area lists:
          <dl><dt>GS pay</dt><dd>${esc(k.gs)}</dd>
          <dt>BAH</dt><dd class="${k.bahDiff ? "differs" : ""}">${esc(k.bah)}${k.bahDiff ? " · a different area" : ""}</dd>
          <dt>Per diem</dt><dd class="${k.pdDiff ? "differs" : ""}">${esc(k.pd)}${k.pdDiff ? " · a different area" : ""}</dd></dl>
          ${cur.splitCounties ? `<div style="margin-top:6px">${esc(cur.short)} spans more than one county. This uses ${esc(cur.county)}, where most people live; if you work in another part, pick that county instead.</div>` : ""}
          ${k.bahEstimate ? '<div style="margin-top:6px">GS and per diem are official. BAH here is a rough placeholder.</div>' : ""}</div>`;
      const qi = $("input", el);
      qi.oninput = () => { query = qi.value; render(true); };
      // Searching places needs cities.js; the area names need bah.js and perdiem.js. Load them when the
      // picker is actually on screen (always on desktop, only once the sheet opens on a phone).
      qi.onfocus = () => { if (!G.has("cities")) G.need(["cities"]).then(() => render(true), () => {}); };
      if (k.loading && el.offsetParent !== null) {
        const go = () => G.need(["bah", "perDiem"]).then(() => render(), () => {});
        (window.requestIdleCallback || ((f) => setTimeout(f, 300)))(go);
      }
      if (keepFocus) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
      el.querySelectorAll("[data-st]").forEach((b) => (b.onclick = () => { filter = filter === b.dataset.st ? null : b.dataset.st; query = ""; render(); }));
      const cl = $("[data-clear]", el); if (cl) cl.onclick = () => { filter = null; render(); };
      el.querySelectorAll("[data-id]").forEach((b) => (b.onclick = () => choose(b.dataset.id)));
      el.querySelectorAll("[data-recent]").forEach((b) => (b.onclick = () => choose(b.dataset.recent)));
    }
    function choose(idv) { value = idv; addRecent(idv); render(); opts.onChange(idv); }
    render();
    return { set(idv) { value = idv; render(); }, refresh() { render(); } };
  }

  // ---------------------------------------------------------------- year switch
  function yearSwitch(el, opts) {
    let value = opts.value;
    el.classList.add("pb-year");
    function render() {
      const y = G.YEARS.find((x) => x.year === value);
      el.innerHTML = `<div class="pb-seg" role="radiogroup" aria-label="Pay year">${G.YEARS.map((x) => `<button type="button" role="radio" aria-checked="${x.year === value}" data-y="${x.year}">${x.year}</button>`).join("")}</div>
        ${y.status === "projected" ? `<div class="pb-year__note"><span class="pb-stamp pb-stamp--proposed">Proposed</span><span>${value} pay isn't final. It's shown with assumed raises on top of ${value - 1} until the pay order is published, usually in late December.</span></div>`
          : `<div class="pb-year__note">${esc(y.note.replace(/^.*?· /, ""))}</div>`}`;
      el.querySelectorAll("[data-y]").forEach((b) => (b.onclick = () => { value = +b.dataset.y; render(); opts.onChange(value); }));
    }
    render();
    return { set(v) { value = v; render(); } };
  }

  // ---------------------------------------------------------------- take-home (layout only)
  function takeHome(el, opts) {
    const id = "pb-th-" + (++uid);
    const st = { filing: "Single", state: "MD", fers: "4.4%", tsp: 5, health: "", rate: "" };
    function render(open) {
      el.innerHTML = `
        <div class="pb-takehome">Take-home is about <b>$X,XXX</b> a month. <span>${esc(st.filing)}, standard deduction, ${esc(st.state)}, FERS ${esc(st.fers)}, TSP ${st.tsp}%${st.rate ? `, your rate ${esc(st.rate)}%` : ""}.</span>
          <button type="button" class="pb-btn pb-btn--quiet pb-btn--small" aria-expanded="${!!open}" aria-controls="${id}">Edit</button>
          <span class="pb-stamp pb-stamp--estimate" style="margin-left:6px">Layout only</span></div>
        <form class="pb-th-panel" id="${id}" ${open ? "" : "hidden"}>
          <div class="pb-th-grid">
            <div class="pb-field"><label class="pb-field__label" for="${id}-f">Filing status</label><select class="pb-input pb-select" id="${id}-f"><option ${st.filing === "Single" ? "selected" : ""}>Single</option><option ${st.filing !== "Single" ? "selected" : ""}>Married, one income</option></select></div>
            <div class="pb-field"><label class="pb-field__label" for="${id}-s">State you pay tax in</label><select class="pb-input pb-select" id="${id}-s">${["DC", "MD", "PA", "UT", "VA"].map((s) => `<option ${s === st.state ? "selected" : ""}>${s}</option>`).join("")}</select><span class="pb-field__hint">Military: your state of legal residence.</span></div>
            <div class="pb-field"><label class="pb-field__label" for="${id}-r">FERS (by hire date)</label><select class="pb-input pb-select" id="${id}-r">${["0.8%", "3.1%", "4.4%"].map((s) => `<option ${s === st.fers ? "selected" : ""}>${s}</option>`).join("")}</select></div>
            <div class="pb-field"><label class="pb-field__label" for="${id}-t">TSP %</label><input class="pb-input" id="${id}-t" inputmode="decimal" value="${st.tsp}"></div>
            <div class="pb-field"><label class="pb-field__label" for="${id}-h">Health premium / paycheck</label><input class="pb-input" id="${id}-h" inputmode="decimal" placeholder="optional" value="${esc(st.health)}"></div>
            <div class="pb-field"><label class="pb-field__label" for="${id}-o">Or use your own tax rate</label><input class="pb-input" id="${id}-o" inputmode="decimal" placeholder="e.g. 22" value="${esc(st.rate)}"><span class="pb-field__hint">For complicated situations. Overrides the estimate.</span></div>
          </div>
          <div class="pb-th-actions"><button class="pb-btn" type="submit">Update estimate</button><button class="pb-btn pb-btn--line" type="button" data-cancel>Cancel</button></div>
        </form>`;
      $("button[aria-controls]", el).onclick = () => render(!open);
      const form = $("form", el);
      form.onsubmit = (e) => {
        e.preventDefault();
        st.filing = $(`#${id}-f`).value; st.state = $(`#${id}-s`).value; st.fers = $(`#${id}-r`).value;
        st.tsp = Math.max(0, Math.min(100, parseFloat($(`#${id}-t`).value) || 0)); st.health = $(`#${id}-h`).value; st.rate = $(`#${id}-o`).value;
        render(false);
      };
      $("[data-cancel]", el).onclick = () => render(false);
    }
    render(false);
  }

  global.PB = { searchBox, locationPicker, yearSwitch, takeHome, placeKeys };
})(window);
