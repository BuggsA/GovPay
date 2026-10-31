// The browser scripts aren't imported by the other tests, so check they at least parse.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const files = ["sites/ledger/app.js", "sites/ledger/ui/composite.js", "shared/govpay.js", "shared/parse.js", "shared/tax.js", "shared/analytics.js"];

test("browser scripts parse", () => {
  for (const f of files) assert.doesNotThrow(() => execFileSync(process.execPath, ["--check", repo + f], { stdio: "pipe" }), f);
});

test("the app's initial state keeps every field (a stray // comment once swallowed half a line)", async () => {
  const src = (await import("node:fs")).readFileSync(repo + "sites/ledger/app.js", "utf8");
  const block = src.slice(src.indexOf("const state = {"), src.indexOf("};", src.indexOf("const state = {")));
  for (const k of ["tripStart", "tripNights", "tripDest", "tripQuery", "tax", "thOpen"]) {
    const line = block.split("\n").find((l) => new RegExp("\\b" + k + ":").test(l));
    assert.ok(line && line.indexOf("//") < 0 || (line && line.indexOf(k + ":") < line.indexOf("//")), k);
  }
});
