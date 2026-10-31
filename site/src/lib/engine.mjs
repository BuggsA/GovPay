// Build-time access to the same engine the browser uses. The shared files are plain
// scripts that attach GovPay, GovPayTax and the data to globalThis.
import "../../../shared/data/payorder.js";
import "../../../shared/data/perdiem.js";
import "../../../shared/govpay.js";
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
export function calcLink(profile, areaName) {
  const loc = areaName ? G.locationsInArea(areaName)[0] : null;
  const p = [`y=${YEAR}`, loc ? `l=${loc.id}` : "", `s=${profile.system}`];
  if (profile.system === "MIL") p.push(`g=${profile.mgrade}`, `yos=${profile.yos}`, "d=1");
  else p.push(`g=${profile.grade}`, `st=${profile.step || 1}`);
  return "/#" + p.filter(Boolean).join("&");
}
