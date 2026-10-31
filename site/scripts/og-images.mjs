// After `astro build`: draw a link-preview PNG for every page into dist/og/.
// Cards come from src/lib/cards.mjs. Each image is cached by a hash of its card plus the renderer's
// source, so a rebuild only draws cards whose numbers or design changed. Runs on 4 worker threads.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, access } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(site, "node_modules/.cache/paybook-og");

if (isMainThread) {
  const { allCards, ogPath } = await import("../src/lib/cards.mjs");
  const renderer = await readFile(join(site, "src/lib/og.mjs"), "utf8");
  const jobs = [...allCards()].map(([path, card]) => {
    const key = createHash("sha1").update(renderer).update(JSON.stringify(card)).digest("hex");
    return { card, key, out: join(site, "dist", ogPath(path)), cached: join(CACHE, key + ".png") };
  });
  await mkdir(CACHE, { recursive: true });
  const exists = (p) => access(p).then(() => true, () => false);
  const todo = [];
  for (const j of jobs) {
    await mkdir(dirname(j.out), { recursive: true });
    if (await exists(j.cached)) await copyFile(j.cached, j.out); else todo.push(j);
  }
  const t0 = Date.now();
  const n = Math.min(4, availableParallelism(), todo.length);
  await Promise.all(Array.from({ length: n }, (_, i) => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: todo.filter((_, k) => k % n === i) });
    w.on("error", reject); w.on("exit", (code) => (code ? reject(new Error("og worker exited " + code)) : resolve()));
  })));
  console.log(`og images: ${jobs.length} pages, ${todo.length} drawn in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${jobs.length - todo.length} from cache`);
} else {
  const { renderCard } = await import("../src/lib/og.mjs");
  for (const j of workerData) {
    const png = await renderCard(j.card);
    await writeFile(j.cached, png);
    await writeFile(j.out, png);
  }
  parentPort && parentPort.close();
}
