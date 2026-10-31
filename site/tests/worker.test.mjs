// The analytics endpoint keeps only known events and fields, and drops anything that could identify someone.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { clean, EVENTS } from "../worker.js";

test("clean() keeps known events with valid fields", () => {
  const p = clean({ e: "profile", s: "abc123xyz0", sys: "GS", band: "GS 12-13", area: "san-diego-ca", st: "CA", deps: "" });
  assert.deepEqual(p.blobs, ["profile", "abc123xyz0", "GS", "GS 12-13", "san-diego-ca", "CA", ""]);
  assert.deepEqual(p.indexes, ["profile"]);
  assert.ok(clean({ e: "view", path: "/civilian/gs/12/san-diego-ca" }));
});

test("clean() drops unknown events, extra fields and anything that looks like personal data", () => {
  assert.equal(clean({ e: "email", value: "a@b.com" }), null);                         // unknown event
  assert.equal(clean({ e: "tool", tool: "x@y.com" }), null);                           // @ not allowed
  assert.equal(clean({ e: "view", path: "/jobs?q=john smith" }), null);                 // query strings not allowed
  assert.equal(clean({ e: "view", path: "" }), null);
  assert.equal(clean({ e: "tool", tool: "a".repeat(41) }), null);                      // too long
  const p = clean({ e: "tool", tool: "allowances", name: "Jane Doe", salary: 98000 });  // extra fields ignored
  assert.deepEqual(p.blobs, ["tool", "", "allowances"]);
  assert.equal(clean({ e: "tool", s: "not a session!", tool: "travel" }).blobs[1], "");  // bad visit id dropped
});

test("fetch(): /api/e writes only clean events; GPC and bots are ignored; everything else is an asset", async () => {
  const written = [];
  const env = { EVENTS: { writeDataPoint: (p) => written.push(p) }, ASSETS: { fetch: () => new Response("asset") } };
  const post = (body, headers = {}) => worker.fetch(new Request("https://paybook.loopi.sh/api/e", { method: "POST", body: JSON.stringify(body), headers: Object.assign({ "user-agent": "Mozilla/5.0" }, headers) }), env);
  let r = await post([{ e: "tool", tool: "travel" }, { e: "bogus" }]);
  assert.equal(r.status, 204); assert.equal(r.headers.get("x-kept"), "1"); assert.equal(written.length, 1);
  await post([{ e: "tool", tool: "bah" }], { "sec-gpc": "1" });
  await post([{ e: "tool", tool: "bah" }], { "user-agent": "Googlebot/2.1" });
  assert.equal(written.length, 1);
  assert.equal((await worker.fetch(new Request("https://paybook.loopi.sh/api/e"), env)).status, 405);
  assert.equal(await (await worker.fetch(new Request("https://paybook.loopi.sh/jobs"), env)).text(), "asset");
  assert.ok(Object.keys(EVENTS).length >= 6);
});
