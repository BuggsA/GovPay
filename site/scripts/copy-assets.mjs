// Copy the single-source engine, data, design files and calculator into public/
// so the built site serves exactly the code that the repo maintains once.
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(site, "..");
const pub = join(site, "public");
const copies = [
  ["shared/govpay.js", "shared/govpay.js"], ["shared/parse.js", "shared/parse.js"], ["shared/tax.js", "shared/tax.js"],
  ["shared/data", "shared/data"], ["sites/ledger/ui", "ui"], ["sites/ledger/app.js", "app.js"], ["sites/ledger/styles.css", "styles.css"],
];
await rm(join(pub, "shared"), { recursive: true, force: true });
await rm(join(pub, "ui"), { recursive: true, force: true });
for (const [from, to] of copies) {
  await mkdir(dirname(join(pub, to)), { recursive: true });
  await cp(join(repo, from), join(pub, to), { recursive: true });
}
console.log(`copied ${copies.length} sources into public/`);
