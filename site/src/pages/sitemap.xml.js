// sitemap.xml listing every pre-built page.
import { G } from "../lib/engine.mjs";

export function GET({ site }) {
  const areas = G.localityAreas(G.CURRENT_YEAR);
  const paths = ["/", "/civilian/gs", "/military/pay-chart"];
  areas.forEach((a) => {
    paths.push(`/civilian/gs/table/${a.slug}`);
    for (let g = 1; g <= 15; g++) paths.push(`/civilian/gs/${g}/${a.slug}`);
  });
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    paths.map((p) => `  <url><loc>${new URL(p, site).toString()}</loc></url>`).join("\n") + `\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml" } });
}
