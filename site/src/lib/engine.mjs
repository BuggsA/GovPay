// Build-time access to the same engine the browser uses. The shared files are plain
// scripts that attach GovPay, GovPayTax and the data to globalThis.
import "../../../shared/data/payorder.js";
import "../../../shared/data/perdiem.js";
import "../../../shared/data/places.js";
import "../../../shared/data/cities.js";
import "../../../shared/data/bah.js";
import "../../../shared/data/series.js";
import "../../../shared/data/leo.js";
import "../../../shared/data/fws.js";   // the browser loads this one on demand
import "../../../shared/govpay.js";
import "../../../shared/data/statetax.js";
import "../../../shared/tax.js";

export const G = globalThis.GovPay;
export const T = globalThis.GovPayTax;
export const YEAR = G.CURRENT_YEAR;
export const f = G.fmt;
export const SOURCE = {
  2025: { label: "EO 14132", url: "https://www.govinfo.gov/content/pkg/FR-2024-12-30/pdf/2024-31466.pdf" },
  2026: { label: "EO 14368", url: "https://www.govinfo.gov/content/pkg/FR-2025-12-23/pdf/2025-23844.pdf" },
};
// A short display name for an area: "Washington–Baltimore–Arlington" → "Washington, DC"
export function areaShort(name) {
  if (/^rest of u/i.test(name)) return "Rest of U.S.";
  const m = name.match(/^([^,-]+)[^,]*,\s*([A-Z]{2})/);
  return m ? `${m[1].trim()}, ${m[2]}` : name;
}
// Calculator link with the job (and a place in that area, when the app has one) filled in.
export function calcLink(profile, areaName, locId) {
  const loc = locId ? { id: locId } : areaName ? G.locationsInArea(areaName)[0] : null;
  const p = [`y=${YEAR}`, loc ? `l=${loc.id}` : "", `s=${profile.system}`];
  if (profile.system === "MIL") p.push(`g=${profile.mgrade}`, `yos=${profile.yos}`, "d=1");
  else p.push(`g=${profile.grade}`, `st=${profile.step || 1}`);
  return "/#" + p.filter(Boolean).join("&");
}

// ---------------------------------------------------------------- per diem pages
const PD = globalThis.GOVPAY_DATA.perDiem;
const PD_YEARS = Object.keys(PD).map(Number).sort();
// The fiscal year in effect when the site is built (FY2027 = Oct 2026 to Sep 2027).
export const PD_FY = PD_YEARS.filter((y) => y <= G.fiscalYear(new Date())).pop() || PD_YEARS[PD_YEARS.length - 1];
// Months in fiscal-year order. Index into GSA's lodging array, which is Jan..Dec.
export const FY_MONTHS = [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ i, name: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i] }));
export const PD_SOURCE = { label: "GSA Per Diem API", url: "https://www.gsa.gov/travel/plan-book/per-diem-rates" };
export const pdFetchedAt = (fy) => PD[fy] && PD[fy].fetchedAt;
export function slugify(s) { return s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
// Every special-rate per diem area for a fiscal year: { id, state, city, slug, counties, mie, lodging[12] }
// GSA repeats the DC area under MD and VA; those copies get no page of their own.
export const pdDupe = (a) => a.city === "District of Columbia" && a.state !== "DC";
export function pdAreas(fy = PD_FY) {
  return Object.entries(PD[fy].areas).map(([id, [city, counties, mie, lodging]]) => ({
    id, state: id.slice(0, 2), city, slug: slugify(city), counties, mie, lodging,
    max: Math.max(...lodging), min: Math.min(...lodging),
  }));
}
export const pdStandard = (fy = PD_FY) => PD[fy].standard;
export const mieTier = (fy, mie) => PD[fy].mieTiers.find((t) => t.total === mie) || null;
// States (and DC) that appear in the per diem data, plus every other state with only the standard rate.
export function pdStates(fy = PD_FY) {
  const areas = pdAreas(fy);
  return Object.entries(G.ALL_STATES).filter(([st]) => st !== "AK" && st !== "HI")
    .map(([st, name]) => ({ st, name, slug: slugify(name), areas: areas.filter((a) => a.state === st && !pdDupe(a)).sort((a, b) => a.city.localeCompare(b.city)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
// Counties (from the places file) that use a per diem area.
export function countiesFor(id) { return G.locations().filter((l) => l.kind === "county" && l.perDiem === id); }

// ---------------------------------------------------------------- military pages
export const MIL_ORDER = [].concat(G.MIL_GRADES.enlisted, G.MIL_GRADES.warrant, G.MIL_GRADES.officer, G.MIL_GRADES.priorEnlisted);
export const milSlug = (g) => g.toLowerCase();
export const yosLabel = (c) => (c === 0 ? "Under 2" : `Over ${c}`);

// Structured data: a breadcrumb trail for search engines. items = [[name, path], ...]
export function breadcrumbLd(site, items) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: new URL(path, site).toString() })),
  };
}

// ---------------------------------------------------------------- BAH pages
import { readFileSync as _read } from "node:fs";
import { join as _join } from "node:path";
const BAHD = globalThis.GOVPAY_DATA.bah;
export const BAH_YEAR = Math.max(...Object.keys(BAHD.years).map(Number));
export const BAH_SOURCE = { label: "DTMO BAH rate files", url: "https://www.travel.dod.mil/Allowances/Basic-Allowance-for-Housing/" };
// read from the repo's data folder; builds and tests run from site/ (bundling moves this file, so no import.meta.url)
const BAH_FULL = JSON.parse(_read(_join(process.cwd(), "..", `data/bah/${BAH_YEAR}.json`), "utf8"));
// Every housing area: { code, name, slug, state, rural, zips[], counties[] }
let _areas = null;
export function bahAreas() {
  if (_areas) return _areas;
  const zipsBy = {};
  Object.entries(BAH_FULL.zips).forEach(([z, m]) => (zipsBy[m] = zipsBy[m] || []).push(z));
  const countiesBy = {};
  G.locations().filter((l) => l.kind === "county").forEach((l) => (countiesBy[l.bahMha] = countiesBy[l.bahMha] || []).push(l));
  _areas = Object.entries(BAHD.names).map(([code, name]) => {
    const rural = code.startsWith("ZZ");
    const st = rural ? null : (name.match(/,\s*([A-Z]{2})$/) || [])[1] || code.slice(0, 2);
    return { code, name, rural, state: st, slug: slugify(rural ? `rural-${code.slice(2)}` : name), zips: (zipsBy[code] || []).sort(), counties: countiesBy[code] || [] };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return _areas;
}
export function bahRow(code, year = BAH_YEAR) {
  const y = BAHD.years[year]; if (!y || !y.rates[code]) return null;
  const r = y.rates[code], n = BAHD.grades.length;
  return BAHD.grades.map((g, i) => ({ grade: g, with: r[i], without: r[n + i] }));
}

// ---------------------------------------------------------------- job series pages
const SER = globalThis.GOVPAY_DATA.series;
// Active white-collar (General Schedule) series get a page; trades (2500+) are listed on the hub.
export function jobSeries() {
  return Object.entries(SER.names).filter(([c]) => SER.retired.indexOf(c) < 0).map(([code, name]) => ({
    code, name, family: code.slice(0, 2) + "00", trade: +code >= 2500, leo: SER.leo.indexOf(code) >= 0, slug: code,
  }));
}
export const seriesFamilies = SER.families;
