/*
 * GovPay shared data + calculation engine.
 *
 * ONE file, no build step, no dependencies. Every site loads this and calls
 * window.GovPay.*. The three prototype sites only differ in presentation.
 *
 * DATA STATUS — every number this engine returns carries a status tag:
 *   "verified"  – matches a published 2026 figure we cross-checked (e.g. GS
 *                 locality %, SES range, Executive Schedule, BAS, raise %).
 *   "approx"    – hand-entered close to the published tables but NOT copied
 *                 cell-by-cell from the source (GS tables, military basic pay,
 *                 BAH, per diem, LEO special rates). Replace before launch.
 *   "simulated" – generated placeholder data (states outside UT/MD/DC/PA/VA,
 *                 FWS wage schedules). Shape is realistic, values are not.
 *   "projected" – a future year (2027) built from an assumed raise.
 *
 * Production plan: replace the hand-entered blocks below with JSON produced
 * by a GitHub Action that pulls OPM / DFAS / DTMO / GSA files. The public
 * API of this file should not need to change. See docs/DATA.md.
 */
(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Years
  // ---------------------------------------------------------------------------
  const CURRENT_YEAR = 2026;
  const YEARS = [
    { year: 2025, label: "2025", status: "verified", note: "Last year · official pay order (EO 14132)" },
    { year: 2026, label: "2026", status: "verified", note: "This year · official pay order (EO 14368)" },
    { year: 2027, label: "2027 (projected)", status: "projected", note: "Next year · not yet published; assumed raises on 2026 tables" },
  ];

  // Annual across-the-board raises, applied relative to the anchor tables.
  // Civilian GS anchor table = 2025. Military anchor table = 2026.
  const RAISES = {
    gs:  { 2025: 0.020, 2026: 0.010, 2027: 0.010 },  // 2027 is an assumption
    mil: { 2025: 0.045, 2026: 0.038, 2027: 0.042 },  // 2027 ECI-based assumption
    bas: { 2025: 0.010, 2026: 0.024, 2027: 0.025 },
    bah: { 2025: 0.054, 2026: 0.042, 2027: 0.040 },
    fws: { 2025: 0.020, 2026: 0.010, 2027: 0.010 },
  };

  // ---------------------------------------------------------------------------
  // OFFICIAL pay tables from the annual pay Executive Order (Federal Register),
  // converted by scripts/convert-payorder.py into shared/data/payorder.js.
  // GS base, locality %, SES, Executive Schedule and military basic pay.
  // Years without an order (next year) are PROJECTED from the latest real year.
  // ---------------------------------------------------------------------------
  const PAY_DATA = (global.GOVPAY_DATA && global.GOVPAY_DATA.payOrder) || {};
  const PAY_YEARS = Object.keys(PAY_DATA).map(Number).sort();
  const LATEST = PAY_YEARS.length ? PAY_YEARS[PAY_YEARS.length - 1] : CURRENT_YEAR;
  function hasOrder(year) { return !!PAY_DATA[year]; }
  function order(year) { return PAY_DATA[year] || PAY_DATA[LATEST]; }
  const EX = {};
  PAY_YEARS.forEach((y) => (EX[y] = PAY_DATA[y].executiveSchedule));

  // GS locality pay areas used by the focus locations. pct is filled from the
  // pay order for each year (see localityPct); the value here is only a fallback.
  const GS_LOCALITIES = {
    DCB: { name: "Washington-Baltimore-Arlington, DC-MD-VA-WV-PA", pct: 33.94, status: "verified" },
    PHL: { name: "Philadelphia-Reading-Camden, PA-NJ-DE-MD", pct: 28.99, status: "verified" },
    PIT: { name: "Pittsburgh-New Castle-Weirton, PA-OH-WV", pct: 21.03, status: "verified" },
    HBG: { name: "Harrisburg-Lebanon, PA", pct: 19.43, status: "verified" },
    RCH: { name: "Richmond, VA", pct: 22.28, status: "verified" },
    VBN: { name: "Virginia Beach-Norfolk, VA-NC", pct: 18.80, status: "verified" },
    RUS: { name: "Rest of U.S.", pct: 17.06, status: "verified" },
  };

  // LEO special base rates (GS-3..GS-10) expressed as a premium over GS base.
  // Approximation of OPM's LEO special base rate table shape.
  const LEO_PREMIUM = { 3: 0.23, 4: 0.22, 5: 0.19, 6: 0.17, 7: 0.12, 8: 0.09, 9: 0.06, 10: 0.03 };

  // ---------------------------------------------------------------------------
  // Federal Wage System (blue-collar) — SIMULATED.
  // WG step-2 "representative" hourly rate for a national-average wage area, 2026.
  // ---------------------------------------------------------------------------
  const FWS_WG_STEP2_2026 = [0, 19.10, 20.45, 21.80, 23.15, 24.55, 25.90, 27.30, 28.65,
    30.00, 31.40, 32.75, 34.10, 35.50, 36.85, 38.20];
  const FWS_STEP_PCT = [0.96, 1.00, 1.04, 1.08, 1.12];
  const FWS_SCHEDULES = {
    WG: { name: "Wage Grade (non-supervisory)", grades: 15, factor: 1.00 },
    WL: { name: "Wage Leader", grades: 15, factor: 1.10 },
    WS: { name: "Wage Supervisor", grades: 19, factor: 1.32 },
  };
  const FWS_AREAS = {
    DCWA: { name: "Washington, DC wage area", factor: 1.14 },
    BALT: { short: "Baltimore", name: "Baltimore, MD wage area", factor: 1.07 },
    STMD: { name: "St. Mary's, MD wage area", factor: 1.04 },
    PHIL: { name: "Philadelphia, PA wage area", factor: 1.09 },
    PITT: { short: "Pittsburgh", name: "Pittsburgh, PA wage area", factor: 0.99 },
    HARR: { name: "Harrisburg, PA wage area", factor: 0.98 },
    NORF: { short: "Norfolk / Virginia Beach", name: "Norfolk-Portsmouth-Newport News-Virginia Beach, VA wage area", factor: 0.97 },
    RICH: { short: "Richmond", name: "Richmond, VA wage area", factor: 0.96 },
    UTAH: { name: "Utah wage area", factor: 0.98 },
  };
  const FWS_HOURS_PER_YEAR = 2087;

  // Military basic pay comes from the pay order (Schedule 8), monthly, by DFAS
  // years-of-service column: under 2, over 2, over 3, ... over 40.
  const MIL_YOS = (PAY_DATA[LATEST] && PAY_DATA[LATEST].militaryBasicPay.columns) || [0, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40];
  // Monthly cap = Executive Schedule level II / 12.
  const MIL_GRADES = {
    enlisted: ["E-1", "E-2", "E-3", "E-4", "E-5", "E-6", "E-7", "E-8", "E-9"],
    warrant: ["W-1", "W-2", "W-3", "W-4", "W-5"],
    officer: ["O-1", "O-2", "O-3", "O-4", "O-5", "O-6", "O-7", "O-8", "O-9", "O-10"],
    priorEnlisted: ["O-1E", "O-2E", "O-3E"],
  };

  // BAS, monthly, from DoD FMR Vol. 7A, Chapter 25 (DFAS). Later years are projected with RAISES.bas.
  const BAS = { 2025: { enlisted: 465.77, officer: 320.78 }, 2026: { enlisted: 476.95, officer: 328.48 } };
  const BAS_YEARS = Object.keys(BAS).map(Number);

  // BAH ratio by grade relative to E-5 with dependents (approximates DoD's
  // housing-profile structure). Without-dependents ratio applied on top.
  const BAH_RATIO = {
    "E-1": 0.89, "E-2": 0.89, "E-3": 0.89, "E-4": 0.89, "E-5": 1.00, "E-6": 1.10, "E-7": 1.16,
    "E-8": 1.23, "E-9": 1.31, "W-1": 1.12, "W-2": 1.21, "W-3": 1.28, "W-4": 1.34, "W-5": 1.39,
    "O-1E": 1.21, "O-2E": 1.28, "O-3E": 1.36, "O-1": 1.08, "O-2": 1.17, "O-3": 1.33, "O-4": 1.48,
    "O-5": 1.57, "O-6": 1.59, "O-7": 1.61, "O-8": 1.61, "O-9": 1.61, "O-10": 1.61,
  };
  const BAH_NODEP = { junior: 0.80, other: 0.85 };

  // BAH military housing areas. e5: 2026 E-5 with-dependents monthly (approx).
  const BAH_MHAS = {
    DC053: { name: "Washington, DC metro", e5: 3560 },
    MD072: { name: "Fort Meade, MD", e5: 3050 },
    MD077: { name: "Annapolis, MD", e5: 3220 },
    MD069: { name: "Aberdeen Proving Ground, MD", e5: 2380 },
    MD068: { name: "Patuxent River NAS, MD", e5: 2470 },
    MD070: { name: "Fort Detrick / Frederick, MD", e5: 2720 },
    MD071: { name: "Baltimore, MD", e5: 2560 },
    VA298: { name: "Quantico / Woodbridge, VA", e5: 2960 },
    VA297: { name: "Norfolk / Portsmouth, VA", e5: 2260 },
    VA296: { name: "Hampton / Newport News, VA", e5: 2160 },
    VA300: { name: "Fort Gregg-Adams / Petersburg, VA", e5: 1840 },
    VA302: { name: "Richmond, VA", e5: 2070 },
    VA299: { name: "Dahlgren, VA", e5: 2410 },
    PA095: { name: "Philadelphia, PA", e5: 2580 },
    PA097: { name: "Pittsburgh, PA", e5: 1860 },
    PA093: { name: "Carlisle / Harrisburg, PA", e5: 1910 },
    UT112: { name: "Hill AFB / Ogden, UT", e5: 2060 },
    UT113: { name: "Salt Lake City, UT", e5: 2270 },
    UT111: { name: "Dugway / Tooele, UT", e5: 1950 },
  };

  // Per diem: REAL data from the GSA Per Diem API, generated by scripts/fetch-perdiem.mjs
  // into shared/data/perdiem.js (window.GOVPAY_DATA.perDiem), keyed by fiscal year.
  // Each area: [city, county, M&IE, lodging Jan..Dec]. Places not listed get the standard rate.
  // Read at call time: the browser loads perdiem.js only when a per diem number is needed (GovPay.need).
  const pdData = () => (global.GOVPAY_DATA && global.GOVPAY_DATA.perDiem) || {};
  const pdYears = () => Object.keys(pdData()).map(Number).sort();
  const MIE_FIRST_LAST_DAY = 0.75;

  // ---------------------------------------------------------------------------
  // Locations — the five focus states are hand-entered; the rest are simulated.
  // ---------------------------------------------------------------------------
  const FOCUS = [
    // id, name, state, kind, gsLoc, fwsArea, bahMha, perDiem area id (null = standard rate), x, y
    ["dc", "Washington, DC (Pentagon area)", "DC", "city", "DCB", "DCWA", "DC053", "DC:District of Columbia", 62, 44],
    ["fort-belvoir", "Fort Belvoir", "VA", "base", "DCB", "DCWA", "DC053", "DC:District of Columbia", 60, 48],
    ["quantico", "MCB Quantico", "VA", "base", "DCB", "DCWA", "VA298", null, 58, 52],
    ["dahlgren", "NSWC Dahlgren", "VA", "base", "DCB", "DCWA", "VA299", null, 61, 57],
    ["norfolk", "Naval Station Norfolk", "VA", "base", "VBN", "NORF", "VA297", null, 70, 72],
    ["langley-eustis", "JB Langley-Eustis", "VA", "base", "VBN", "NORF", "VA296", null, 67, 70],
    ["richmond", "Richmond", "VA", "city", "RCH", "RICH", "VA302", "VA:Richmond", 58, 64],
    ["fort-gregg-adams", "Fort Gregg-Adams", "VA", "base", "RCH", "RICH", "VA300", null, 59, 67],
    ["fort-meade", "Fort George G. Meade", "MD", "base", "DCB", "BALT", "MD072", "MD:Annapolis", 66, 38],
    ["annapolis", "Annapolis (USNA)", "MD", "city", "DCB", "BALT", "MD077", "MD:Annapolis", 69, 41],
    ["andrews", "JB Andrews", "MD", "base", "DCB", "DCWA", "DC053", "DC:District of Columbia", 64, 46],
    ["aberdeen", "Aberdeen Proving Ground", "MD", "base", "DCB", "BALT", "MD069", "MD:Aberdeen / Bel Air / Belcamp", 70, 32],
    ["baltimore", "Baltimore", "MD", "city", "DCB", "BALT", "MD071", "MD:Baltimore City", 67, 35],
    ["pax-river", "NAS Patuxent River", "MD", "base", "DCB", "STMD", "MD068", null, 68, 54],
    ["fort-detrick", "Fort Detrick", "MD", "base", "DCB", "BALT", "MD070", null, 58, 36],
    ["philadelphia", "Philadelphia", "PA", "city", "PHL", "PHIL", "PA095", "PA:Philadelphia", 78, 22],
    ["pittsburgh", "Pittsburgh", "PA", "city", "PIT", "PITT", "PA097", "PA:Pittsburgh", 36, 22],
    ["carlisle", "Carlisle Barracks", "PA", "base", "HBG", "HARR", "PA093", null, 58, 26],
    ["mechanicsburg", "NSA Mechanicsburg", "PA", "base", "HBG", "HARR", "PA093", null, 60, 25],
    ["harrisburg", "Harrisburg", "PA", "city", "HBG", "HARR", "PA093", "PA:Harrisburg", 62, 23],
    ["hill-afb", "Hill AFB", "UT", "base", "RUS", "UTAH", "UT112", null, 12, 30],
    ["salt-lake-city", "Salt Lake City", "UT", "city", "RUS", "UTAH", "UT113", "UT:Salt Lake City", 11, 35],
    ["dugway", "Dugway Proving Ground", "UT", "base", "RUS", "UTAH", "UT111", "UT:Salt Lake City", 7, 39],
    ["park-city", "Park City", "UT", "city", "RUS", "UTAH", "UT113", "UT:Park City", 14, 36],
  ];
  const FOCUS_STATES = { DC: "District of Columbia", MD: "Maryland", PA: "Pennsylvania", VA: "Virginia", UT: "Utah" };
  const OTHER_STATES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
    CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
    IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
    ME: "Maine", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
    MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
    NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
    OH: "Ohio", OK: "Oklahoma", OR: "Oregon", RI: "Rhode Island", SC: "South Carolina",
    SD: "South Dakota", TN: "Tennessee", TX: "Texas", VT: "Vermont", WA: "Washington",
    WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  };

  const LOCATIONS = [];
  FOCUS.forEach((r) => LOCATIONS.push({
    id: r[0], name: r[1], state: r[2], stateName: FOCUS_STATES[r[2]], kind: r[3],
    gsLocality: r[4], fwsArea: r[5], bahMha: r[6], perDiem: r[7], x: r[8], y: r[9],
    status: "approx", simulated: false,
  }));
  // Every U.S. county (and county equivalent) from shared/data/places.js:
  // REAL GS locality area (5 CFR 531.603) and GSA per diem area for each one.
  // BAH: each county and base gets its DTMO housing area from shared/data/bah.js (scripts/convert-bah.py).
  const ALL_STATES = Object.assign({}, FOCUS_STATES, OTHER_STATES);
  const PLACES = (global.GOVPAY_DATA && global.GOVPAY_DATA.places) || null;
  // BAH data (bah.js) is also read at call time; the browser loads it when a BAH number is needed.
  const bahData = () => (global.GOVPAY_DATA && global.GOVPAY_DATA.bah) || null;
  let bahCache = null;
  function bahIndex() {
    const d = bahData();
    if (!d) return null;
    if (!bahCache || bahCache.d !== d) bahCache = { d, county: d.county.split(","), years: Object.keys(d.years).map(Number).sort(), grade: Object.fromEntries(d.grades.map((g, i) => [g, i])) };
    return bahCache;
  }
  // A place's DTMO housing area: a ZIP on the base for researched places, else its (main) county's area.
  function bahMhaOf(loc) {
    const b = bahIndex();
    if (!b) return loc.bahMha;
    if (b.d.focus[loc.id]) return b.d.focus[loc.id];
    const c = loc.kind === "county" ? loc : loc.countyId ? LOC_INDEX.get(loc.countyId) : null;
    return (c && b.county[c.ci]) || loc.bahMha;
  }
  // County FIPS of the researched places, so a county shares its base's BAH and wage area.
  const FOCUS_FIPS = { dc: "11001", "fort-belvoir": "51059", quantico: "51153", dahlgren: "51099", norfolk: "51710", "langley-eustis": "51650",
    richmond: "51760", "fort-gregg-adams": "51149", "fort-meade": "24003", andrews: "24033", aberdeen: "24025", baltimore: "24510",
    "pax-river": "24037", "fort-detrick": "24021", philadelphia: "42101", pittsburgh: "42003", carlisle: "42041", harrisburg: "42043",
    "hill-afb": "49011", "salt-lake-city": "49035", dugway: "49045", "park-city": "49043" };
  const byFips = {};
  LOCATIONS.forEach((l) => { const f = FOCUS_FIPS[l.id]; if (f && !byFips[f]) byFips[f] = l; if (f) l.fips = f; });
  Object.keys(ALL_STATES).forEach((st) => {
    // Per-state placeholder BAH and wage area, used only where no researched base applies.
    const rnd = seeded(st);
    BAH_MHAS["SIM" + st] = { name: ALL_STATES[st] + " (estimated housing area)", e5: Math.round(1550 + rnd() * 2050), simulated: true };
    FWS_AREAS["SIMF_" + st] = { name: ALL_STATES[st] + " (simulated wage area)", factor: round2(0.9 + rnd() * 0.25), simulated: true };
  });
  if (PLACES) {
    PLACES.areas.forEach((n) => { if (!GS_LOCALITIES[n]) GS_LOCALITIES[n] = { name: n, pct: 0, status: "verified" }; });
    PLACES.counties.forEach(([fips, name, st, ai, pd], ci) => {
      const base = byFips[fips];
      const mha = base ? base.bahMha : "SIM" + st;   // placeholder; bahMhaOf() gives the DTMO area once bah.js is loaded
      LOCATIONS.push({
        id: "c" + fips, fips, ci, name: `${name}, ${st}`, short: name, state: st, stateName: ALL_STATES[st] || st, kind: "county",
        gsLocality: PLACES.areas[ai], fwsArea: base ? base.fwsArea : "SIMF_" + st, bahMha: mha,
        perDiem: pd, perDiemNA: st === "AK" || st === "HI", status: "approx", simulated: false,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h += 0x6D2B79F5; let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function round100(n) { return Math.round(n / 100) * 100; }
  function mapObj(o, f) { const r = {}; Object.keys(o).forEach((k) => (r[k] = f(o[k]))); return r; }
  const STATUS_ORDER = ["verified", "approx", "projected", "simulated"];
  const weakest = (list) => list.reduce((a, b) => (STATUS_ORDER.indexOf(b) > STATUS_ORDER.indexOf(a) ? b : a), "verified");
  function yearStatus(year) { return hasOrder(year) ? "verified" : year > LATEST ? "projected" : "approx"; }
  function factor(series, year, anchor) {
    // cumulative raise multiplier from anchor-year table to `year`
    let f = 1;
    if (year > anchor) for (let y = anchor + 1; y <= year; y++) f *= 1 + (series[y] || 0);
    if (year < anchor) for (let y = anchor; y > year; y--) f /= 1 + (series[y] || 0);
    return f;
  }
  // Cities, towns and census-designated places (5,000+ people) from Census files: each one takes its
  // main county's keys. They're found by search; the picker's default list stays the researched places.
  // (cities.js loads when someone searches or picks a place, or a saved place is a city: GovPay.need)
  const LOC_INDEX = new Map(LOCATIONS.map((l) => [l.id, l]));
  let citiesAttached = false;
  function attachCities() {
    const CITIES = (global.GOVPAY_DATA && global.GOVPAY_DATA.cities) || null;
    if (citiesAttached || !PLACES || !CITIES) return;
    citiesAttached = true;
    const countyLoc = new Map(LOCATIONS.filter((l) => l.kind === "county").map((l) => [l.fips, l]));
    const focusNames = new Set(LOCATIONS.filter((l) => l.kind !== "county").map((l) => l.state + ":" + l.name.toLowerCase().replace(/,.*$|\s*\(.*\)$/g, "")));
    CITIES.cities.forEach(([pf, name, ci, pop100, split]) => {
      const c = countyLoc.get(PLACES.counties[ci][0]);
      if (!c || focusNames.has(c.state + ":" + name.toLowerCase())) return;   // Richmond, Baltimore... already researched
      const l = Object.assign({}, c, {
        id: "p" + c.fips.slice(0, 2) + pf, name: `${name}, ${c.state}`, short: name, kind: "city", census: true,
        county: c.short, countyId: c.id, population: pop100 * 100, splitCounties: !!split,
      });
      LOCATIONS.push(l); LOC_INDEX.set(l.id, l);
    });
  }
  attachCities();
  // Old links used "sim-xx" for a whole state; send them to that state's first county.
  function location(id) {
    const l = LOC_INDEX.get(id);
    if (l) return l;
    const m = /^sim-([a-z]{2})$/.exec(id || "");
    if (m) { const st = m[1].toUpperCase(); return LOCATIONS.find((x) => x.state === st) || LOCATIONS[0]; }
    return LOCATIONS[0];
  }
  function exFor(year) {
    if (EX[year]) return EX[year];
    const f = factor(RAISES.gs, year, LATEST);           // projected year
    return mapObj(EX[LATEST], (v) => round100(v * f));
  }
  function localityPct(year, locId) {
    const L = GS_LOCALITIES[locId];
    if (!L || L.status === "simulated") return L ? L.pct : 0;
    const hit = order(year).locality.find((a) => a.name === L.name);
    return hit ? hit.pct : L.pct;
  }

  // ---------------------------------------------------------------------------
  // GS
  // ---------------------------------------------------------------------------
  function gsBase(year, grade, step) {
    const row = order(year).gs[String(grade)];
    if (!row) return null;
    if (hasOrder(year)) return row[step - 1];
    return Math.round(row[step - 1] * factor(RAISES.gs, year, LATEST));   // projected
  }
  function gsTable(year) {
    const t = {};
    for (let g = 1; g <= 15; g++) t[g] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => gsBase(year, g, s));
    return t;
  }
  function gs(year, grade, step, locId) {
    const loc = location(locId);
    const L = GS_LOCALITIES[loc.gsLocality];
    const pct = localityPct(year, loc.gsLocality);
    const base = gsBase(year, grade, step);
    const cap = exFor(year).IV;
    const raw = Math.round(base * (1 + pct / 100));
    const annual = Math.min(raw, cap);
    return {
      system: "GS", grade, step, base, localityPct: pct, localityName: L.name,
      locality: annual - base, annual, capped: raw > cap, cap,
      hourly: round2(annual / 2087), biweekly: round2(annual / 26),
      status: L.status === "simulated" ? "simulated" : yearStatus(year),
    };
  }

  // Locality AREAS straight from the pay order (all 58), for area pages.
  function areaSlug(name) {
    if (/^rest of u/i.test(name)) return "rest-of-us";
    const m = name.match(/^([^,-]+)[^,]*,\s*([A-Z]{2})/);
    return (m ? m[1].trim() + " " + m[2] : name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function localityAreas(year) {
    return order(year).locality.map((a) => ({ name: a.name, pct: a.pct, slug: areaSlug(a.name) }));
  }
  function gsArea(year, grade, step, areaName) {
    const a = order(year).locality.find((x) => x.name === areaName);
    if (!a) return null;
    const base = gsBase(year, grade, step), cap = exFor(year).IV;
    const raw = Math.round(base * (1 + a.pct / 100));
    return { base, pct: a.pct, annual: Math.min(raw, cap), capped: raw > cap, hourly: round2(Math.min(raw, cap) / 2087) };
  }
  // Which app locations sit in a locality area (for "open in calculator" links).
  function locationsInArea(areaName) {
    return LOCATIONS.filter((l) => !l.simulated && GS_LOCALITIES[l.gsLocality] && GS_LOCALITIES[l.gsLocality].name === areaName);
  }

  // ---------------------------------------------------------------------------
  // LEO (GS-1811 / 1801 etc.)
  // ---------------------------------------------------------------------------
  // LEO base rates (GS-3 to GS-10 special rates; other grades equal GS) from OPM's ALLLEO file
  // (shared/data/leo.js). Other years scale the nearest official table by the GS table, cell by cell.
  const LEO_DATA = (global.GOVPAY_DATA && global.GOVPAY_DATA.leo) || null;
  const LEO_YEARS = LEO_DATA ? Object.keys(LEO_DATA.years).map(Number).sort() : [];
  function leoBase(year, grade, step) {
    if (LEO_DATA && LEO_DATA.years[year]) return LEO_DATA.years[year][grade][step - 1];
    if (LEO_YEARS.length) {
      const y = LEO_YEARS.reduce((a, b) => (Math.abs(b - year) < Math.abs(a - year) ? b : a));
      return Math.round(gsBase(year, grade, step) * LEO_DATA.years[y][grade][step - 1] / gsBase(y, grade, step));
    }
    return Math.round(gsBase(year, grade, step) * (1 + (LEO_PREMIUM[grade] || 0)));   // rough fallback (old prototypes)
  }
  const leoStatus = (year) => (LEO_DATA && LEO_DATA.years[year] ? "verified" : year > LATEST ? "projected" : "approx");
  function leo(year, grade, step, locId, opts) {
    opts = opts || {};
    const loc = location(locId);
    const L = GS_LOCALITIES[loc.gsLocality];
    const pct = localityPct(year, loc.gsLocality);
    const base = leoBase(year, grade, step);
    const cap = exFor(year).IV;
    const adjusted = Math.min(Math.round(base * (1 + pct / 100)), cap);
    // LEAP (25%, 5 U.S.C. 5545a) is premium pay: base + LEAP can't pass the premium pay cap (5 U.S.C. 5547),
    // the greater of GS-15 step 10 with locality or EX-IV. With locality capped at EX-IV, that's EX-IV.
    const leapFull = opts.leap ? Math.round(adjusted * 0.25) : 0;
    const leap = Math.max(0, Math.min(leapFull, cap - adjusted));
    return {
      system: "LEO", grade, step, base, localityPct: pct, localityName: L.name,
      special: grade >= 3 && grade <= 10, adjusted, leap, leapCapped: leap < leapFull, annual: adjusted + leap,
      status: L.status === "simulated" ? "simulated" : leoStatus(year),
    };
  }

  // ---------------------------------------------------------------------------
  // FWS (WG / WL / WS)
  // ---------------------------------------------------------------------------
  // FWS (trades) pay from DCPAS wage schedules (shared/data/fws.js, scripts/convert-fws.py). The app loads
  // that file only when someone picks trades pay, so everything here looks the data up at call time.
  const fwsData = () => (global.GOVPAY_DATA && global.GOVPAY_DATA.fws) || null;
  const FWS_ROWS = {};
  function fwsCode(loc) {
    const d = fwsData(); if (!d) return null;
    const codes = FWS_ROWS._county || (FWS_ROWS._county = d.county.split(","));
    let c = loc.kind === "county" ? loc : loc.countyId ? LOC_INDEX.get(loc.countyId) : loc.fips ? LOCATIONS.find((x) => x.kind === "county" && x.fips === loc.fips) : null;
    return c && c.ci != null ? codes[c.ci] || null : null;
  }
  function fwsSchedule(y, code) {
    const k = y + "|" + code;
    if (FWS_ROWS[k]) return FWS_ROWS[k];
    const e = fwsData().years[y] && fwsData().years[y][code];
    if (!e) return null;
    const dec = (txt) => txt.split(";").map((row) => { const n = row.split(",").map(Number); for (let i = 1; i < n.length; i++) n[i] += n[i - 1]; return n.map((c) => c / 100); });
    return (FWS_ROWS[k] = { effective: e[0], WG: dec(e[1]), WL: dec(e[2]), WS: dec(e[3]) });
  }
  function fws(year, schedule, grade, step, locId) {
    const loc = location(locId);
    const sch = FWS_SCHEDULES[schedule] || FWS_SCHEDULES.WG;
    const g = Math.min(grade, sch.grades), st = Math.min(Math.max(step, 1), 5);
    const code = fwsCode(loc);
    if (code) {
      const ys = Object.keys(fwsData().years).map(Number).sort();
      const y = fwsData().years[year] ? year : year > ys[ys.length - 1] ? ys[ys.length - 1] : ys[0];
      const s = fwsSchedule(y, code);
      if (s) {
        const hourly = round2(s[schedule === "WL" || schedule === "WS" ? schedule : "WG"][g - 1][st - 1] * factor(RAISES.fws, year, y));
        const area = fwsData().areas[code] || "Wage area " + code;
        return { system: "FWS", schedule, grade: g, step: st, hourly, annual: Math.round(hourly * FWS_HOURS_PER_YEAR),
          areaName: area, areaCode: code, effective: s.effective, fy: y, status: year === y ? "verified" : year > y ? "projected" : "approx" };
      }
    }
    const area = FWS_AREAS[loc.fwsArea] || FWS_AREAS["SIMF_" + loc.state];
    const step2 = g <= 15 ? FWS_WG_STEP2_2026[g] : FWS_WG_STEP2_2026[15] + (g - 15) * 1.6;   // rough curve without the data file
    const hourly = round2(step2 * sch.factor * area.factor * FWS_STEP_PCT[st - 1] * factor(RAISES.fws, year, 2026));
    return { system: "FWS", schedule, grade: g, step: st, hourly, annual: Math.round(hourly * FWS_HOURS_PER_YEAR), areaName: area.name, status: "simulated", needsData: !fwsData() };
  }


  // ---------------------------------------------------------------------------
  // SES / Executive Schedule
  // ---------------------------------------------------------------------------
  function ses(year) {
    const ex = exFor(year);
    const real = hasOrder(year) ? PAY_DATA[year].ses : null;
    return {
      system: "SES", min: real ? real.min : Math.round(gsBase(year, 15, 1) * 1.2),
      maxCertified: real ? real.maxCertified : ex.II, maxUncertified: real ? real.maxUncertified : ex.III,
      note: "SES members do not receive locality pay. Pay is set by agency within the range.",
      status: yearStatus(year),
    };
  }
  function executiveSchedule(year) { return Object.assign({ status: yearStatus(year) }, exFor(year)); }

  // ---------------------------------------------------------------------------
  // Military
  // ---------------------------------------------------------------------------
  function milGradeType(grade) {
    if (grade[0] === "E") return "enlisted";
    if (grade[0] === "W") return "warrant";
    if (grade.endsWith("E")) return "priorEnlisted";
    return "officer";
  }
  function yosColumn(yos) {
    let col = 0;
    MIL_YOS.forEach((c) => { if (yos >= c) col = c; });
    return col;
  }
  function milRow(year, grade) { return order(year).militaryBasicPay.rows[grade] || null; }
  // First years-of-service column where a grade has a rate (e.g. E-9 starts at 10).
  function milMinYos(grade) {
    const row = milRow(LATEST, grade);
    if (!row) return 0;
    const i = row.findIndex((v) => v != null);
    return MIL_YOS[i] || 0;
  }
  function milBasic(year, grade, yos) {
    const row = milRow(year, grade);
    if (!row) return null;
    const v = row[MIL_YOS.indexOf(yosColumn(yos))];
    if (v == null) return null;
    if (hasOrder(year)) return v;
    // projected year: apply the assumed raise, respecting the statutory caps
    const ex = exFor(year);
    const cap = ["O-7", "O-8", "O-9", "O-10"].indexOf(grade) >= 0 ? ex.II / 12 : ex.V / 12;
    return Math.floor(Math.min(v * factor(RAISES.mil, year, LATEST), cap) * 10) / 10;
  }
  function milTable(year) {
    const t = {};
    Object.keys(order(year).militaryBasicPay.rows).forEach((g) => (t[g] = MIL_YOS.map((c) => milBasic(year, g, c))));
    return { columns: MIL_YOS.slice(), rows: t };
  }
  function bas(year, grade) {
    const type = milGradeType(grade) === "enlisted" ? "enlisted" : "officer";
    if (BAS[year]) return BAS[year][type];
    const anchor = year > Math.max(...BAS_YEARS) ? Math.max(...BAS_YEARS) : Math.min(...BAS_YEARS);
    return round2(BAS[anchor][type] * factor(RAISES.bas, year, anchor));
  }
  const basStatus = (year) => (BAS[year] ? "verified" : year > Math.max(...BAS_YEARS) ? "projected" : "approx");
  // BAH from DTMO's rate files (shared/data/bah.js): exact for the years published, projected
  // with RAISES.bah after that. Without the data file (old prototypes) the rough placeholder is used.
  function bah(year, grade, withDependents, locId) {
    const loc = location(locId), b = bahIndex(), mha = bahMhaOf(loc);
    const g = b && (b.grade[grade] != null ? grade : /^O-(8|9|10)$/.test(grade) ? "O-7" : null);  // O-8+ get the O-7 rate
    if (b && g && b.d.names[mha]) {
      const ys = b.years, y = b.d.years[year] ? year : year > ys[ys.length - 1] ? ys[ys.length - 1] : ys[0];
      const row = b.d.years[y].rates[mha];
      const v = row[b.grade[g] + (withDependents ? 0 : b.d.grades.length)] * factor(RAISES.bah, year, y);
      return { monthly: Math.round(v), mhaName: b.d.names[mha], mha,
        status: year === y ? "verified" : year > y ? "projected" : "approx" };
    }
    const m = BAH_MHAS[loc.bahMha] || BAH_MHAS["SIM" + loc.state];
    const ratio = BAH_RATIO[grade] || 1;
    const junior = ["E-1", "E-2", "E-3", "E-4"].indexOf(grade) >= 0;
    let v = m.e5 * ratio * factor(RAISES.bah, year, 2026);
    if (!withDependents) v *= junior ? BAH_NODEP.junior : BAH_NODEP.other;
    return { monthly: Math.round(v), mhaName: m.name, mha: loc.bahMha, status: "simulated", needsData: !b };
  }
  // Very rough federal tax advantage of tax-free allowances (BAH + BAS), for
  // illustration only: assumes 12% marginal federal + 4.5% state.
  function taxAdvantage(allowancesAnnual, rate) { return Math.round(allowancesAnnual * (rate || 0.165)); }
  function military(year, grade, yos, locId, withDependents) {
    const basic = milBasic(year, grade, yos);
    if (basic == null) return null;
    const h = bah(year, grade, withDependents, locId);
    const s = bas(year, grade);
    const monthly = round2(basic + h.monthly + s);
    const allowancesAnnual = (h.monthly + s) * 12;
    return {
      system: "MIL", grade, type: milGradeType(grade), yos, basic, bah: h.monthly, bas: s,
      mhaName: h.mhaName, monthly, annual: round2(monthly * 12), basicAnnual: round2(basic * 12),
      taxAdvantage: taxAdvantage(allowancesAnnual),
      // "Regular Military Compensation"-style figure: cash + tax advantage
      rmc: Math.round(monthly * 12 + taxAdvantage(allowancesAnnual)),
      basicStatus: yearStatus(year), bahStatus: h.status, basStatus: basStatus(year),
      status: weakest([yearStatus(year), h.status, basStatus(year)]),   // only "verified" when all three parts are
    };
  }

  // ---------------------------------------------------------------------------
  // Per diem
  // ---------------------------------------------------------------------------
  function fiscalYear(date) { return date.getMonth() >= 9 ? date.getFullYear() + 1 : date.getFullYear(); }
  function perDiemArea(fy, id) {
    const d = pdData()[fy];
    const a = d && id ? d.areas[id] : null;
    if (a) return { id, name: a[0], counties: a[1], mie: a[2], lodging: a[3] };
    return { id: null, name: "Standard rate", counties: "Any place without its own rate", mie: d ? d.standard.mie : 68, lodging: d ? d.standard.lodging : Array(12).fill(110) };
  }
  // perDiem(fiscalYear, locId, month 1..12). FY2027 = Oct 2026 - Sep 2027.
  function perDiem(year, locId, month) {
    const loc = location(locId);
    let fy = year, status = "verified";
    const PD = pdData(), ys = pdYears();
    if (!PD[fy]) { fy = ys.length ? ys[ys.length - 1] : year; status = ys.length ? "projected" : "approx"; }
    const a = perDiemArea(fy, loc.perDiem);
    if (loc.perDiemNA) { a.name = "Not covered yet"; a.counties = "Alaska and Hawaii use overseas (OCONUS) per diem rates from DTMO, which aren't in Paybook yet."; status = "simulated"; }
    const lodging = a.lodging[(month || 1) - 1];
    return {
      lodging, mie: a.mie, total: lodging + a.mie, firstLastMie: round2(a.mie * MIE_FIRST_LAST_DAY),
      areaName: a.name, areaDetail: a.counties, fiscalYear: "FY" + fy, standard: !a.id,
      asOf: PD[fy] ? PD[fy].fetchedAt : null, source: "GSA", status: ys.length ? status : "simulated", needsData: !ys.length,
    };
  }
  // Trip: nights of lodging + (nights+1) days of M&IE, 75% on first/last day.
  // Each day uses the fiscal year and month of its own date.
  function trip(year, locId, startISO, nights) {
    const start = new Date(startISO + "T12:00:00");
    let lodging = 0, mie = 0;
    const days = [];
    for (let d = 0; d <= nights; d++) {
      const day = new Date(start); day.setDate(start.getDate() + d);
      const pd = perDiem(fiscalYear(day), locId, day.getMonth() + 1);
      const edge = d === 0 || d === nights;
      const m = edge ? pd.firstLastMie : pd.mie;
      const l = d < nights ? pd.lodging : 0;
      lodging += l; mie += m;
      days.push({ date: day.toISOString().slice(0, 10), lodging: l, mie: m, edge, fy: pd.fiscalYear });
    }
    return { lodging, mie: round2(mie), total: round2(lodging + mie), days };
  }

  // ---------------------------------------------------------------------------
  // Equivalence guide (unofficial, for orientation only)
  // ---------------------------------------------------------------------------
  const EQUIVALENTS = [
    { gs: "GS-1 to GS-4", mil: "E-1 to E-4", role: "Entry level / junior enlisted" },
    { gs: "GS-5 to GS-6", mil: "E-5 to E-6", role: "Developing / NCO" },
    { gs: "GS-7 to GS-8", mil: "E-7 to E-9, O-1", role: "Senior NCO / new officer" },
    { gs: "GS-9 to GS-10", mil: "W-1 to W-2, O-2", role: "Journey level" },
    { gs: "GS-11", mil: "W-3, O-3", role: "Experienced professional" },
    { gs: "GS-12 to GS-13", mil: "W-4 to W-5, O-4", role: "Senior specialist / supervisor" },
    { gs: "GS-14", mil: "O-5", role: "Manager / branch chief" },
    { gs: "GS-15", mil: "O-6", role: "Senior manager / division chief" },
    { gs: "SES", mil: "O-7 to O-10", role: "Executive / flag officer" },
  ];

  // ---------------------------------------------------------------------------
  // compute(profile, year, locId) — one normalized breakdown for any pay system.
  // profile = { system: "GS"|"LEO"|"FWS"|"SES"|"MIL", grade, step, schedule,
  //             leap, mgrade, yos, deps }
  // returns { title, annual, rows:[{key,label,annual,taxFree}], notes:[], status, hourly? }
  // ---------------------------------------------------------------------------
  const DEFAULT_PROFILE = { system: "GS", grade: 12, step: 5, schedule: "WG", leap: true, mgrade: "E-5", yos: 6, deps: true, sesPoint: 0.5 };
  function compute(p, year, locId) {
    p = Object.assign({}, DEFAULT_PROFILE, p);
    const loc = location(locId);
    if (p.system === "GS") {
      const r = gs(year, p.grade, p.step, locId);
      const notes = [`Locality area: ${r.localityName} (${r.localityPct}%).`];
      if (r.capped) notes.push(`Capped at Executive Schedule level IV (${fmt.usd(r.cap)}).`);
      return { title: `GS-${p.grade} Step ${p.step}`, annual: r.annual, hourly: r.hourly, status: r.status,
        rows: [{ key: "base", label: "Base pay", annual: r.base }, { key: "locality", label: `Locality pay (${r.localityPct}%)`, annual: r.locality }], notes };
    }
    if (p.system === "LEO") {
      const r = leo(year, p.grade, p.step, locId, { leap: p.leap });
      const notes = [r.special ? "GS-3 to GS-10 LEOs get special base rates above the regular GS table." : "GS-11 and above use the regular GS base table."];
      notes.push(r.status === "verified" ? `Official ${year} LEO rates (OPM).` : r.status === "projected" ? "Projected from the latest OPM LEO table." : `Estimated from the ${LEO_YEARS.join(", ")} OPM LEO table and the ${year} GS table.`);
      if (p.leap) notes.push("LEAP is 25% availability pay for criminal investigators (GS-1811 and similar).");
      if (r.leapCapped) notes.push(`Base pay plus LEAP is capped at ${fmt.usd(exFor(year).IV)} a year (premium pay cap, 5 U.S.C. 5547), so LEAP here is less than 25%.`);
      const rows = [{ key: "base", label: r.special ? "LEO special base rate" : "Base pay", annual: r.base },
        { key: "locality", label: `Locality pay (${r.localityPct}%)`, annual: r.adjusted - r.base }];
      if (r.leap) rows.push({ key: "leap", label: r.leapCapped ? "LEAP (capped)" : "LEAP (25%)", annual: r.leap });
      return { title: `LEO GS-${p.grade} Step ${p.step}`, annual: r.annual, hourly: round2(r.adjusted / 2087), status: r.status, rows, notes };
    }
    if (p.system === "FWS") {
      const r = fws(year, p.schedule, p.grade, Math.min(p.step, 5), locId);
      return { title: `${p.schedule}-${r.grade} Step ${Math.min(p.step, 5)}`, annual: r.annual, hourly: r.hourly, status: r.status,
        rows: [{ key: "base", label: `Hourly ${fmt.usd2(r.hourly)} × ${FWS_HOURS_PER_YEAR} hrs`, annual: r.annual }],
        notes: [`Wage area: ${r.areaName}${r.areaCode ? ` (schedule ${r.areaCode})` : ""}.`,
          r.effective ? `FY${r.fy} wage schedule, effective ${r.effective}${r.status === "projected" ? `, projected to ${year} with an assumed ${(RAISES.fws[year] * 100).toFixed(1)}% raise` : ""}. Source: DoD Wage and Salary Division.` : "Loading the official wage schedules…",
          "FWS (trades) pay is set hourly by local wage surveys. It has 5 steps instead of 10. Night shift differentials are not included."].concat(location(locId).state === "AK" ? ["In Alaska the schedule depends on road distance (50 miles) from Anchorage, Fairbanks or Juneau, not the county."] : []) };
    }
    if (p.system === "SES") {
      const r = ses(year);
      const annual = Math.round(r.min + (r.maxCertified - r.min) * (p.sesPoint == null ? 0.5 : p.sesPoint));
      return { title: "Senior Executive Service", annual, status: r.status, range: r,
        rows: [{ key: "base", label: "Base pay (set by agency)", annual }],
        notes: [`2026-style range: ${fmt.usd(r.min)} – ${fmt.usd(r.maxCertified)} (certified appraisal system), or up to ${fmt.usd(r.maxUncertified)} otherwise.`, r.note] };
    }
    // Military
    const m = military(year, p.mgrade, p.yos, locId, p.deps);
    if (!m) return { title: `${p.mgrade}`, annual: null, rows: [], status: "approx", notes: [`${p.mgrade} pay doesn't start until more years of service.`] };
    return { title: `${p.mgrade} · ${p.yos} yrs`, annual: m.annual, status: m.status, mil: m,
      rows: [{ key: "base", label: "Basic pay", annual: m.basicAnnual },
        { key: "bah", label: `BAH (${p.deps ? "with" : "without"} dependents)`, annual: m.bah * 12, taxFree: true },
        { key: "bas", label: "BAS", annual: round2(m.bas * 12), taxFree: true }],   // keep cents so the monthly line shows the official rate
      notes: [].concat(year === 2025 && ["E-1", "E-2", "E-3", "E-4", "E-5"].indexOf(p.mgrade) >= 0 ? ["2025 basic pay shown is the January rate. Junior enlisted pay rose again on April 1, 2025."] : [], [`Housing area: ${m.mhaName}.`, `BAH and BAS are tax-free. That's worth about ${fmt.usd(m.taxAdvantage)} a year compared with taxable pay (rough estimate).`, "Special and incentive pays (flight, jump, sea, hazardous duty) are not included."]) };
  }

  // ---------------------------------------------------------------------------
  // progression(profile, year, locId) — "what's my next level?"
  // Returns [{ kind, title, sub, when, profile, annual, delta }], best first.
  // ---------------------------------------------------------------------------
  const GS_STEP_WAIT_YRS = [1, 1, 1, 2, 2, 2, 3, 3, 3];         // step n -> n+1 (52/104/156 weeks)
  const FWS_STEP_WAIT = ["6 months", "18 months", "2 years", "2 years"];
  const yrs = (n) => (n === 1 ? "1 year" : n + " years");
  // Two-step promotion rule, 5 CFR 531.214: current rate plus two within-grade increases of the
  // current grade (above step 8, the step 9-to-10 increase counts as one), then the lowest step of the
  // next grade at or above it. A multi-grade promotion applies the rule one grade at a time.
  function promoteGS(baseFn, year, grade, step, toGrade) {
    let g = grade, s = step;
    while (g < toGrade) {
      const top = baseFn(year, g, 10), wgi = top - baseFn(year, g, 9);
      const target = s <= 8 ? baseFn(year, g, s + 2) : top + (s - 8) * wgi;
      let ns = 10;
      for (let k = 1; k <= 10; k++) if (baseFn(year, g + 1, k) >= target) { ns = k; break; }
      g += 1; s = ns;
    }
    return s;
  }
  function progression(p, year, locId) {
    p = Object.assign({}, DEFAULT_PROFILE, p);
    const now = compute(p, year, locId);
    const out = [];
    const add = (kind, title, sub, when, np) => {
      const r = compute(np, year, locId);
      if (r.annual == null || now.annual == null) return;
      out.push({ kind, title, sub, when, profile: np, annual: r.annual, delta: r.annual - now.annual, result: r });
    };
    if (p.system === "GS" || p.system === "LEO") {
      const baseFn = p.system === "GS" ? gsBase : leoBase;
      const pre = p.system === "LEO" ? "LEO " : "";
      if (p.step < 10) add("step", `Step ${p.step + 1}`, "Next within-grade increase", `after ${yrs(GS_STEP_WAIT_YRS[p.step - 1])} at step ${p.step}`, Object.assign({}, p, { step: p.step + 1 }));
      if (p.grade < 15) {
        const ladder = [5, 7, 9].indexOf(p.grade) >= 0 && p.grade + 2 <= 15;
        const to = ladder ? p.grade + 2 : p.grade + 1;
        const ns = promoteGS(baseFn, year, p.grade, p.step, to);
        add("grade", `${pre}GS-${to} Step ${ns}`, ladder ? "Next grade on a two-grade career ladder" : "Promotion to the next grade", "when you're promoted (two-step rule)", Object.assign({}, p, { grade: to, step: ns }));
      }
      if (p.grade === 15) add("role", "Senior Executive Service", "Move into the SES (no locality pay, so it can pay less in high-cost areas)", "if selected for an SES position", { system: "SES", sesPoint: 0 });
      if (p.step < 9) {
        const wait = GS_STEP_WAIT_YRS.slice(p.step - 1).reduce((a, b) => a + b, 0);
        add("top", `Step 10 (top of GS-${p.grade})`, "Maximum pay in this grade", `about ${yrs(wait)} from now`, Object.assign({}, p, { step: 10 }));
      }
    } else if (p.system === "FWS") {
      const max = FWS_SCHEDULES[p.schedule].grades, st = Math.min(p.step, 5);
      if (st < 5) add("step", `Step ${st + 1}`, "Next within-grade increase", `after ${FWS_STEP_WAIT[st - 1]} at step ${st}`, Object.assign({}, p, { step: st + 1 }));
      if (p.grade < max) add("grade", `${p.schedule}-${p.grade + 1} Step ${st}`, "Promotion to the next grade", "when you're promoted", Object.assign({}, p, { grade: p.grade + 1, step: st }));
      if (p.schedule === "WG") add("role", `WL-${p.grade} Step ${st}`, "Become a wage leader", "if you move into a leader role", Object.assign({}, p, { schedule: "WL", step: st }));
      else if (p.schedule === "WL") add("role", `WS-${Math.max(1, p.grade - 2)} Step ${st}`, "Become a supervisor", "if you move into a supervisor role", Object.assign({}, p, { schedule: "WS", grade: Math.max(1, p.grade - 2), step: st }));
    } else if (p.system === "SES") {
      if ((p.sesPoint || 0) < 1) add("top", "Top of the SES band", "The highest SES pay (certified appraisal system)", "at your agency's discretion", Object.assign({}, p, { sesPoint: 1 }));
    } else {
      // military: next pay-table column, next rank
      const cur = milBasic(year, p.mgrade, p.yos);
      const nextCol = MIL_YOS.find((c) => c > p.yos && milBasic(year, p.mgrade, c) > (cur || 0));
      if (nextCol != null) add("yos", `${p.mgrade} · ${nextCol} yrs`, "Next longevity raise in the pay table", `in ${yrs(nextCol - p.yos)} (at ${nextCol} years of service)`, Object.assign({}, p, { yos: nextCol }));
      const list = MIL_GRADES[milGradeType(p.mgrade)];
      const i = list.indexOf(p.mgrade);
      if (i >= 0 && i < list.length - 1) {
        const ng = list[i + 1];
        const yos = Math.max(p.yos, milMinYos(ng));
        add("promo", `${ng} · ${yos} yrs`, "Promotion to the next rank", yos > p.yos ? `earliest at ${yos} years of service` : "when you're promoted", Object.assign({}, p, { mgrade: ng, yos }));
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Formatting helpers (shared so all three sites look the same numerically)
  // ---------------------------------------------------------------------------
  const fmt = {
    usd: (n) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US")),
    usd2: (n) => (n == null ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
    pct: (n) => (n == null ? "—" : n.toFixed(2) + "%"),
  };

  const STATUS_INFO = {
    verified: { label: "Verified", desc: "Matches a published figure we cross-checked." },
    approx: { label: "Approximate", desc: "Close to published tables; not copied cell-for-cell. Verify before relying on it." },
    simulated: { label: "Simulated", desc: "Placeholder data for prototyping. Not real." },
    projected: { label: "Projected", desc: "Future year; based on assumed raises." },
  };

  // ---------------------------------------------------------------------------
  // Data files loaded on demand in the browser (preloaded at build time and in tests)
  // ---------------------------------------------------------------------------
  const DATA_FILES = { bah: "bah.js", cities: "cities.js", perDiem: "perdiem.js", series: "series.js", fws: "fws.js" };
  const DATA_BASE = (function () {
    try { const sc = global.document && global.document.currentScript; return sc && sc.src ? sc.src.replace(/govpay\.js(\?.*)?$/, "data/") : null; } catch (e) { return null; }
  })();
  const loading = {};
  function has(name) { return !!(global.GOVPAY_DATA && global.GOVPAY_DATA[name]); }
  // GovPay.need(["bah", "cities"]).then(...) — resolves once those files are in (at once if they already are).
  function need(names) {
    if (has("cities")) attachCities();
    const list = [].concat(names || []).filter((n) => DATA_FILES[n] && !has(n));
    return Promise.all(list.map((n) => loading[n] || (loading[n] = new Promise((resolve, reject) => {
      if (!global.document || !DATA_BASE) { resolve(); return; }
      const sc = global.document.createElement("script");
      sc.src = DATA_BASE + DATA_FILES[n];
      sc.async = true;
      sc.onload = () => { if (n === "cities") attachCities(); resolve(); };
      sc.onerror = () => { delete loading[n]; reject(new Error("couldn't load " + DATA_FILES[n])); };
      global.document.head.appendChild(sc);
    })))).then(() => undefined);
  }

  global.GovPay = {
    need, has, bahMhaOf,
    CURRENT_YEAR, YEARS, RAISES, STATUS_INFO, EQUIVALENTS, MIL_GRADES, MIL_YOS,
    FWS_SCHEDULES, GS_LOCALITIES, FOCUS_STATES, OTHER_STATES, ALL_STATES,
    locations: () => LOCATIONS.slice(),
    focusLocations: () => LOCATIONS.filter((l) => !l.simulated),
    promoteGS, location, gs, gsBase, gsTable, gsArea, localityAreas, areaSlug, locationsInArea, hasOrder, leo, leoBase, fws, ses, executiveSchedule,
    fwsCode, milBasic, milTable, bas, bah, military, milGradeType, perDiem, perDiemArea, fiscalYear, trip, fmt,
    compute, progression, DEFAULT_PROFILE, FWS_HOURS_PER_YEAR,
    sources: {
      gs: "https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/",
      leo: "https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/ (LEO tables)",
      fws: "https://wageandsalary.dcpas.osd.mil/BWN/AFWageSchedules/",
      ses: "https://www.opm.gov/policy-data-oversight/pay-leave/salaries-wages/ (SES/EX)",
      mil: "https://www.dfas.mil/MilitaryMembers/payentitlements/Pay-Tables/",
      bah: "https://www.travel.dod.mil/Allowances/Basic-Allowance-for-Housing/",
      perDiem: "https://www.gsa.gov/travel/plan-book/per-diem-rates",
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
