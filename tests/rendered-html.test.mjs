import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the TripQuest generator", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-security-policy") || "", /object-src 'none'/);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>TripQuest Kids<\/title>/i);
  assert.match(html, /Build a trip they can hold onto/i);
  assert.match(html, /Create custom booklet/i);
  assert.match(html, /Customize daily plans/i);
  assert.match(html, /Child&#x27;s age|Child's age/i);
  assert.match(html, /Singapore/i);
  // Before any real booklet is generated, the default Singapore/age-5/5-day
  // trip's outline is rendered live from buildBooklet's deterministic
  // offline generator (see app/page.tsx's generatedDays) rather than a
  // hardcoded static sample, so this checks real, current day-1 content.
  assert.match(html, /Hello, Destination!/i);
  // The PDF is free; the mailed kit is the one paid product.
  assert.match(html, /Download free PDF/i);
  assert.match(html, /Mail me the explorer kit · (?:<!-- -->)?S\$19\.90/i);
  assert.doesNotMatch(html, /S\$0\.99|Unlock download/i);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});
