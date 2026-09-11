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
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>TripQuest \| Travel Booklets for Kids<\/title>/i);
  assert.match(html, /Build a trip they can hold onto/i);
  assert.match(html, /Create free preview/i);
  assert.match(html, /Singapore/i);
  assert.match(html, /Merlion Face Finder/i);
  assert.match(html, /US\$5\.99/i);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/i);
});
