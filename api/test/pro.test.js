import test from "node:test";
import assert from "node:assert/strict";
import { newCode, normalizeCode, isPro, verify, handle } from "../src/pro.js";

test("codes round-trip through normalizeCode, however they are typed", () => {
  const c = newCode();
  assert.match(c, /^TWIN-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(normalizeCode(c.toLowerCase().replace(/-/g, " ")), c);
  assert.equal(normalizeCode(c.slice(5)), c);
  assert.equal(normalizeCode("TWIN-0000-0000-0000"), null);
  assert.equal(normalizeCode("nope"), null);
});

test("Pro lasts through past_due and to the end of a cancelled period", () => {
  const now = Date.parse("2026-11-10T00:00:00Z");
  assert.ok(isPro({ status: "active" }, now));
  assert.ok(isPro({ status: "past_due" }, now));
  assert.ok(isPro({ status: "cancelled", period_end: "2026-11-20T00:00:00Z" }, now));
  assert.ok(!isPro({ status: "cancelled", period_end: "2026-11-01T00:00:00Z" }, now));
  assert.ok(!isPro({ status: "on_hold" }, now));
  assert.ok(!isPro(null, now));
});

test("webhook signatures verify only with the current mode's secret", async () => {
  const secret = "whsec_" + Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
  const body = '{"type":"subscription.active"}', id = "msg_1", ts = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey("raw", Buffer.from("0123456789abcdef0123456789abcdef"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = "v1," + Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`))).toString("base64");
  assert.ok(await verify({ DODO_WEBHOOK_SECRET: secret }, body, id, ts, sig));
  assert.ok(!await verify({ DODO_MODE: "live", DODO_WEBHOOK_SECRET: secret }, body, id, ts, sig));
  assert.ok(!await verify({ DODO_WEBHOOK_SECRET: secret }, body + " ", id, ts, sig));
  assert.ok(!await verify({ DODO_WEBHOOK_SECRET: secret }, body, id, String(Number(ts) - 600), sig));
});

test("events for other products or apps are ignored", async () => {
  const env = { DODO_PRODUCT_TEST: "pdt_twinsub", DB: null };
  assert.equal(await handle(env, { type: "payment.succeeded", data: {} }), "ignored");
  assert.equal(await handle(env, { type: "subscription.active", data: { subscription_id: "s", product_id: "pdt_other", metadata: { app: "twinsub" } } }), "ignored");
  assert.equal(await handle(env, { type: "subscription.active", data: { subscription_id: "s", product_id: "pdt_twinsub", metadata: {} } }), "ignored");
});

test("only the one-time Lifetime checkout counts as a Lifetime payment", async () => {
  const env = { DODO_LIFETIME_TEST: "pdt_life", DB: null };
  const meta = { app: "twinsub", plan: "lifetime", install: "x".repeat(20), code: newCode() };
  // A Pro renewal is a payment too, and carries a subscription id.
  assert.equal(await handle(env, { type: "payment.succeeded", data: { payment_id: "p", subscription_id: "s", metadata: meta } }), "ignored");
  assert.equal(await handle(env, { type: "payment.succeeded", data: { payment_id: "p", metadata: { ...meta, plan: "pro" } } }), "ignored");
  assert.equal(await handle(env, { type: "payment.succeeded", data: { payment_id: "p", metadata: meta, product_cart: [{ product_id: "pdt_other" }] } }), "ignored");
  assert.equal(await handle(env, { type: "payment.succeeded", data: { payment_id: "p", metadata: { ...meta, code: "nope" } } }), "ignored");
  const runs = [];
  const db = { prepare: sql => ({ bind: (...a) => ({ run: async () => { runs.push([sql.trim().split(/\s+/).slice(0, 3).join(" "), a]); return { meta: { changes: 1 } }; } }) }) };
  assert.equal(await handle({ ...env, DB: db }, { type: "payment.succeeded", data: { payment_id: "p", metadata: meta, product_cart: [{ product_id: "pdt_life" }], customer: { email: "a@b.c" } } }), "stored");
  assert.deepEqual(runs.map(r => r[0]), ["INSERT INTO licenses", "INSERT INTO license_installs"]);
  assert.equal(await handle({ ...env, DB: db }, { type: "refund.succeeded", data: { payment_id: "p" } }), "refunded");
});
