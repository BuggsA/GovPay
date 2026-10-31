// Read Paybook's anonymous usage counts from Workers Analytics Engine (written by worker.js).
//
//   CF_ACCOUNT_ID=... CF_API_TOKEN=... node scripts/analytics-report.mjs [days=30] [--save]
//
// The token needs the "Account Analytics: Read" permission. --save writes this report's totals to
// ~/paybook-analytics/<YYYY-MM>.json (outside the repo): Analytics Engine keeps raw events for three months,
// so monthly totals are how you keep history. Totals hold no individual visits.
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const account = process.env.CF_ACCOUNT_ID, token = process.env.CF_API_TOKEN;
if (!account || !token) {
  console.error("Set CF_ACCOUNT_ID and CF_API_TOKEN (permission: Account Analytics Read).");
  process.exit(1);
}
const days = Math.max(1, Math.min(92, parseInt(process.argv.find((a) => /^\d+$/.test(a)) || "30", 10)));
const save = process.argv.includes("--save");
const DATASET = "paybook_events";
// blob1 = event, blob2 = visit id, blob3.. = the event's fields in worker.js EVENTS order
const since = `timestamp > NOW() - INTERVAL '${days}' DAY`;
const count = "SUM(_sample_interval)";

async function sql(q) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: q + " FORMAT JSON",
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).data;
}
async function visits(where) {
  try { return (await sql(`SELECT COUNT(DISTINCT blob2) AS n FROM ${DATASET} WHERE ${since} AND blob2 != '' ${where}`))[0].n; }
  catch { return null; }   // distinct counts unavailable: events still count
}

const report = { from: `last ${days} days`, generated: new Date().toISOString(), sections: {} };
const sections = [
  ["Events", "blob1", ""],
  ["Pay system and grade band", "blob3, blob4", "AND blob1 = 'profile'"],
  ["Locality area (profiles)", "blob5", "AND blob1 = 'profile' AND blob5 != ''"],
  ["State (profiles)", "blob6", "AND blob1 = 'profile' AND blob6 != ''"],
  ["Military with dependents", "blob7", "AND blob1 = 'profile' AND blob3 = 'MIL'"],
  ["Tools used", "blob3", "AND blob1 = 'tool'"],
  ["Job postings (series family, grade band)", "blob4, blob5", "AND blob1 = 'posting'"],
  ["Places picked (kind, state)", "blob3, blob4", "AND blob1 = 'place'"],
  ["Take-home (filing, tax state)", "blob3, blob4", "AND blob1 = 'takehome'"],
  ["Top pages", "blob3", "AND blob1 = 'view'"],
];
report.visits = await visits("");
console.log(`Paybook usage, ${report.from}${report.visits != null ? ` · ${report.visits} visits` : ""}\n`);
for (const [title, cols, where] of sections) {
  const rows = await sql(`SELECT ${cols}, ${count} AS n FROM ${DATASET} WHERE ${since} ${where} GROUP BY ${cols} ORDER BY n DESC LIMIT 25`);
  report.sections[title] = rows;
  console.log(title);
  rows.forEach((r) => console.log("  " + String(Math.round(r.n)).padStart(7) + "  " + cols.split(", ").map((c) => r[c] || "—").join(" · ")));
  console.log("");
}
if (save) {
  const dir = join(homedir(), "paybook-analytics");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${new Date().toISOString().slice(0, 7)}.json`);
  await writeFile(file, JSON.stringify(report, null, 1) + "\n");
  console.log("Saved totals to " + file);
}
