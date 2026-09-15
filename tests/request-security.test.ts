import assert from "node:assert/strict";
import test from "node:test";
import {
  HttpRequestError,
  assertSameOriginRequest,
  createClientRateLimitKey,
  readJsonObject,
  requireInteger,
} from "../app/request-security.ts";

test("API requests enforce same-origin browser calls", () => {
  assert.doesNotThrow(() => assertSameOriginRequest(new Request(
    "https://tripquest.example/api/generate",
    { headers: { Origin: "https://tripquest.example", "Sec-Fetch-Site": "same-origin" } },
  )));
  assert.throws(
    () => assertSameOriginRequest(new Request(
      "https://tripquest.example/api/generate",
      { headers: { Origin: "https://attacker.example" } },
    )),
    (error: unknown) => error instanceof HttpRequestError && error.status === 403,
  );
  assert.throws(
    () => assertSameOriginRequest(new Request(
      "https://tripquest.example/api/generate",
      { headers: { "Sec-Fetch-Site": "cross-site" } },
    )),
    (error: unknown) => error instanceof HttpRequestError && error.status === 403,
  );
});

test("JSON request parsing rejects malformed and oversized bodies", async () => {
  const valid = new Request("https://tripquest.example/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ destination: "Singapore" }),
  });
  assert.deepEqual(await readJsonObject(valid), { destination: "Singapore" });

  await assert.rejects(
    () => readJsonObject(new Request("https://tripquest.example/api/generate", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    })),
    (error: unknown) => error instanceof HttpRequestError && error.status === 415,
  );
  await assert.rejects(
    () => readJsonObject(new Request("https://tripquest.example/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(100) }),
    }), 32),
    (error: unknown) => error instanceof HttpRequestError && error.status === 413,
  );
  await assert.rejects(
    () => readJsonObject(new Request("https://tripquest.example/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "1000" },
      body: "{}",
    }), 32),
    (error: unknown) => error instanceof HttpRequestError && error.status === 413,
  );
  await assert.rejects(
    () => readJsonObject(new Request("https://tripquest.example/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: new Uint8Array([
        0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d,
      ]),
    })),
    (error: unknown) => error instanceof HttpRequestError && error.status === 400,
  );
});

test("rate-limit identities use trusted platform data and private hashing", async () => {
  const trusted = new Request("https://tripquest.example/api/generate", {
    headers: {
      "cf-connecting-ip": "203.0.113.9",
      "x-forwarded-for": "198.51.100.1",
    },
  });
  const spoofChanged = new Request("https://tripquest.example/api/generate", {
    headers: {
      "cf-connecting-ip": "203.0.113.9",
      "x-forwarded-for": "198.51.100.200",
    },
  });
  const otherClient = new Request("https://tripquest.example/api/generate", {
    headers: { "cf-connecting-ip": "203.0.113.10" },
  });
  const first = await createClientRateLimitKey(trusted, "test-secret");
  assert.equal(first, await createClientRateLimitKey(spoofChanged, "test-secret"));
  assert.notEqual(first, await createClientRateLimitKey(otherClient, "test-secret"));
  assert.doesNotMatch(first, /203\.0\.113/);
});

test("integer inputs are strict and bounded", () => {
  assert.equal(requireInteger(7, 3, 14, "Age"), 7);
  assert.equal(requireInteger("5", 1, 14, "Trip length"), 5);
  assert.throws(() => requireInteger(2.5, 1, 14, "Trip length"), /between 1 and 14/);
  assert.throws(() => requireInteger(99, 3, 14, "Age"), /between 3 and 14/);
});
