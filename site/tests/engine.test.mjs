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
  assert.equal(G.gs(2026, 12, 5, "c51059").annual, 116071);
  assert.equal(G.perDiem(2027, "c49045", 7).areaName, "Salt Lake City");   // Tooele County uses SLC per diem
  assert.equal(G.bah(2026, "E-5", true, "c51059").status, "approx");       // BAH is never shown as official yet
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
