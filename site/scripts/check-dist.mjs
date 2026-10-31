// After `npm run build`: every page is under the size budget, has a title, description,
// canonical tag and a drawn preview image, and every internal link points at a page or file that exists.
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const BUDGET = 50 * 1024;
const files = [];
async function walk(d) { for (const e of await readdir(d, { withFileTypes: true })) e.isDirectory() ? await walk(join(d, e.name)) : files.push(join(d, e.name)); }
await walk(dist);
const have = new Set(files.map((f) => "/" + relative(dist, f).replace(/\\/g, "/")));
const exists = (p) => have.has(p) || have.has(p + ".html") || have.has(p.replace(/\/$/, "") + "/index.html") || p === "/";
const problems = [];
let pages = 0, biggest = ["", 0];
for (const f of files.filter((x) => x.endsWith(".html"))) {
  pages++;
  const page = "/" + relative(dist, f), html = await readFile(f, "utf8"), size = (await stat(f)).size;
  if (size > biggest[1]) biggest = [page, size];
  if (size > BUDGET) problems.push(`${page}: ${(size / 1024).toFixed(1)} KB is over the ${BUDGET / 1024} KB budget`);
  const noindex = html.includes('name="robots" content="noindex"');
  for (const tag of ["<title>", 'name="description"'].concat(noindex ? [] : ['rel="canonical"'])) if (!html.includes(tag)) problems.push(`${page}: missing ${tag}`);
  const desc = (html.match(/name="description" content="([^"]*)"/) || [])[1] || "";
  const descLen = desc.replace(/&amp;/g, "&").replace(/&#39;|&quot;|&lt;|&gt;/g, "x").length;
  if (descLen > 161) problems.push(`${page}: description is ${descLen} characters (search results show about 160)`);
  for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) if (!exists(decodeURI(href))) problems.push(`${page}: broken link ${href}`);
  const og = html.match(/property="og:image" content="https?:\/\/[^/]+(\/[^"]+)"/);
  if (!og) problems.push(`${page}: missing og:image`);
  else if (!exists(og[1])) problems.push(`${page}: preview image ${og[1]} wasn't drawn`);
}
console.log(`${pages} pages checked; largest ${biggest[0]} at ${(biggest[1] / 1024).toFixed(1)} KB`);
if (problems.length) { console.error([...new Set(problems)].slice(0, 40).join("\n")); console.error(`${problems.length} problems`); process.exit(1); }
