// The link-preview card for every pre-built page: path -> { kicker, title, number, sub, stamp }.
// Numbers come from the same engine calls the pages make (military pay keeps its cents, as on the pages). Used by scripts/og-images.mjs and Base.astro.
import { G, f, YEAR, SOURCE, areaShort, PD_FY, pdStates, pdStandard, MIL_ORDER, milSlug } from "./engine.mjs";

export const ogPath = (path) => `/og${path === "/" ? "/index" : path}.png`;

export function allCards() {
  const cards = new Map();
  const add = (path, card) => cards.set(path, card);
  const areas = G.localityAreas(YEAR);
  const byPct = areas.slice().sort((a, b) => b.pct - a.pct);

  add("/", { kicker: `${YEAR} federal and military pay`, title: "Your federal pay, read like a pay stub", sub: "GS, LEO, SES and military pay, take-home and your next raise" });
  add("/about/data", { kicker: "About the data", title: "Where Paybook's numbers come from", sub: "Official pay orders, GSA, IRS, Census and Tax Foundation" });
  add("/civilian/gs", { kicker: `General Schedule · ${YEAR}`, title: `GS pay in all ${areas.length} locality areas`, number: `+${byPct[byPct.length - 1].pct.toFixed(2)}% to +${byPct[0].pct.toFixed(2)}%`, sub: "locality pay on top of the nationwide base table", stamp: "Official" });
  for (let g = 1; g <= 15; g++) {
    const s1 = areas.map((a) => G.gsArea(YEAR, g, 1, a.name).annual);
    add(`/civilian/gs/${g}`, { kicker: `GS-${g} · ${YEAR} · every location`, title: `GS-${g} pay across the U.S.`, number: `${f.usd(Math.min(...s1))} to ${f.usd(Math.max(...s1))}`, sub: `step 1, from the lowest to the highest of ${areas.length} locality areas`, stamp: "Official" });
  }
  areas.forEach((a) => {
    const place = areaShort(a.name);
    add(`/civilian/gs/table/${a.slug}`, { kicker: `GS pay table · ${place} · ${YEAR}`, title: `Every GS grade and step in ${place}`, number: `+${a.pct.toFixed(2)}% locality`, sub: `GS-1 step 1 ${f.usd(G.gsArea(YEAR, 1, 1, a.name).annual)} to GS-15 step 10 ${f.usd(G.gsArea(YEAR, 15, 10, a.name).annual)}`, stamp: "Official" });
    for (let g = 1; g <= 15; g++) {
      const lo = G.gsArea(YEAR, g, 1, a.name).annual, hi = G.gsArea(YEAR, g, 10, a.name).annual;
      add(`/civilian/gs/${g}/${a.slug}`, { kicker: `GS-${g} · ${place} · ${YEAR}`, title: `GS-${g} pay in ${place}`, number: `${f.usd(lo)} to ${f.usd(hi)}`, sub: `a year, steps 1 to 10, including ${a.pct.toFixed(2)}% locality pay`, stamp: "Official" });
    }
  });

  const t = G.milTable(YEAR);
  const vals = (g) => t.rows[g].filter((v) => v != null);
  add("/military/pay-chart", { kicker: `${YEAR} military pay chart`, title: "Monthly basic pay by rank and years", number: `${f.usd2(vals("E-1")[0])} to ${f.usd2(Math.max(...vals("O-10")))}`, sub: "a month, E-1 to O-10, same at every duty station", stamp: "Official" });
  MIL_ORDER.forEach((g) => {
    const v = vals(g);
    add(`/military/pay/${milSlug(g)}`, { kicker: `${g} · ${YEAR} basic pay`, title: `${g} pay by years of service`, number: `${f.usd2(v[0])} to ${f.usd2(v[v.length - 1])}`, sub: "a month in basic pay, before BAH and BAS", stamp: "Official" });
  });

  const std = pdStandard();
  add("/travel/per-diem", { kicker: `Per diem · FY${PD_FY}`, title: "Federal travel per diem by state", number: `${f.usd(std.lodging[0])} + ${f.usd(std.mie)}`, sub: "standard lodging a night + meals and incidentals a day", stamp: "GSA" });
  pdStates().forEach((s) => {
    const top = s.areas.slice().sort((a, b) => b.max - a.max)[0];
    add(`/travel/per-diem/${s.slug}`, s.areas.length
      ? { kicker: `${s.name} per diem · FY${PD_FY}`, title: `${s.areas.length} ${s.name} area${s.areas.length > 1 ? "s" : ""} with their own rate`, number: `up to ${f.usd(top.max)} + ${f.usd(top.mie)}`, sub: `in ${top.city}; ${f.usd(std.lodging[0])} + ${f.usd(std.mie)} everywhere else`, stamp: "GSA" }
      : { kicker: `${s.name} per diem · FY${PD_FY}`, title: `Every place in ${s.name} uses the standard rate`, number: `${f.usd(std.lodging[0])} + ${f.usd(std.mie)}`, sub: "lodging a night + meals and incidentals a day", stamp: "GSA" });
    s.areas.forEach((a) => add(`/travel/per-diem/${s.slug}/${a.slug}`, {
      kicker: `${a.city}, ${s.st} · FY${PD_FY} per diem`, title: `Per diem in ${a.city}`,
      number: `${a.min === a.max ? f.usd(a.max) : `${f.usd(a.min)}–${f.usd(a.max)}`} + ${f.usd(a.mie)}`,
      sub: `lodging a night${a.min === a.max ? "" : " (by month)"} + meals and incidentals a day`, stamp: "GSA",
    }));
  });
  return cards;
}
