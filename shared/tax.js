/*
 * GovPayTax — take-home pay ESTIMATE (deliberately limited; see docs/CONCEPT.md §7).
 *
 * Included: federal income tax, Social Security, Medicare, state income tax
 * for all 50 states and DC (Maryland with its county tax), FERS, TSP
 * (traditional or Roth), optional health premium, and an "use my own rate" override.
 * Not included: credits (child tax credit etc.), itemizing, spouse income,
 * local income taxes (NYC, Ohio and PA cities, Indiana counties...), partial
 * military subtractions for pay earned overseas (MD) or in combat zones,
 * New York and Connecticut "recapture" above about $100k, and the federal-tax
 * deduction in Missouri and Oregon (Alabama's is included).
 *
 * All tax figures are for tax year 2026, from official sources:
 *   Federal brackets + standard deduction  IRS Rev. Proc. 2025-32 (Tables 1 and 3, §.14)
 *   Social Security wage base $184,500     SSA, Oct 24 2025 (reported widely; ssa.gov not reachable from build)
 *   DC, VA, PA, UT, MD state brackets      Tax Foundation 2026 table (state statutes), hand-entered and checked
 *   Every other state                      Tax Foundation 2026 table, via scripts/convert-statetax.py
 *                                          (shared/data/statetax.js); quirks below from its footnotes
 *   Maryland county rates, AA + Frederick  Maryland Comptroller 2026 Form PV instructions; DLS 2026 local rate table
 *   Maryland exemption phase-out           Maryland Comptroller 2026 Form PV instructions
 *   Utah taxpayer credit phase-out         Utah State Tax Commission (base $18,213 single / $36,426 joint; 1.3%)
 *   State military pay exemptions          MyAirForceBenefits state summary (tax year 2025); VA Code 58.1-322.02
 *   FERS employee rates                    5 U.S.C. 8422 (0.8% / 3.1% / 4.4%; LEO 1.3% / 3.6% / 4.9%)
 */
(function (global) {
  "use strict";

  const SOURCES = {
    federal: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf",
    states: "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/",
    statesXlsx: "https://taxfoundation.org/wp-content/uploads/2026/02/2026-State-Individual-Income-Tax-Rates-Brackets.xlsx",
    mdCounty: "https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/forms/worksheets/2025-PV-Worksheet.pdf",
    mdTable: "https://dls.maryland.gov/pubs/prod/NoPblTabPDF/2026CountyLocalTaxRates.pdf",
    utah: "https://incometax.utah.gov/credits/taxpayer-tax-credit",
  };
  const TAX_YEAR = 2026;

  // [upTo, rate] marginal brackets; last upTo = Infinity
  const FED = {
    std: { single: 16100, mfj: 32200 },
    single: [[12400, .10], [50400, .12], [105700, .22], [201775, .24], [256225, .32], [640600, .35], [Infinity, .37]],
    mfj: [[24800, .10], [100800, .12], [211400, .22], [403550, .24], [512450, .32], [768700, .35], [Infinity, .37]],
  };
  const FICA = { ssRate: .062, ssBase: 184500, medRate: .0145, addlRate: .009, addlOver: 200000 };

  const STATES = {
    DC: { name: "District of Columbia", std: { single: 16100, mfj: 32200 },
      single: [[10000, .04], [40000, .06], [60000, .065], [250000, .085], [500000, .0925], [1000000, .0975], [Infinity, .1075]] },
    VA: { name: "Virginia", std: { single: 8750, mfj: 17500 }, exemption: 930,
      single: [[3000, .02], [5000, .03], [17000, .05], [Infinity, .0575]] },
    MD: { name: "Maryland", std: { single: 3350, mfj: 6700 }, exemption: 3200,
      single: [[1000, .02], [2000, .03], [3000, .04], [100000, .0475], [125000, .05], [150000, .0525], [250000, .055], [500000, .0575], [1000000, .0625], [Infinity, .065]],
      mfj: [[1000, .02], [2000, .03], [3000, .04], [150000, .0475], [175000, .05], [225000, .0525], [300000, .055], [600000, .0575], [1200000, .0625], [Infinity, .065]] },
    PA: { name: "Pennsylvania", flat: .0307 },
    UT: { name: "Utah", flat: .045, creditRate: .06, phaseRate: .013, phaseBase: { single: 18213, mfj: 36426 } },
  };
  STATES.DC.mfj = STATES.DC.single; STATES.VA.mfj = STATES.VA.single;
  const HAND = Object.keys(STATES);   // the five focus states keep their checked hand entries and special rules

  const STATE_NAMES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
    DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
    MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
    NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
    PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
    VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  };
  // Every other state from the generated Tax Foundation data. Brackets there are [upTo|null, rate].
  const TF = (global.GOVPAY_DATA && global.GOVPAY_DATA.stateTax) || null;
  const inf = (t) => t.map(([u, r]) => [u == null ? Infinity : u, r]);
  if (TF) Object.keys(TF.states).forEach((st) => {
    if (STATES[st]) return;
    const d = TF.states[st];
    STATES[st] = d.none ? { name: STATE_NAMES[st], none: true } : {
      name: STATE_NAMES[st], single: inf(d.single), mfj: inf(d.mfj), std: d.std || { single: 0, mfj: 0 },
      exemptionBoth: d.exemption || null, credit: d.exemptionCredit || d.stdCredit || null, local: d.notes.indexOf("a") >= 0,
    };
  });
  // Local income taxes exist in these states (Tax Foundation note a); Paybook doesn't include them.
  const LOCAL_NOTE = { NY: "New York City and Yonkers income tax", OH: "Ohio city and school district income tax", IN: "Indiana county income tax",
    KY: "Kentucky city and county occupational tax", MI: "Michigan city income tax", MO: "Kansas City and St. Louis earnings tax",
    OR: "Portland-area income taxes", AL: "Alabama city occupational tax", IA: "Iowa school district surtax", DE: "Wilmington wage tax",
    MD: "", 
    PA: "Pennsylvania local earned-income tax" };

  // Footnote rules from the Tax Foundation table that matter at federal pay levels.
  const QUIRKS = {
    // (c) Standard deduction steps down with AGI; (b) federal income tax paid is deductible.
    AL: { std: (agi, f) => f === "mfj" ? Math.max(5000, 8500 - 175 * Math.ceil(Math.max(0, agi - 25999) / 500)) : Math.max(2500, 3000 - 25 * Math.ceil(Math.max(0, agi - 25499) / 500)),
      deductFederal: true },
    // (g) Taxable income of $92,300 or less uses Arkansas's low-income table (2025 amounts).
    AR: { table: (ti) => ti <= 92300 ? [[5500, 0], [10900, .02], [15600, .03], [25700, .034], [Infinity, .039]] : null },
    // (r) Personal exemption falls $1,000 per $1,000 of AGI over $30,000 ($48,000 joint).
    // (p) The 2% band shrinks $1,000 ($2,000 joint) per $5,000 of AGI over $56,500 ($100,500), and AGI over
    //     $105,000 ($210,000) adds $25 per $5,000 ($50 per $10,000), up to $250 ($500).
    CT: { exemption: (agi, f) => Math.max(0, (f === "mfj" ? 24000 : 15000) - 1000 * Math.ceil(Math.max(0, agi - (f === "mfj" ? 48000 : 30000)) / 1000)),
      table: (ti, agi, f) => {
        const t = STATES.CT[f].map((b) => b.slice());
        const cut = f === "mfj" ? 2000 * Math.ceil(Math.max(0, agi - 100500) / 5000) : 1000 * Math.ceil(Math.max(0, agi - 56500) / 5000);
        t[0][0] = Math.max(0, t[0][0] - cut);
        return t;
      },
      addTax: (agi, f) => f === "mfj" ? Math.min(500, 50 * Math.ceil(Math.max(0, agi - 210000) / 10000)) : Math.min(250, 25 * Math.ceil(Math.max(0, agi - 105000) / 5000)) },
    // (dd) Ohio exemption by AGI.
    OH: { exemption: (agi, f) => (f === "mfj" ? 2 : 1) * (agi <= 40000 ? 2400 : agi <= 80000 ? 2150 : agi < 500000 ? 1900 : 0) },
    // (ii) Wisconsin's standard deduction phases out between $20,119 and $136,453 ($29,039 and $159,690 joint).
    WI: { std: (agi, f) => { const [s, a, b] = f === "mfj" ? [25840, 29039, 159690] : [13960, 20119, 136453]; return agi <= a ? s : agi >= b ? 0 : s * (b - agi) / (b - a); } },
    // (v) No personal exemption above $250,000 AGI ($500,000 joint).
    IL: { exemption: (agi, f) => agi > (f === "mfj" ? 500000 : 250000) ? 0 : STATES.IL.exemptionBoth[f] },
    // (hh) Above $150,000 AGI, Vermont tax is at least 3% of AGI.
    VT: { minTax: (agi) => agi > 150000 ? 0.03 * agi : 0 },
  };
  // Active-duty military pay, by state of legal residence. Source: MyAirForceBenefits, "Which states tax my
  // Active Duty or Reserve military pay?" (tax year 2025), plus the Virginia and Oregon statutes it summarizes.
  //   full:     all active-duty pay exempt
  //   outside:  exempt while stationed outside the state (CT and NY also need no home and < 30 days in the state)
  //   inState(pay): amount subtracted while stationed in the state
  //   outsideCap: exemption capped at this amount when stationed outside (Louisiana, > 120 days)
  const MIL_RULES = {
    AZ: { full: true }, AR: { full: true }, IL: { full: true }, IN: { full: true }, IA: { full: true }, KY: { full: true },
    MI: { full: true }, MN: { full: true }, MO: { full: true }, MT: { full: true }, NM: { full: true }, ND: { full: true }, OK: { full: true },
    CA: { outside: true }, ID: { outside: true, note: "if away 120+ days in a row" }, ME: { outside: true }, OH: { outside: true },
    PA: { outside: true }, VT: { outside: true }, CT: { outside: true, note: "if you keep no home there and spend under 30 days there" },
    NY: { outside: true, note: "if you keep no home there and spend 30 days or less there" },
    OR: { outside: true, inState: () => 6000 },
    LA: { outsideCap: 50000, note: "if away 120+ days in a row" },
    // Virginia: up to $15,000, reduced dollar for dollar above $15,000 of basic pay (none at $30,000+).
    VA: { inState: (pay) => Math.max(0, 15000 - Math.max(0, pay - 15000)), anywhere: true },
  };
  const MIL_SOURCE = "https://myairforcebenefits.us.af.mil/Which-states-tax-my-Active-Duty-or-Reserve-military-pay";
  // How much military pay the state leaves out, and a sentence saying so.
  function milSubtraction(code, pay, dutyState) {
    const r = MIL_RULES[code], name = STATE_NAMES[code];
    if (!r) return { amount: 0, note: "" };
    const away = dutyState && dutyState !== code;
    if (r.full) return { amount: pay, note: `${name} doesn't tax active-duty pay.` };
    if (r.outside && away) return { amount: pay, note: `${name} doesn't tax active-duty pay earned while stationed outside the state${r.note ? ", " + r.note : ""}.` };
    if (r.outsideCap && away) return { amount: Math.min(pay, r.outsideCap), note: `${name} exempts up to ${"$" + r.outsideCap.toLocaleString("en-US")} of military pay earned outside the state, ${r.note}.` };
    if (r.inState && (r.anywhere || !away)) {
      const a = Math.min(pay, r.inState(pay));
      return { amount: a, note: a ? `${name} subtracts ${"$" + Math.round(a).toLocaleString("en-US")} of military pay.` : "" };
    }
    return { amount: 0, note: "" };
  }

  function genericState(code, agi, filing, federal) {
    const st = STATES[code], q = QUIRKS[code] || {};
    if (!st || st.none) return 0;
    const std = q.std ? q.std(agi, filing) : st.std[filing] || 0;
    const ex = q.exemption ? q.exemption(agi, filing) : st.exemptionBoth ? st.exemptionBoth[filing] || 0 : 0;
    const ti = Math.max(0, agi - std - ex - (q.deductFederal ? federal : 0));
    let tax = brackets(ti, (q.table && q.table(ti, agi, filing)) || st[filing]);
    if (st.credit) tax -= st.credit[filing] || 0;
    if (q.addTax) tax += q.addTax(agi, filing);
    tax = Math.max(0, tax);
    if (q.minTax) tax = Math.max(tax, q.minTax(agi));
    return tax;
  }

  // Maryland county (and Baltimore City) rates, tax year 2026. Graduated counties use brackets.
  const MD_COUNTIES = {
    "Allegany": .032, "Anne Arundel": { single: [[50000, .027], [400000, .0294], [Infinity, .032]], mfj: [[75000, .027], [480000, .0294], [Infinity, .032]] },
    "Baltimore City": .032, "Baltimore County": .032, "Calvert": .032, "Caroline": .032, "Carroll": .0303, "Cecil": .0274, "Charles": .0303,
    "Dorchester": .033, "Frederick": { tier: true, single: [[25000, .0225], [50000, .0275], [150000, .0296], [Infinity, .032]], mfj: [[25000, .0225], [100000, .0275], [250000, .0296], [Infinity, .032]] },
    "Garrett": .0265, "Harford": .0306, "Howard": .032, "Kent": .033, "Montgomery": .032, "Prince George's": .032, "Queen Anne's": .032,
    "St. Mary's": .032, "Somerset": .032, "Talbot": .024, "Washington": .0295, "Wicomico": .032, "Worcester": .0225,
  };
  // Default county for the app's Maryland places
  const PLACE_COUNTY = { "fort-meade": "Anne Arundel", annapolis: "Anne Arundel", andrews: "Prince George's", aberdeen: "Harford", baltimore: "Baltimore City", "pax-river": "St. Mary's", "fort-detrick": "Frederick" };

  const FERS = { regular: { "0.8": .008, "3.1": .031, "4.4": .044 }, leo: { "0.8": .013, "3.1": .036, "4.4": .049 } };
  const FERS_LABEL = { "0.8": "hired before 2013", "3.1": "hired in 2013", "4.4": "hired 2014 or later" };

  function brackets(income, table) {
    let tax = 0, prev = 0;
    for (const [upTo, rate] of table) {
      if (income <= prev) break;
      tax += (Math.min(income, upTo) - prev) * rate;
      prev = upTo;
    }
    return tax;
  }
  function mdExemption(agi, filing) {
    const people = filing === "mfj" ? 2 : 1;
    const t = filing === "mfj" ? [150000, 175000, 200000] : [100000, 125000, 150000];
    const each = agi <= t[0] ? 3200 : agi <= t[1] ? 1600 : agi <= t[2] ? 800 : 0;
    return each * people;
  }
  function mdCountyTax(taxable, county, filing) {
    const c = MD_COUNTIES[county];
    if (c == null) return 0;
    if (typeof c === "number") return taxable * c;
    const table = c[filing] || c.single;
    if (c.tier) { for (const [upTo, rate] of table) if (taxable <= upTo) return taxable * rate; return 0; }  // Frederick: one rate on all income
    return brackets(taxable, table);
  }

  /*
   * estimate(pay, opts)
   *  pay:  { gross, taxable, fica, retireBase, tspBase, military, leo, perYear }   all annual dollars
   *  opts: { filing:"single"|"mfj", state:"DC"|"MD"|"PA"|"UT"|"VA"|"NONE"|"OTHER", county, fers:"0.8"|"3.1"|"4.4",
   *          tspPct, tspType:"trad"|"roth", health (per paycheck), ownRate (%), otherRate (%), dutyState }
   */
  function estimate(pay, o) {
    const filing = o.filing === "mfj" ? "mfj" : "single";
    const perYear = pay.perYear || 26;
    const health = Math.max(0, (+o.health || 0) * perYear);
    const tsp = Math.max(0, Math.min(100, +o.tspPct || 0)) / 100 * pay.tspBase;
    const tspTrad = o.tspType === "roth" ? 0 : tsp;
    const fers = pay.military ? 0 : (FERS[pay.leo ? "leo" : "regular"][o.fers || "4.4"] || 0) * pay.retireBase;

    const agi = Math.max(0, pay.taxable - tspTrad - health);              // wages after pre-tax TSP and health
    const ficaWages = Math.max(0, pay.fica - health);
    const ss = FICA.ssRate * Math.min(ficaWages, FICA.ssBase);
    const medicare = FICA.medRate * ficaWages + FICA.addlRate * Math.max(0, ficaWages - FICA.addlOver);

    let federal = brackets(Math.max(0, agi - FED.std[filing]), FED[filing]);
    let state = 0, local = 0, stateNote = "";
    const st = STATES[o.state];
    // Military pay the state of legal residence leaves out (pay.taxable is basic pay for service members).
    const mil = pay.military && st && !st.none ? milSubtraction(o.state, pay.taxable, o.dutyState) : { amount: 0, note: "" };
    const sAgi = Math.max(0, agi - mil.amount);
    stateNote = mil.note;
    if (o.state === "PA") {
      state = st.flat * Math.max(0, pay.taxable - health - mil.amount);   // PA doesn't deduct TSP
    } else if (o.state === "UT") {
      const credit = Math.max(0, st.creditRate * FED.std[filing] - st.phaseRate * Math.max(0, agi - st.phaseBase[filing]));
      state = Math.max(0, st.flat * agi - credit);
    } else if (o.state === "MD") {
      const taxable = Math.max(0, agi - st.std[filing] - mdExemption(agi, filing));
      state = brackets(taxable, st[filing]);
      local = mdCountyTax(taxable, o.county || "Montgomery", filing);
    } else if (o.state === "DC" || o.state === "VA") {
      const ex = st.exemption ? st.exemption * (filing === "mfj" ? 2 : 1) : 0;
      state = brackets(Math.max(0, sAgi - st.std[filing] - ex), st[filing]);
    } else if (o.state === "OTHER") {
      state = Math.max(0, +o.otherRate || 0) / 100 * agi;
    } else if (st && !st.none) {
      state = sAgi > 0 ? genericState(o.state, sAgi, filing, federal) : 0;
    }

    let override = false;
    if (o.ownRate !== "" && o.ownRate != null && !isNaN(+o.ownRate)) {
      override = true;
      const r = Math.max(0, Math.min(60, +o.ownRate)) / 100;
      federal = r * agi; state = 0; local = 0;
    }

    const lines = [
      { key: "federal", label: override ? `Income tax (your rate ${(+o.ownRate).toFixed(1)}%)` : "Federal income tax", annual: federal },
      { key: "ss", label: "Social Security", annual: ss },
      { key: "medicare", label: "Medicare", annual: medicare },
    ];
    if (!override && o.state !== "NONE" && !(st && st.none)) lines.push({ key: "state", label: o.state === "OTHER" ? "State income tax (your rate)" : `${st ? st.name : "State"} income tax`, annual: state });
    if (!override && local) lines.push({ key: "local", label: `${o.county} County tax`.replace("City County", "City").replace("County County", "County"), annual: local });
    if (fers) lines.push({ key: "fers", label: `FERS retirement (${(FERS[pay.leo ? "leo" : "regular"][o.fers || "4.4"] * 100).toFixed(1)}%)`, annual: fers });
    if (tsp) lines.push({ key: "tsp", label: `TSP ${+o.tspPct}% (${o.tspType === "roth" ? "Roth" : "traditional"})`, annual: tsp });
    if (health) lines.push({ key: "health", label: "Health premium", annual: health });
    const deductions = lines.reduce((a, l) => a + l.annual, 0);
    const takeHome = pay.gross - deductions;
    const incomeTax = federal + state + local;
    return {
      gross: pay.gross, takeHome, monthly: takeHome / 12, perCheck: takeHome / perYear, lines, deductions,
      effectiveIncomeTax: pay.gross ? incomeTax / pay.gross : 0, override, stateNote, taxYear: TAX_YEAR,
      noStateTax: o.state === "NONE" || !!(st && st.none), localNote: !override && LOCAL_NOTE[o.state] && o.state !== "MD" ? LOCAL_NOTE[o.state] : "",
    };
  }

  // Build the pay inputs from a GovPay.compute() result.
  function payFrom(result, profile) {
    const mil = profile.system === "MIL";
    if (mil) {
      const basic = result.mil.basicAnnual;
      return { gross: result.annual, taxable: basic, fica: basic, retireBase: 0, tspBase: basic, military: true, leo: false, perYear: 24 };
    }
    return { gross: result.annual, taxable: result.annual, fica: result.annual, retireBase: result.annual, tspBase: result.annual,
      military: false, leo: profile.system === "LEO", perYear: 26 };
  }

  const STATE_CHOICES = Object.keys(STATES).sort((a, b) => STATES[a].name.localeCompare(STATES[b].name)).map((k) => [k, STATES[k].name + (STATES[k].none ? " (no income tax)" : "")])
    .concat([["NONE", "A state with no income tax"], ["OTHER", "Somewhere else (enter a rate)"]]);
  function defaultState(stateCode) { return STATES[stateCode] ? stateCode : "OTHER"; }

  global.GovPayTax = { STATE_NAMES, QUIRKS, HAND, MIL_RULES, MIL_SOURCE, estimate, payFrom, STATES, MD_COUNTIES, PLACE_COUNTY, FERS_LABEL, STATE_CHOICES, SOURCES, TAX_YEAR, defaultState };
})(typeof window !== "undefined" ? window : globalThis);
