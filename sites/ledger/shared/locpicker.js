/*
 * GovPayUI.locationPicker — a short, searchable location picker.
 * Replaces long <select> lists: tap a state tab or type a few letters.
 *
 *   GovPayUI.locationPicker(containerEl, { value: "dc", onChange: (id) => {} })
 *
 * Styling uses whatever theme variables the host site defines, with fallbacks,
 * so it drops into all three prototypes.
 */
(function (global) {
  "use strict";
  const G = global.GovPay;
  const CSS = `
  .lp { position: relative; display: inline-block; max-width: 100%; }
  .lp-btn { font: inherit; display: inline-flex; align-items: center; gap: 8px; max-width: 100%; cursor: pointer;
    color: var(--ink, inherit); background: var(--surface, var(--card, var(--paper, #fff)));
    border: 1px solid var(--line, var(--rule, #ccc)); border-radius: 10px; padding: 8px 12px; text-align: left; }
  .lp-btn .lp-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .lp-btn .lp-state { font-size: 12px; color: var(--muted, #666); white-space: nowrap; }
  .lp-btn .lp-caret { margin-left: auto; color: var(--muted, #666); }
  .lp-pop { position: absolute; z-index: 50; top: calc(100% + 6px); left: 0; width: min(420px, calc(100vw - 32px));
    background: var(--surface, var(--card, var(--paper, #fff))); color: var(--ink, inherit);
    border: 1px solid var(--line, var(--rule, #ccc)); border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.18); padding: 12px; }
  .lp-pop[hidden] { display: none; }
  .lp-search { width: 100%; font: inherit; font-size: 15px; padding: 9px 12px; border-radius: 10px; color: inherit;
    border: 1px solid var(--line, var(--rule, #ccc)); background: var(--surface-2, var(--card-2, var(--paper-2, #f4f4f4))); }
  .lp-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
  .lp-tab { font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; padding: 5px 10px; border-radius: 99px; color: inherit;
    border: 1px solid var(--line, var(--rule, #ccc)); background: transparent; }
  .lp-tab[aria-pressed=true] { background: var(--accent, var(--track, var(--ink, #222))); border-color: transparent; color: var(--brand-ink, var(--bg, #fff)); }
  .lp-list { list-style: none; margin: 0; padding: 0; max-height: 300px; overflow: auto; }
  .lp-item { font: inherit; width: 100%; text-align: left; cursor: pointer; display: flex; justify-content: space-between; gap: 10px;
    padding: 9px 10px; border: 0; border-radius: 8px; background: transparent; color: inherit; }
  .lp-item:hover, .lp-item.lp-active { background: var(--surface-2, var(--card-2, var(--paper-2, #f0f0f0))); }
  .lp-item[aria-selected=true] { font-weight: 700; }
  .lp-item small { color: var(--muted, #666); white-space: nowrap; }
  .lp-empty { padding: 10px; color: var(--muted, #666); font-size: 14px; }
  .lp-note { font-size: 12px; color: var(--muted, #666); margin-top: 8px; }
  @media (max-width: 520px) { .lp { display: block; } .lp-btn { width: 100%; } .lp-pop { position: fixed; left: 16px; right: 16px; top: 72px; width: auto; } }
  `;
  let injected = false;
  function inject() {
    if (injected) return; injected = true;
    const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s);
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const KIND = { base: "Base", city: "City", state: "Simulated" };

  function locationPicker(el, opts) {
    inject();
    const all = G.locations();
    const tabs = Object.keys(G.FOCUS_STATES).concat(["OTHER"]);
    let value = opts.value, tab = null, query = "", active = 0, open = false;

    el.classList.add("lp");
    el.innerHTML = `<button type="button" class="lp-btn" aria-haspopup="listbox" aria-expanded="false"></button>
      <div class="lp-pop" hidden role="dialog" aria-label="Choose a location">
        <input class="lp-search" type="search" placeholder="Type a base, city or state…" autocomplete="off" aria-label="Search locations">
        <div class="lp-tabs" role="group" aria-label="State"></div>
        <ul class="lp-list" role="listbox"></ul>
        <div class="lp-note"></div>
      </div>`;
    const btn = el.querySelector(".lp-btn"), pop = el.querySelector(".lp-pop"), input = el.querySelector(".lp-search");
    const tabsEl = el.querySelector(".lp-tabs"), list = el.querySelector(".lp-list"), note = el.querySelector(".lp-note");

    function drawButton() {
      const l = G.location(value);
      btn.innerHTML = `<span aria-hidden="true">📍</span><span class="lp-name">${esc(l.simulated ? l.stateName : l.name)}</span><span class="lp-state">${l.simulated ? "simulated" : l.state}</span><span class="lp-caret" aria-hidden="true">▾</span>`;
    }
    function results() {
      const q = query.trim().toLowerCase();
      if (q) return all.filter((l) => (l.name + " " + l.stateName + " " + l.state).toLowerCase().indexOf(q) >= 0).slice(0, 12);
      if (tab === "OTHER") return all.filter((l) => l.simulated);
      return all.filter((l) => l.state === tab);
    }
    function draw() {
      tabsEl.innerHTML = tabs.map((t) => `<button type="button" class="lp-tab" data-t="${t}" aria-pressed="${!query && t === tab}">${t === "OTHER" ? "Other states" : t}</button>`).join("");
      const r = results();
      if (active >= r.length) active = 0;
      list.innerHTML = r.length ? r.map((l, i) => `<li><button type="button" class="lp-item ${i === active ? "lp-active" : ""}" role="option" aria-selected="${l.id === value}" data-id="${l.id}">
          <span>${esc(l.simulated ? l.stateName : l.name)}</span><small>${l.simulated ? "simulated" : l.state + " · " + KIND[l.kind]}</small></button></li>`).join("")
        : `<li class="lp-empty">No match. Try a state name, like "Texas".</li>`;
      note.textContent = tab === "OTHER" && !query ? "These states use simulated placeholder data for now." : "";
      tabsEl.querySelectorAll(".lp-tab").forEach((b) => (b.onclick = () => { tab = b.dataset.t; query = ""; input.value = ""; active = 0; draw(); input.focus(); }));
      list.querySelectorAll(".lp-item").forEach((b) => (b.onclick = () => pick(b.dataset.id)));
    }
    function pick(id) { value = id; drawButton(); close(); btn.focus(); opts.onChange && opts.onChange(id); }
    function openPop() {
      const l = G.location(value);
      tab = l.simulated ? "OTHER" : l.state; query = ""; input.value = ""; active = 0;
      pop.hidden = false; open = true; btn.setAttribute("aria-expanded", "true"); draw();
      setTimeout(() => input.focus(), 0);
    }
    function close() { pop.hidden = true; open = false; btn.setAttribute("aria-expanded", "false"); }
    btn.onclick = () => (open ? close() : openPop());
    input.oninput = () => { query = input.value; active = 0; draw(); };
    input.onkeydown = (e) => {
      const r = results();
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, r.length - 1); draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
      else if (e.key === "Enter") { e.preventDefault(); if (r[active]) pick(r[active].id); }
      else if (e.key === "Escape") { close(); btn.focus(); }
    };
    document.addEventListener("mousedown", (e) => { if (open && !el.contains(e.target)) close(); });
    drawButton();
    return { set(id) { value = id; drawButton(); } };
  }

  global.GovPayUI = { locationPicker };
})(typeof window !== "undefined" ? window : globalThis);
