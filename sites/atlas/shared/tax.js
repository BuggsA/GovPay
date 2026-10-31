/*
 * GovPayTax — take-home pay ESTIMATE (deliberately limited; see docs/CONCEPT.md §7).
 *
 * Included: federal income tax, Social Security, Medicare, state income tax
 * (DC, MD + county, PA, UT, VA), FERS, TSP (traditional or Roth), optional
 * health premium, and an "use my own rate" override.
 * Not included: credits (child tax credit etc.), itemizing, spouse income,
 * PA local earned-income tax, Philadelphia wage tax, partial state military
 * subtractions other than Pennsylvania's out-of-state exemption.
 *
 * All tax figures are for tax year 2026, from official sources:
 *   Federal brackets + standard deduction  IRS Rev. Proc. 2025-32 (Tables 1 and 3, §.14)
 *   Social Security wage base $184,500     SSA, Oct 24 2025 (reported widely; ssa.gov not reachable from build)
 *   DC, VA, PA, UT, MD state brackets      Tax Foundation 2026 table (state statutes)
 *   Maryland county rates, AA + Frederick  Maryland Comptroller 2026 Form PV instructions; DLS 2026 local rate table
 *   Maryland exemption phase-out           Maryland Comptroller 2026 Form PV instructions
 *   Utah taxpayer credit phase-out         Utah State Tax Commission (base $18,213 single / $36,426 joint; 1.3%)
 *   FERS employee rates                    5 U.S.C. 8422 (0.8% / 3.1% / 4.4%; LEO 1.3% / 3.6% / 4.9%)
 */
(function (global) {
  "use strict";

  const SOURCES = {
    federal: "https://www.irs.gov/pub/irs-drop/rp-25-32.pdf",
    states: "https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/",
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
    if (o.state === "PA") {
      const paExempt = pay.military && o.dutyState && o.dutyState !== "PA";
      state = paExempt ? 0 : st.flat * Math.max(0, pay.taxable - health);   // PA doesn't deduct TSP
      if (paExempt) stateNote = "Pennsylvania doesn't tax active-duty pay earned outside the state.";
    } else if (o.state === "UT") {
      const credit = Math.max(0, st.creditRate * FED.std[filing] - st.phaseRate * Math.max(0, agi - st.phaseBase[filing]));
      state = Math.max(0, st.flat * agi - credit);
    } else if (o.state === "MD") {
      const taxable = Math.max(0, agi - st.std[filing] - mdExemption(agi, filing));
      state = brackets(taxable, st[filing]);
      local = mdCountyTax(taxable, o.county || "Montgomery", filing);
    } else if (o.state === "DC" || o.state === "VA") {
      const ex = st.exemption ? st.exemption * (filing === "mfj" ? 2 : 1) : 0;
      state = brackets(Math.max(0, agi - st.std[filing] - ex), st[filing]);
    } else if (o.state === "OTHER") {
      state = Math.max(0, +o.otherRate || 0) / 100 * agi;
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
    if (!override && o.state !== "NONE") lines.push({ key: "state", label: o.state === "OTHER" ? "State income tax (your rate)" : `${st ? st.name : "State"} income tax`, annual: state });
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

  const STATE_CHOICES = [["DC", "District of Columbia"], ["MD", "Maryland"], ["PA", "Pennsylvania"], ["UT", "Utah"], ["VA", "Virginia"],
    ["NONE", "A state with no income tax"], ["OTHER", "Another state (enter its rate)"]];
  function defaultState(stateCode) { return STATES[stateCode] ? stateCode : "OTHER"; }

  global.GovPayTax = { estimate, payFrom, STATES, MD_COUNTIES, PLACE_COUNTY, FERS_LABEL, STATE_CHOICES, SOURCES, TAX_YEAR, defaultState };
})(typeof window !== "undefined" ? window : globalThis);
