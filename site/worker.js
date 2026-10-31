// Paybook's only server code. Every page is a static asset served directly by Cloudflare; this script
// runs for /api/* only (wrangler.jsonc: run_worker_first) and records anonymous usage events.
//
// Privacy rules (see /privacy): no cookies, no IP address, no user agent, no persistent ID, no typed text.
// Only the event types and fields below are kept, each checked against a strict pattern; anything else
// is dropped. A random per-visit ID (new every visit, kept in the tab's sessionStorage) lets a visit's
// events be counted together; it can't link two visits or identify anyone.

export const EVENTS = {
  view: ["path"],                                 // a page was opened: /civilian/gs/12/san-diego-ca
  profile: ["sys", "band", "area", "st", "deps"], // pay system, grade band, GS locality area, state, dependents
  tool: ["tool"],                                 // a tab or panel was opened: allowances, travel, takehome...
  posting: ["sys", "family", "band"],             // a job posting was decoded: series family and grade band
  place: ["kind", "st", "area"],                  // a place was picked: city/county/base, state, locality area
  takehome: ["filing", "tax"],                    // take-home settings: filing status, state of legal residence
  year: ["y"],                                    // the pay year switched
};
const VALUE = /^[A-Za-z0-9 _\-.]{1,40}$/;
const PATH = /^\/[a-z0-9\-/]{0,100}$/;
const SESSION = /^[a-z0-9]{8,16}$/;
const BOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor/i;

// One raw event -> a clean data point, or null if anything doesn't fit.
export function clean(e) {
  if (!e || typeof e !== "object" || !EVENTS[e.e]) return null;
  const s = typeof e.s === "string" && SESSION.test(e.s) ? e.s : "";
  const fields = EVENTS[e.e].map((k) => {
    const v = e[k] == null ? "" : String(e[k]);
    if (v === "") return "";
    return (k === "path" ? PATH : VALUE).test(v) ? v : null;
  });
  if (fields.some((v) => v === null)) return null;
  if (e.e === "view" && !fields[0]) return null;
  return { blobs: [e.e, s, ...fields], doubles: [1], indexes: [e.e] };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/e") return env.ASSETS.fetch(request);
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    const ua = request.headers.get("user-agent") || "";
    if (BOT.test(ua) || request.headers.get("sec-gpc") === "1") return new Response(null, { status: 204 });
    const text = await request.text();
    if (text.length > 4096) return new Response(null, { status: 413 });
    let list;
    try { list = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
    if (!Array.isArray(list)) list = [list];
    let kept = 0;
    for (const e of list.slice(0, 20)) {
      const point = clean(e);
      if (point && env.EVENTS) { env.EVENTS.writeDataPoint(point); kept++; }
    }
    return new Response(null, { status: 204, headers: { "x-kept": String(kept), "cache-control": "no-store" } });
  },
};
