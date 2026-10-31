// Link preview images (1200 x 630 PNG) drawn at build time with satori + resvg, in Paybook's
// paper / ink / highlighter look. Fonts are the site's own, from @fontsource (satori can't read woff2).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const require = createRequire(import.meta.url);
const font = (pkg, file) => readFileSync(require.resolve(`@fontsource/${pkg}/files/${file}`));
const FONTS = [
  { name: "Familjen Grotesk", data: font("familjen-grotesk", "familjen-grotesk-latin-700-normal.woff"), weight: 700, style: "normal" },
  { name: "Hanken Grotesk", data: font("hanken-grotesk", "hanken-grotesk-latin-400-normal.woff"), weight: 400, style: "normal" },
  { name: "Hanken Grotesk", data: font("hanken-grotesk", "hanken-grotesk-latin-600-normal.woff"), weight: 600, style: "normal" },
  { name: "Spline Sans Mono", data: font("spline-sans-mono", "spline-sans-mono-latin-600-normal.woff"), weight: 600, style: "normal" },
];
const C = { paper: "#f4f1ea", card: "#fffdf7", ink: "#1b1a17", ink2: "#5d5a52", rule: "#d6cfc0", hi: "#ffd84d", ok: "#1f7a52" };

// Tiny element helper so this file needs no JSX: h("div", { style }, ...children)
const h = (type, props, ...children) => ({ type, props: { ...props, children: children.flat().filter((c) => c != null && c !== false) } });

// card: { kicker, title, number, sub, stamp }  (number is optional; without it the title is the headline)
export async function renderCard(card) {
  const big = card.number || "";
  const size = big.length > 22 ? 76 : big.length > 16 ? 92 : 112;
  const tree = h("div", { style: { width: 1200, height: 630, boxSizing: "border-box", display: "flex", flexDirection: "column", background: C.paper, padding: "44px 64px 52px", fontFamily: "Hanken Grotesk", color: C.ink } },
    h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 } },
      h("div", { style: { display: "flex", alignItems: "center", fontFamily: "Familjen Grotesk", fontSize: 40 } },
        h("div", { style: { width: 44, height: 44, border: `4px solid ${C.ink}`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 14 } },
          h("div", { style: { width: 26, height: 10, background: C.hi } })),
        "paybook"),
      h("div", { style: { fontFamily: "Spline Sans Mono", fontSize: 20, color: C.ink2, letterSpacing: 2 } }, "NOT A GOVERNMENT SITE")),
    h("div", { style: { flex: 1, boxSizing: "border-box", display: "flex", flexDirection: "column", background: C.card, border: `2px solid ${C.ink}`, borderRadius: 6, padding: "36px 48px 44px" } },
      h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "Spline Sans Mono", fontSize: 22, color: C.ink2, letterSpacing: 2, borderBottom: `2px dashed ${C.rule}`, paddingBottom: 18 } },
        h("span", {}, (card.kicker || "").toUpperCase()),
        card.stamp ? h("span", { style: { color: C.ok, border: `2px solid ${C.ok}`, padding: "4px 12px", borderRadius: 3 } }, card.stamp.toUpperCase()) : null),
      h("div", { style: { display: "flex", flex: 1 } }),
      h("div", { style: { fontSize: big ? 42 : 68, fontWeight: 600, lineHeight: 1.15, fontFamily: big ? "Hanken Grotesk" : "Familjen Grotesk" } }, card.title),
      big ? h("div", { style: { display: "flex", marginTop: 18 } },
        h("div", { style: { fontFamily: "Familjen Grotesk", fontSize: size, background: C.hi, padding: "0 16px", lineHeight: 1.1, letterSpacing: -2 } }, big)) : null,
      card.sub ? h("div", { style: { fontSize: 30, color: C.ink2, marginTop: 22 } }, card.sub) : null),
  );
  const svg = await satori(tree, { width: 1200, height: 630, fonts: FONTS });
  return new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
}
