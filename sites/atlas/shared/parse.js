/*
 * GovPayParse — turn what people type into pay profiles.
 *
 *   GovPayParse.parse("GS-12 step 5 DC")       -> [{ kind:"profile", profile:{system:"GS",grade:12,step:5}, locId:"dc", ... }]
 *   GovPayParse.parse("E-5 6 yrs Norfolk")     -> military profile + location
 *   GovPayParse.parse("GS-0343-09/11/12")      -> { kind:"posting", series:"0343", grades:[9,11,12], ... }
 *
 * Each result: { kind, profile, locId, label, assumed: [...], score }.
 * "assumed" lists defaults the parser filled in (e.g. step 1), so the UI can say so.
 * Pure function of the text plus GovPay.locations(); no DOM. Works in the browser and at build time.
 */
(function (global) {
  "use strict";
  const G = global.GovPay;

  // A small sample of OPM occupational series. The full list (~400) comes with the data pipeline.
  const SERIES = {
    "0080": "Security Administration", "0132": "Intelligence", "0201": "Human Resources Management",
    "0301": "Miscellaneous Administration and Program", "0343": "Management and Program Analysis",
    "0510": "Accounting", "0560": "Budget Analysis", "0610": "Nurse", "0801": "General Engineering",
    "0855": "Electronics Engineering", "1102": "Contracting", "1712": "Training Instruction",
    "1801": "General Inspection, Investigation, Enforcement, and Compliance", "1811": "Criminal Investigation",
    "1896": "Border Patrol Enforcement", "2210": "Information Technology Management",
  };

  // Common rank names → pay grade. Ambiguous across services, so the first match wins and the UI shows the grade.
  const RANKS = [
    [/\b(pvt|private|airman basic|seaman recruit)\b/, "E-1"], [/\b(pfc|lance corporal|lcpl|airman first class|a1c|seaman)\b/, "E-3"],
    [/\b(spc|specialist|cpl|corporal|senior airman|sra|po3|petty officer third class)\b/, "E-4"],
    [/\b(sgt|sergeant|staff sergeant air force|po2|petty officer second class)\b/, "E-5"],
    [/\b(ssg|ssgt|staff sergeant|tech sergeant|tsgt|po1|petty officer first class)\b/, "E-6"],
    [/\b(sfc|sergeant first class|gunnery sergeant|gysgt|msgt|cpo|chief petty officer)\b/, "E-7"],
    [/\b(msg|master sergeant|first sergeant|1sg|smsgt|senior chief|scpo)\b/, "E-8"],
    [/\b(sgm|sergeant major|csm|cmsgt|master chief|mcpo)\b/, "E-9"],
    [/\b(wo1|warrant officer 1)\b/, "W-1"], [/\b(cw2)\b/, "W-2"], [/\b(cw3)\b/, "W-3"], [/\b(cw4)\b/, "W-4"], [/\b(cw5)\b/, "W-5"],
    [/\b(2lt|second lieutenant|ensign|ens)\b/, "O-1"], [/\b(1lt|first lieutenant|ltjg)\b/, "O-2"],
    [/\b(cpt|capt|captain)\b/, "O-3"], [/\b(maj|major|lcdr|lieutenant commander)\b/, "O-4"],
    [/\b(ltc|lt col|lieutenant colonel|cdr|commander)\b/, "O-5"], [/\b(col|colonel|navy captain)\b/, "O-6"],
  ];

  // Extra names people use for places (lowercase). Matched as whole words.
  const ALIASES = {
    dc: ["dc", "washington", "washington dc", "pentagon", "district of columbia"],
    "fort-belvoir": ["belvoir", "fort belvoir"], quantico: ["quantico"], dahlgren: ["dahlgren"],
    norfolk: ["norfolk", "naval station norfolk", "nsn"], "langley-eustis": ["langley", "eustis", "jble", "hampton", "newport news"],
    richmond: ["richmond"], "fort-gregg-adams": ["gregg-adams", "fort gregg-adams", "fort lee", "petersburg"],
    "fort-meade": ["meade", "fort meade", "fort george g. meade", "nsa"], annapolis: ["annapolis", "usna", "naval academy"],
    andrews: ["andrews", "jba", "joint base andrews"], aberdeen: ["aberdeen", "apg"], baltimore: ["baltimore"],
    "pax-river": ["pax river", "patuxent", "patuxent river", "nas pax"], "fort-detrick": ["detrick", "fort detrick", "frederick"],
    philadelphia: ["philadelphia", "philly"], pittsburgh: ["pittsburgh"], carlisle: ["carlisle", "carlisle barracks", "army war college"],
    mechanicsburg: ["mechanicsburg"], harrisburg: ["harrisburg"], "hill-afb": ["hill afb", "hill", "ogden"],
    "salt-lake-city": ["salt lake", "salt lake city", "slc"], dugway: ["dugway", "tooele"], "park-city": ["park city"],
  };

  const norm = (s) => " " + String(s || "").toLowerCase().replace(/[–—]/g, "-").replace(/[^a-z0-9/.\- ]+/g, " ").replace(/\s+/g, " ").trim() + " ";
  const word = (txt, w) => new RegExp("(^|[^a-z0-9])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^a-z0-9])").test(txt);

  function findPlace(t) {
    const locs = G.locations();
    let best = null;
    // 1. explicit aliases and full names (longest match wins)
    locs.forEach((l) => {
      const names = (ALIASES[l.id] || []).concat([l.name.toLowerCase().replace(/\s*\(.*\)$/, "")]);
      names.forEach((n) => { if (n.length > 2 && word(t, n) && (!best || n.length > best.len)) best = { id: l.id, len: n.length }; });
    });
    if (best) return best.id;
    // 2. a state name or two-letter code at the end ("..., VA") picks that state's first place
    for (const l of locs) {
      const st = l.state.toLowerCase();
      if (word(t, l.stateName.toLowerCase()) || new RegExp("[ ,]" + st + " $").test(t)) return locs.find((x) => x.state === l.state).id;
    }
    return null;
  }

  function num(re, t) { const m = t.match(re); return m ? parseInt(m[1], 10) : null; }

  function parse(text) {
    const t = norm(text);
    if (t.trim().length < 2) return [];
    const out = [];
    const locId = findPlace(t);
    const deps = /\b(with dependents|w\/ ?dep|with dep|married|kids|family)\b/.test(t) ? true : /\b(single|no dependents|without dependents|no dep)\b/.test(t) ? false : null;

    // --- job posting: GS-0343-09/11/12, GS-1811-07/09/11/12/13, WG-5803-10
    const post = t.match(/\b(gs|gm|wg|wl|ws)[- ]?(\d{4})[- ]?((?:\d{1,2})(?:\s?\/\s?\d{1,2})*)\b/);
    if (post) {
      const grades = post[3].split("/").map((x) => parseInt(x, 10)).filter((g) => g >= 1 && g <= 15);
      if (grades.length) {
        const sys = post[1] === "gs" || post[1] === "gm" ? (post[2] === "1811" ? "LEO" : "GS") : "FWS";
        out.push({ kind: "posting", series: post[2], seriesName: SERIES[post[2]] || null, system: sys, schedule: post[1].toUpperCase(), grades, locId,
          label: `${post[1].toUpperCase()}-${post[2]} · grades ${grades.join(", ")}`, assumed: SERIES[post[2]] ? [] : ["series name not in the sample list"], score: 10 });
        return out;
      }
    }

    const yos = num(/\b(\d{1,2})\s*(?:\+\s*)?(?:yrs?|years?|yos)\b/, t);
    const isLeo = /\b(leo|1811|law enforcement|criminal investigator|special agent|federal agent)\b/.test(t);

    // --- GS / LEO: "gs-12", "gs 12 step 5", "gs12/5", "12-5"
    let m = t.match(/\bgs[- ]?(\d{1,2})(?:\s?\/\s?(\d{1,2}))?\b/);
    if (m && +m[1] >= 1 && +m[1] <= 15) {
      const grade = +m[1];
      let step = m[2] ? +m[2] : num(/\bstep\s?(\d{1,2})\b/, t) || num(/\bs(\d{1,2})\b/, t);
      const assumed = [];
      if (!step || step > 10) { step = 1; assumed.push("step 1"); }
      const sys = isLeo && grade >= 3 ? "LEO" : "GS";
      out.push({ kind: "profile", profile: { system: sys, grade, step, leap: isLeo }, locId, assumed, score: 9,
        label: `${sys === "LEO" ? "LEO " : ""}GS-${grade}, Step ${step}` });
      if (!isLeo && grade >= 3) out.push({ kind: "profile", profile: { system: "LEO", grade, step, leap: true }, locId, assumed, score: 3, label: `LEO GS-${grade}, Step ${step} (law enforcement)` });
      return out;
    }

    // --- FWS: wg-10, wl 8, ws-12
    m = t.match(/\b(wg|wl|ws)[- ]?(\d{1,2})\b/);
    if (m) {
      let step = num(/\bstep\s?(\d)\b/, t); const assumed = [];
      if (!step || step > 5) { step = 2; assumed.push("step 2"); }
      out.push({ kind: "profile", profile: { system: "FWS", schedule: m[1].toUpperCase(), grade: +m[2], step }, locId, assumed, score: 8,
        label: `${m[1].toUpperCase()}-${+m[2]}, Step ${step}`, note: "Trades pay is simulated for now" });
      return out;
    }

    // --- SES
    if (/\b(ses|senior executive)\b/.test(t)) {
      out.push({ kind: "profile", profile: { system: "SES", sesPoint: 0.5 }, locId, assumed: ["middle of the band"], score: 8, label: "Senior Executive Service" });
      return out;
    }

    // --- military: e-5, o3, w-2, o-3e, or a rank name
    let grade = null;
    m = t.match(/\b([eow])[- ]?(\d{1,2})(e)?\b/);
    if (m) {
      const g = m[1].toUpperCase() + "-" + +m[2] + (m[3] && m[1] === "o" ? "E" : "");
      if (G.milBasic(G.CURRENT_YEAR, g, 40) != null) grade = g;
    }
    if (!grade) for (const [re, g] of RANKS) if (re.test(t)) { grade = g; break; }
    if (grade) {
      let assumed = [];
      let y = yos;
      if (y == null) { y = 4; assumed.push("4 years of service"); }
      const minY = G.milBasic(G.CURRENT_YEAR, grade, y) == null ? [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].find((c) => G.milBasic(G.CURRENT_YEAR, grade, c) != null) : null;
      if (minY != null) { y = minY; assumed = assumed.filter((a) => !/years of service/.test(a)); assumed.push(`${minY} years (the earliest ${grade} rate)`); }
      let d = deps;
      if (d == null) { d = true; assumed.push("with dependents"); }
      out.push({ kind: "profile", profile: { system: "MIL", mgrade: grade, yos: y, deps: d }, locId, assumed, score: 9,
        label: `${grade} · ${y} years · ${d ? "with" : "no"} dependents` });
      return out;
    }

    // --- place only: offer it as a location
    if (locId) out.push({ kind: "place", locId, label: G.location(locId).name, assumed: [], score: 5 });
    return out;
  }

  global.GovPayParse = { parse, SERIES };
})(typeof window !== "undefined" ? window : globalThis);
