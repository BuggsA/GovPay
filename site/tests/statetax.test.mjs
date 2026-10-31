// State income tax checks: hand calculations from the Tax Foundation 2026 table, and the
// generated data against the five hand-entered focus states. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { T } from "../src/lib/engine.mjs";

const D = globalThis.GOVPAY_DATA.stateTax.states;
// $100,000 of wages, nothing pre-tax, so AGI = $100,000.
const pay = { gross: 100000, taxable: 100000, fica: 100000, retireBase: 0, tspBase: 0, military: false, perYear: 26 };
const stateTax = (st, filing = "single") => {
  const e = T.estimate(pay, { filing, state: st, tspPct: 0 });
  const l = e.lines.find((x) => x.key === "state");
  return l ? l.annual : null;
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} vs ${b}`);

test("All 50 states and DC are covered", () => {
  assert.equal(Object.keys(D).length, 51);
  assert.equal(Object.keys(T.STATES).length, 51);
  const none = Object.keys(D).filter((s) => D[s].none).sort();
  assert.deepEqual(none, ["AK", "FL", "NH", "NV", "SD", "TN", "TX", "WA", "WY"]);
});

test("Generated data matches the hand-entered focus states", () => {
  const inf = (t) => t.map(([u, r]) => [u == null ? Infinity : u, r]);
  for (const st of ["DC", "VA", "MD"]) {
    assert.deepEqual(inf(D[st].single), T.STATES[st].single, st);
    assert.deepEqual(inf(D[st].mfj), T.STATES[st].mfj, st);
    assert.deepEqual(D[st].std, T.STATES[st].std, st);
  }
  assert.deepEqual(D.PA.single, [[null, T.STATES.PA.flat]]);
  assert.deepEqual(D.UT.single, [[null, T.STATES.UT.flat]]);
});

test("California: brackets plus $153 exemption credit", () => {
  const ti = 100000 - 5540;
  const hand = 11079 * .01 + (26264 - 11079) * .02 + (41452 - 26264) * .04 + (57542 - 41452) * .06 + (72724 - 57542) * .08 + (ti - 72724) * .093 - 153;
  near(stateTax("CA"), hand);   // $5,070.42
});

test("New York, Mississippi, Arkansas, Ohio", () => {
  near(stateTax("NY"), 8500 * .039 + 3200 * .044 + 2200 * .0515 + (80650 - 13900) * .054 + (92000 - 80650) * .059);
  near(stateTax("MS"), (100000 - 2300 - 6000 - 10000) * .04);                        // first $10,000 untaxed
  near(stateTax("AR"), 4600 * .02 + (100000 - 2470 - 4600) * .039 - 29);            // over $92,300: the main table
  near(stateTax("OH"), (100000 - 1900 - 26050) * .0275);                            // exemption $1,900 above $80k AGI
});

test("Footnote rules: Wisconsin, Connecticut, Alabama", () => {
  const wiStd = 13960 * (136453 - 100000) / (136453 - 20119);
  const wiTi = 100000 - wiStd - 700;
  near(stateTax("WI"), 15110 * .035 + (51950 - 15110) * .044 + (wiTi - 51950) * .053);
  // CT: exemption gone above $45k; the 2% band shrinks by $9,000 to $1,000.
  near(stateTax("CT"), 1000 * .02 + 49000 * .045 + 50000 * .055);
  // AL: standard deduction floors at $2,500 and federal income tax is deductible.
  const fed = 12400 * .10 + 38000 * .12 + (100000 - 16100 - 50400) * .22;
  near(stateTax("AL"), 500 * .02 + 2500 * .04 + (100000 - 2500 - 1500 - fed - 3000) * .05);
});

test("No-tax states add no state line; local taxes are flagged", () => {
  assert.equal(stateTax("TX"), null);
  assert.equal(T.estimate(pay, { state: "WA" }).noStateTax, true);
  assert.match(T.estimate(pay, { state: "NY" }).localNote, /New York City/);
  assert.equal(T.estimate(pay, { state: "CA" }).localNote, "");
});
