// Search: military installations, and the many ways people write a grade and step.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import "../../shared/parse.js";
import { G } from "../src/lib/engine.mjs";
const P = globalThis.GovPayParse;
const place = (q) => { const r = P.parse(q)[0]; return r && r.locId ? G.location(r.locId).name : null; };
const places = (q) => [...new Set(P.parse(q).map((r) => r.locId && G.location(r.locId).name))];
const label = (q) => (P.parse(q)[0] || {}).label;

test("Bases are found by name, short name, old or new name, and spelled out", () => {
  for (const q of ["eglin", "Eglin AFB", "eglin air force base", "GS-12 step 3 Eglin"]) assert.equal(place(q), "Eglin AFB", q);
  for (const q of ["NAS Pensacola", "naval air station pensacola", "Pensacola Naval Air Station"]) assert.equal(place(q), "Naval Air Station Pensacola", q);
  assert.equal(place("naval station san diego"), "Naval Base San Diego");
  assert.equal(place("Ft. Hood"), "Fort Hood");
  assert.equal(place("fort cavazos"), "Fort Hood");
  assert.equal(place("fort liberty"), "Fort Bragg");
  assert.equal(place("jblm"), "Joint Base Lewis-McChord");
  assert.equal(place("pearl harbor"), "Joint Base Pearl Harbor-Hickam");
  assert.equal(place("E-5 camp lejeune"), "Camp Lejeune");
  assert.equal(place("Kings Bay"), "Naval Submarine Base Kings Bay");
  assert.equal(place("Norfolk"), "Naval Station Norfolk");                       // researched place unchanged
  assert.equal(place("pensacola"), "Pensacola, FL");                             // the city, still
  assert.equal(place("st louis gs 12"), "St. Louis, MO");                        // no period needed
  // a one-word base name that's also a town: both offered, and a typed state picks the town
  assert.deepEqual(places("bangor").slice(0, 2), ["Naval Base Kitsap-Bangor", "Bangor, ME"]);
  assert.equal(place("bangor me"), "Bangor, ME");
});

test("A base takes its county's GS locality and per diem, and the housing area of a ZIP on base", () => {
  const eglin = G.location("i-eglin-afb");
  assert.equal(eglin.county, "Okaloosa County");
  assert.equal(eglin.gsLocality, G.location(eglin.countyId).gsLocality);
  assert.equal(eglin.perDiem, G.location(eglin.countyId).perDiem);
  assert.match(G.bah(2026, "E-5", true, "i-eglin-afb").mhaName, /eglin/i);
  assert.equal(G.bahMhaOf(eglin), "FL056");                                      // DTMO: EGLIN AFB, FL
  assert.equal(G.bahMhaOf(G.location("i-fort-campbell")), "KY106");              // Fort Campbell, KY
  assert.equal(G.location("i-fort-campbell").state, "KY");
  assert.ok(G.locations().filter((l) => l.installation).length >= 150);
  // every base is in the state the list says, and its county exists
  for (const l of G.locations().filter((x) => x.installation)) assert.equal(G.location(l.countyId).state, l.state, l.name);
});

test("Grade and step, written many ways", () => {
  for (const q of ["GS-12 Step 3", "GS-12 step3", "gs-12-3", "GS 12 3", "gs12/3", "gs-12 st 3", "GS-12 S3", "GS-12 step three",
    "GS-12 third step", "grade 12 step 3", "12 step 3", "12-3", "Step 3 GS-12", "GS-12, Step 3"]) assert.equal(label(q), "GS-12, Step 3", q);
  assert.equal(label("gs 12 3 norfolk"), "GS-12, Step 3");
  assert.equal(place("gs 12 3 norfolk"), "Naval Station Norfolk");
  assert.equal(label("gs-12"), "GS-12, Step 1");
  assert.deepEqual(P.parse("gs-12")[0].assumed, ["step 1"]);
  assert.equal(label("gs 12 22201"), "GS-12, Step 1");                          // a ZIP isn't a step
  assert.equal(label("WG-10-4"), "WG-10, Step 4");
  assert.equal(label("GS-0343-09/11/12 Richmond"), "GS-0343 · grades 9, 11, 12");
  assert.equal(label("E-5 6 years Norfolk"), "E-5 · 6 years · with dependents");
});

test("A step past the top shows the top step and says so", () => {
  const r = P.parse("GS-12 step 12")[0];
  assert.equal(r.label, "GS-12, Step 10");
  assert.match(r.assumed[0], /top step \(steps go 1 to 10\)/);
  assert.equal(label("GS-3 step 12"), "GS-3, Step 10");
  assert.equal(label("WG-10 step 7"), "WG-10, Step 5");
});
