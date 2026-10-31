/*
 * PaybookAnalytics — anonymous usage counts (see /privacy and site/worker.js).
 *
 * Sends only a fixed set of coarse events (pages opened, pay system and grade band, locality area and state,
 * tools used) to /api/e. No cookies, no persistent ID, no typed text, no exact pay, nothing below the
 * locality-area level. A random ID that lasts one visit (sessionStorage) groups a visit's events.
 * Off when the browser sends Global Privacy Control or Do Not Track, or after opting out on /privacy.
 */
(function (global) {
  "use strict";
  const OPT_KEY = "paybook.analytics";
  const ENDPOINT = "/api/e";
  const doc = global.document;

  function enabled() {
    try {
      if (global.localStorage.getItem(OPT_KEY) === "off") return false;
    } catch (e) { /* storage off: still anonymous, fine to count */ }
    const nav = global.navigator || {};
    if (nav.globalPrivacyControl === true || nav.doNotTrack === "1" || global.doNotTrack === "1") return false;
    return global.location && /^https?:$/.test(global.location.protocol);
  }
  function visitId() {
    try {
      let s = global.sessionStorage.getItem("paybook.visit");
      if (!s) { s = Math.random().toString(36).slice(2, 12).padEnd(10, "0"); global.sessionStorage.setItem("paybook.visit", s); }
      return s;
    } catch (e) { return ""; }
  }

  let queue = [], timer = null;
  const sent = {};
  function flush() {
    timer = null;
    if (!queue.length) return;
    const body = JSON.stringify(queue.splice(0, 20));
    try {
      if (global.navigator.sendBeacon && global.navigator.sendBeacon(ENDPOINT, body)) return;
    } catch (e) { /* fall through */ }
    try { global.fetch(ENDPOINT, { method: "POST", body, keepalive: true }); } catch (e) { /* ignore */ }
  }
  // track("tool", { tool: "allowances" }); repeats of the same event and values in one visit are sent once.
  function track(name, props) {
    if (!enabled()) return;
    const e = Object.assign({ e: name, s: visitId() }, props || {});
    const key = JSON.stringify(e);
    if (sent[key]) return;
    sent[key] = true;
    queue.push(e);
    if (!timer) timer = setTimeout(flush, 1500);
  }

  // Coarse grade bands, the same everywhere.
  function band(p) {
    if (!p) return "";
    if (p.system === "MIL") {
      const g = p.mgrade || "";
      if (/^E-[1-4]$/.test(g)) return "E-1/4";
      if (/^E-[56]$/.test(g)) return "E-5/6";
      if (/^E-[789]$/.test(g)) return "E-7/9";
      if (/^W-/.test(g)) return "W";
      if (/^O-[123]E?$/.test(g)) return "O-1/3";
      if (/^O-[456]$/.test(g)) return "O-4/6";
      return "O-7+";
    }
    if (p.system === "SES") return "SES";
    const g = +p.grade || 0, pre = p.system === "FWS" ? (p.schedule || "WG") : "GS";
    if (p.system === "FWS") return pre + (g <= 5 ? " 1-5" : g <= 10 ? " 6-10" : " 11+");
    return pre + (g <= 4 ? " 1-4" : g <= 8 ? " 5-8" : g <= 11 ? " 9-11" : g <= 13 ? " 12-13" : " 14-15");
  }
  // Locality area slug and state for a place id (needs GovPay loaded; coarse on purpose).
  function placeKeys(locId) {
    const G = global.GovPay;
    if (!G || !locId) return {};
    const l = G.location(locId);
    const area = G.GS_LOCALITIES[l.gsLocality];
    return { st: l.state, area: area ? G.areaSlug(area.name) : "" };
  }
  function profile(p, locId) {
    if (!p) return;
    track("profile", Object.assign({ sys: p.system, band: band(p), deps: p.system === "MIL" ? (p.deps ? "yes" : "no") : "" }, placeKeys(locId)));
  }
  function setEnabled(on) {
    try { global.localStorage.setItem(OPT_KEY, on ? "on" : "off"); } catch (e) { /* ignore */ }
  }

  global.PaybookAnalytics = { track, profile, band, placeKeys, enabled, setEnabled, flush };
  if (doc) {
    const view = () => track("view", { path: (global.location.pathname || "/").toLowerCase().replace(/\.html$/, "").replace(/\/index$/, "/") });
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", view); else view();
    doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "hidden") flush(); });
  }
})(typeof window !== "undefined" ? window : globalThis);
