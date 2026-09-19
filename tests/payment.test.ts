import assert from "node:assert/strict";
import test from "node:test";
import { verifyStripeSignature } from "../app/payment.ts";

test("Stripe webhook signatures accept a fresh HMAC and reject stale or altered payloads", async () => {
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  const secret = "whsec_test_secret";
  const now = 1_700_000_000_000;
  const timestamp = String(now / 1_000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Array.from(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const header = `t=${timestamp},v1=${signature}`;

  assert.equal(await verifyStripeSignature(payload, header, secret, now), true);
  assert.equal(await verifyStripeSignature(`${payload}.`, header, secret, now), false);
  assert.equal(await verifyStripeSignature(payload, header, secret, now + 301_000), false);
});

