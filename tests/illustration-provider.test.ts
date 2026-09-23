import assert from "node:assert/strict";
import test from "node:test";
import { addCoverIllustration, sniffImageContentType } from "../app/illustration-ai.ts";

function jpegBase64() {
  // Minimal magic-byte-only fake JPEG: 0xFF 0xD8 ... — enough for
  // sniffImageContentType, not a real decodable image.
  return btoa(String.fromCharCode(0xff, 0xd8, 1, 2, 3));
}

test("sniffImageContentType detects JPEG and PNG from magic bytes", () => {
  assert.equal(sniffImageContentType(new Uint8Array([0xff, 0xd8, 0, 0])), "image/jpeg");
  assert.equal(sniffImageContentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), "image/png");
});

test("Cloudflare Workers AI is used over OpenAI when both are configured", async () => {
  const calls: string[] = [];
  const stored: Array<{ key: string; contentType?: string; model?: unknown }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return Response.json({ result: { image: jpegBase64() } });
  };
  try {
    const path = await addCoverIllustration({
      OPENAI_API_KEY: "test-openai-key",
      CLOUDFLARE_ACCOUNT_ID: "acct-123",
      CLOUDFLARE_API_TOKEN: "cf-token",
      BOOKLET_FILES: {
        async get() {
          return null;
        },
        async put(key, _value, options) {
          stored.push({ key, contentType: options?.httpMetadata?.contentType, model: options?.customMetadata?.model });
          return undefined;
        },
        async delete() {
          return undefined;
        },
      },
    }, { destination: "Lisbon" });

    assert.ok(path);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/acct-123\/ai\/run\//);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].contentType, "image/jpeg");
    assert.equal(stored[0].model, "@cf/black-forest-labs/flux-1-schnell");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IMAGE_PROVIDER=openai forces OpenAI even when Cloudflare credentials are present", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return Response.json({ data: [{ b64_json: btoa("fake-png-bytes") }] });
  };
  try {
    const path = await addCoverIllustration({
      IMAGE_PROVIDER: "openai",
      OPENAI_API_KEY: "test-openai-key",
      CLOUDFLARE_ACCOUNT_ID: "acct-123",
      CLOUDFLARE_API_TOKEN: "cf-token",
      BOOKLET_FILES: {
        async get() {
          return null;
        },
        async put() {
          return undefined;
        },
        async delete() {
          return undefined;
        },
      },
    }, { destination: "Lisbon" });

    assert.ok(path);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^https:\/\/api\.openai\.com\//);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cover illustration is skipped (not thrown) when neither provider is configured", async () => {
  const path = await addCoverIllustration({
    BOOKLET_FILES: {
      async get() {
        return null;
      },
      async put() {
        return undefined;
      },
      async delete() {
        return undefined;
      },
    },
  }, { destination: "Lisbon" });
  assert.equal(path, undefined);
});

test("a Cloudflare error response is caught and falls back to no cover art", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("rate limited", { status: 429 });
  try {
    const path = await addCoverIllustration({
      CLOUDFLARE_ACCOUNT_ID: "acct-123",
      CLOUDFLARE_API_TOKEN: "cf-token",
      BOOKLET_FILES: {
        async get() {
          return null;
        },
        async put() {
          return undefined;
        },
        async delete() {
          return undefined;
        },
      },
    }, { destination: "Lisbon" });
    assert.equal(path, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
