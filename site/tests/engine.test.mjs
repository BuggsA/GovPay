// Engine checks against official published values and hand calculations.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import "../../shared/parse.js";
import { G, T } from "../src/lib/engine.mjs";
const P = globalThis.GovPayParse;
const DC = "Washington-Baltimore-Arlington, DC-MD-VA-WV-PA";

test("GS 2026 base and locality match EO 14368", () => {
  assert.equal(G.gsBase(2026, 12, 5), 86659);           // Schedule 1
  assert.equal(G.gsBase(2026, 1, 1), 22584);
  assert.equal(G.gsBase(2026, 15, 10), 164301);
  assert.equal(G.gsArea(2026, 12, 5, DC).annual, 116071); // 86,659 × 1.3394
  assert.equal(G.localityAreas(2026).length, 58);         // Schedule 9
});

test("GS pay with locality is capped at EX-IV", () => {
  const r = G.gsArea(2026, 15, 10, DC);
  assert.equal(r.annual, 197200);
  assert.equal(r.capped, true);
});

test("GS 2025 vs 2026: every cell rose about 1%", () => {
  for (let g = 1; g <= 15; g++) for (let s = 1; s <= 10; s++) {
    const ratio = G.gsBase(2026, g, s) / G.gsBase(2025, g, s);
    assert.ok(ratio > 1.0098 && ratio < 1.0103, `GS-${g}/${s} ratio ${ratio}`);
  }
});

test("Military basic pay 2026 matches EO 14368 Schedule 8", () => {
  assert.equal(G.milBasic(2026, "E-5", 6), 4110);
  assert.equal(G.milBasic(2026, "O-3", 4), 7382.7);
  assert.equal(G.milBasic(2026, "E-9", 8), null);           // E-9 starts at 10 years
  assert.equal(G.milBasic(2026, "O-10", 22), 18999.9);      // capped at EX-II / 12
});

test("SES and Executive Schedule 2026", () => {
  const s = G.ses(2026);
  assert.deepEqual([s.min, s.maxCertified, s.maxUncertified], [151661, 228000, 209600]);
  assert.equal(G.executiveSchedule(2026).IV, 197200);
});

test("Per diem FY2027 from GSA", () => {
  assert.equal(G.perDiem(2027, "dc", 7).lodging, 192);
  assert.equal(G.perDiem(2027, "norfolk", 1).lodging, 113);  // standard rate
  const trip = G.trip(2026, "dc", "2026-09-29", 3);          // crosses Oct 1
  assert.deepEqual(trip.days.map((d) => d.fy), ["FY2026", "FY2026", "FY2027", "FY2027"]);
});

test("Take-home matches hand calculation (GS-12/5 DC, single, DC tax, FERS 4.4%, TSP 5%)", () => {
  const p = { system: "GS", grade: 12, step: 5 };
  const e = T.estimate(T.payFrom(G.compute(p, 2026, "dc"), p), { filing: "single", state: "DC", fers: "4.4", tspPct: 5 });
  assert.equal(Math.round(e.monthly), 6204);
  assert.equal(Math.round(e.lines.find((l) => l.key === "federal").annual), 15429);
});

test("Utah credit phase-out and PA military exemption", () => {
  const p = { system: "GS", grade: 9, step: 1 };
  const e = T.estimate(T.payFrom(G.compute(p, 2026, "hill-afb"), p), { filing: "mfj", state: "UT", fers: "0.8", tspPct: 5 });
  assert.equal(Math.round(e.lines.find((l) => l.key === "state").annual), 995);
  const m = { system: "MIL", mgrade: "E-5", yos: 6, deps: true };
  const em = T.estimate(T.payFrom(G.compute(m, 2026, "norfolk"), m), { filing: "mfj", state: "PA", tspPct: 5, dutyState: "VA" });
  assert.equal(em.lines.find((l) => l.key === "state").annual, 0);
});

test("Parser understands grades, ranks, postings", () => {
  assert.deepEqual(P.parse("GS-12 step 5 DC")[0].profile, { system: "GS", grade: 12, step: 5, leap: false });
  assert.equal(P.parse("SSG 8 years Fort Meade")[0].profile.mgrade, "E-6");
  assert.deepEqual(P.parse("GS-0343-09/11/12")[0].grades, [9, 11, 12]);
  assert.equal(P.parse("gs-16").length, 0);
});

test("Area slugs are unique and readable", () => {
  const slugs = G.localityAreas(2026).map((a) => a.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(slugs.includes("washington-dc") && slugs.includes("san-diego-ca") && slugs.includes("rest-of-us"));
});

test("Every county maps to its locality area (5 CFR 531.603) and per diem area", () => {
  const counties = G.locations().filter((l) => l.kind === "county");
  assert.ok(counties.length > 3100);
  const area = (fips) => G.gs(2026, 12, 5, "c" + fips).localityName;
  assert.equal(area("51059"), DC);                                   // Fairfax County, VA
  assert.equal(area("51099"), DC);                                   // King George, VA (listed explicitly)
  assert.equal(area("42133"), DC);                                   // York County, PA (moved from Harrisburg by the CFR)
  assert.equal(area("51710"), "Virginia Beach-Norfolk, VA-NC");      // Norfolk city
  assert.equal(area("06073"), "San Diego-Chula Vista-Carlsbad, CA");
  assert.equal(area("49011"), "Rest of U.S.");                       // Davis County, UT (Hill AFB)
  assert.equal(area("32510"), "Sacramento-Roseville, CA-NV");        // Carson City, NV: listed by name in 5 CFR 531.603 (DCPAS agrees)
  assert.equal(G.gs(2026, 12, 5, "c51059").annual, 116071);
  assert.equal(G.perDiem(2027, "c49045", 7).areaName, "Salt Lake City");   // Tooele County uses SLC per diem
  const b = G.bah(2026, "E-5", true, "c51059");                            // Fairfax County: DTMO's DC metro area
  assert.deepEqual([b.mha, b.monthly, b.status], ["DC053", 3132, "verified"]);
});

test("Per diem pages: one slug per area, DC copies folded in, months in fiscal order", async () => {
  const { pdStates, pdAreas, FY_MONTHS, PD_FY } = await import("../src/lib/engine.mjs");
  const states = pdStates();
  assert.equal(states.length, 49);                                   // lower 48 + DC
  for (const s of states) assert.equal(new Set(s.areas.map((a) => a.slug)).size, s.areas.length, s.name);
  assert.ok(!states.find((s) => s.st === "VA").areas.some((a) => a.city === "District of Columbia"));
  assert.deepEqual(FY_MONTHS.slice(0, 4).map((m) => m.name), ["Oct", "Nov", "Dec", "Jan"]);
  const vb = pdAreas(PD_FY).find((a) => a.id === "VA:Virginia Beach");
  assert.equal(vb.lodging[6], 212);                                  // July peak, FY2027 (GSA)
});

test("Two-step promotion rule (5 CFR 531.214) on the 2026 GS table", () => {
  const up = (g, s, to) => G.promoteGS(G.gsBase, 2026, g, s, to);
  assert.equal(up(12, 5, 13), 2);   // target = GS-12/7 $91,757 -> GS-13/2 $93,956 (step 1 is $90,925)
  assert.equal(up(9, 1, 11), 1);    // one grade at a time: GS-9/3 $56,243 -> GS-10/1; GS-10/3 $61,934 -> GS-11/1 $63,795
  assert.equal(up(7, 10, 9), 8);    // $56,039 + 2 x $1,437 = $58,913 -> GS-8/9; $62,057 + $1,591 = $63,648 -> GS-9/8 $65,033
  assert.equal(up(1, 5, 2), 3);     // GS-1's uneven steps: target GS-1/7 $26,771 -> GS-2/3 $26,839
  assert.equal(up(14, 9, 15), 6);   // $139,684 + $3,582 = $143,266, just over GS-15/5 $143,236
});

test("Cities and CDPs take their county's locality and per diem area (Census place-by-county)", () => {
  const at = (name) => G.locations().find((l) => l.name === name);
  const cases = [
    ["Houston, TX", "Harris County", "Houston-The Woodlands, TX", "TX:Houston"],
    ["Arlington, VA", "Arlington County", DC, "DC:District of Columbia"],          // a CDP, not a city
    ["Bethesda, MD", "Montgomery County", DC, "DC:District of Columbia"],
    ["Silver Spring, MD", "Montgomery County", DC, "DC:District of Columbia"],
    ["Colorado Springs, CO", "El Paso County", "Colorado Springs, CO", "CO:Colorado Springs"],
    ["Killeen, TX", "Bell County", "Rest of U.S.", null],                         // Fort Cavazos: standard per diem
    ["Fayetteville, NC", "Cumberland County", "Raleigh-Durham-Cary, NC", "NC:Fayetteville"],   // Cumberland is named in the Raleigh area
  ];
  for (const [name, county, area, pd] of cases) {
    const l = at(name);
    assert.ok(l, name);
    assert.equal(l.county, county, name);
    assert.equal(G.GS_LOCALITIES[l.gsLocality].name.startsWith(area.split(",")[0]), true, `${name}: ${l.gsLocality}`);
    assert.equal(l.perDiem, pd, name);
  }
  assert.ok(G.locations().filter((l) => l.census).length > 6500);
  assert.equal(G.locations().filter((l) => l.name === "Richmond, VA" && l.census).length, 0);   // researched place isn't duplicated
});

test("Search finds cities: bigger city first, same-named counties offered", () => {
  const names = (q) => [...new Set(P.parse(q).map((r) => r.locId && G.location(r.locId).name))];
  assert.deepEqual(names("GS-12 Houston"), ["Houston, TX", "Houston County, AL", "Houston County, GA"]);
  assert.equal(names("GS-11 springfield va")[0], "Springfield, VA");
  assert.equal(names("gs-12 bethesda")[0], "Bethesda, MD");
  assert.equal(names("gs 7 ventura")[0], "San Buenaventura (Ventura), CA");
  assert.equal(names("gs-12 louisville")[0], "Louisville/Jefferson County, KY");
  assert.deepEqual(P.parse("texas"), []);                                                     // a state alone isn't a city
});

test("BAH matches DTMO's 2025 and 2026 rate files; BAS matches DoD FMR 7A ch. 25", () => {
  const id = (name) => G.locations().find((l) => l.name === name).id;
  // San Diego E-5: $3,987 (2025) and $3,975 / $3,147 (2026), also published by third-party BAH sites
  assert.equal(G.bah(2025, "E-5", true, id("San Diego, CA")).monthly, 3987);
  assert.equal(G.bah(2026, "E-5", true, id("San Diego, CA")).monthly, 3975);
  assert.equal(G.bah(2026, "E-5", false, id("San Diego, CA")).monthly, 3147);
  assert.equal(G.bah(2026, "E-5", true, "quantico").mhaName, "Quantico/Woodbridge, VA");
  assert.equal(G.bah(2026, "O-10", true, "dc").monthly, G.bah(2026, "O-7", true, "dc").monthly);   // O-8+ get O-7
  assert.equal(G.bah(2027, "E-5", true, "dc").status, "projected");
  assert.deepEqual([G.bas(2025, "E-4"), G.bas(2025, "O-1"), G.bas(2026, "E-4"), G.bas(2026, "W-2")], [465.77, 320.78, 476.95, 328.48]);
  const m = G.military(2026, "E-5", 6, "norfolk", true);
  assert.deepEqual([m.basic, m.bah, m.bas, m.status], [4110, 2430, 476.95, "verified"]);
  assert.ok(G.locations().filter((l) => l.kind === "county").every((l) => !l.bahSimulated));
});

test("Job posting decoder: 10 real USAJOBS grade strings", () => {
  const d = (q) => { const r = P.parse(q)[0]; return r && r.kind === "posting" ? [r.series, r.seriesName, r.system, r.grades.join("/")] : null; };
  assert.deepEqual(d("GS-0343-09/11/12"), ["0343", "Management and Program Analysis", "GS", "9/11/12"]);
  assert.deepEqual(d("GS-2210-12/13"), ["2210", "Information Technology Management", "GS", "12/13"]);
  assert.deepEqual(d("GS-1811-07/09/11/12/13"), ["1811", "Criminal Investigation", "LEO", "7/9/11/12/13"]);
  assert.deepEqual(d("GS-0560-11"), ["0560", "Budget Analysis", "GS", "11"]);
  assert.deepEqual(d("GS-1102-05/07/09/11/12"), ["1102", "Contracting", "GS", "5/7/9/11/12"]);
  assert.deepEqual(d("WG-5803-10"), ["5803", "Heavy Mobile Equipment Mechanic", "FWS", "10"]);
  assert.deepEqual(d("GS-1896-05/07/09/11/12"), ["1896", "Border Patrol Enforcement", "LEO", "5/7/9/11/12"]);
  assert.deepEqual(d("GS-0343-07-11"), ["0343", "Management and Program Analysis", "GS", "7/9/11"]);   // USAJOBS range, two-grade ladder
  assert.deepEqual(d("GS 2210 11-13"), ["2210", "Information Technology Management", "GS", "11/12/13"]);
  assert.equal(P.parse("GS-0610-11/12 San Diego")[0].locId, G.locations().find((l) => l.name === "San Diego, CA").id);
  assert.equal(P.parse("gs-0357-05")[0].retired, true);
});

test("LEO pay matches OPM's 2026 ALLLEO file", () => {
  const area = (name) => G.locations().find((l) => G.GS_LOCALITIES[l.gsLocality] && G.GS_LOCALITIES[l.gsLocality].name.startsWith(name)).id;
  // cells read straight from the file: ATL grade 5 step 1, AK grade 13 step 1, AL (Albany) grade 10 step 1, RUS grade 3 step 4
  assert.equal(G.leo(2026, 5, 1, area("Atlanta")).annual, 53129);
  assert.equal(G.leo(2026, 13, 1, area("Alaska")).annual, 120348);
  assert.equal(G.leo(2026, 10, 1, area("Albany")).annual, 72461);
  assert.equal(G.leoBase(2026, 13, 1), G.gsBase(2026, 13, 1));        // GS-11 and up: no special rate, no extra adjustment
  assert.equal(G.leoBase(2026, 7, 1), 48854);                        // GL-7 step 1
  const capped = G.leo(2026, 13, 10, "dc", { leap: true });          // $158,322 + 25% LEAP would be $197,903
  assert.deepEqual([capped.annual, capped.leapCapped], [197200, true]);
  assert.equal(G.leo(2026, 7, 1, "dc").status, "verified");
  assert.equal(G.leo(2025, 7, 1, "dc").status, "approx");             // derived until OPM's 2025 file is added
});

test("Trades (FWS) pay matches DCPAS wage schedules", () => {
  const id = (name) => G.locations().find((l) => l.name === name).id;
  // Washington-Baltimore-Arlington (027): FY2026 WG-10 step 2 $36.18 and WG-13 step 2 $41.74 (published), FY2025 $35.82
  assert.equal(G.fws(2026, "WG", 10, 2, "dc").hourly, 36.18);
  assert.equal(G.fws(2026, "WG", 13, 2, "dc").hourly, 41.74);
  assert.equal(G.fws(2025, "WG", 10, 2, "dc").hourly, 35.82);
  assert.equal(G.fws(2026, "WG", 10, 2, "dc").status, "verified");
  assert.equal(G.fws(2027, "WG", 10, 2, "dc").status, "projected");
  assert.equal(G.fws(2026, "WG", 10, 2, "dc").annual, Math.round(36.18 * 2087));
  assert.equal(G.fwsCode(G.location(id("Allen County, IN"))), "049");          // 5 CFR 532 App. C (missing from the DCPAS form)
  assert.equal(G.fwsCode(G.location(id("Oglala Lakota County, SD"))), "150");   // listed by DCPAS under its old name, Shannon County
  assert.ok(G.locations().filter((l) => l.kind === "county").every((l) => G.fwsCode(l)));   // every county has a schedule
  assert.equal(G.fws(2026, "WS", 19, 5, "dc").grade, 19);                       // WS runs to grade 19
});

test("BAH county mapping weights ZIP areas by land, not water (fixed: 177 counties were off)", () => {
  const mha = (fips) => G.bahMhaOf(G.location("c" + fips));
  assert.equal(mha("12087"), "FL069");   // Monroe County, FL -> Florida Keys (Key West 33040 is FL069 in DTMO's ZIP list)
  assert.equal(G.bah(2026, "E-5", true, "c06081").mhaName, "San Francisco, CA");   // San Mateo County
  assert.equal(G.bah(2026, "E-5", true, "c04021").mhaName, "Phoenix, AZ");         // Pinal County
});
