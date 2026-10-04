import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { normalizeFamilyChildren } from "../app/lib/family.ts";
import { libraryPageFrom, listLibraryEditions, readLibraryEdition } from "../app/lib/library.ts";
import type { NormalizedPdfRequest } from "../app/lib/pdf/request.ts";
import { prepareFreePdf, renderEditionPdf, type RuntimeEnvironment } from "../app/lib/pdf/serve.ts";
import {
  type BookletCacheIdentity,
  createBookletCacheKey,
  readStoredBookletReference,
  writeStoredBooklet,
} from "../app/lib/storage/booklet-storage.ts";
import { sampleGeneratedBooklet } from "./fixtures/generated-booklet.ts";
import { createMemoryArtifacts, createMigratedDatabase, publicAssets } from "./helpers/storage.ts";

const MODEL = "claude-test";

// A visitor's PDF request for the sample booklet, as normalizePdfRequest
// builds it (app/lib/pdf/request.ts) for a trip with no named family.
function pdfRequestFor(booklet = sampleGeneratedBooklet()): NormalizedPdfRequest {
  const identity: BookletCacheIdentity = {
    destination: booklet.destination,
    age: booklet.age,
    days: booklet.days,
    itinerary: booklet.itinerary,
    researchModel: MODEL,
    composerModel: MODEL,
    familyContext: "",
    familySize: 0,
    editionContext: "",
  };
  return {
    destination: booklet.destination,
    age: booklet.age,
    days: booklet.days,
    itinerary: booklet.itinerary,
    family: [],
    events: [],
    identity,
  };
}

async function storedEdition(options: { expiresAt?: number } = {}) {
  const database = createMigratedDatabase();
  const { storage } = createMemoryArtifacts();
  const booklet = sampleGeneratedBooklet();
  const input = pdfRequestFor(booklet);
  const cacheKey = await createBookletCacheKey(input.identity);
  await writeStoredBooklet(database, storage, {
    cacheKey,
    booklet,
    researchModel: MODEL,
    composerModel: MODEL,
    expiresAt: options.expiresAt ?? Date.now() + 60_000,
  });
  const reference = await readStoredBookletReference(database, storage, cacheKey, input.identity, 0);
  assert.ok(reference, "the sample booklet round-trips through storage");
  const runtime: RuntimeEnvironment = { DB: database, BOOKLET_FILES: storage, ASSETS: publicAssets };
  return { database, storage, runtime, input, cacheKey, fingerprint: reference.fingerprint };
}

const visitor = () => new Request("https://tripquest.test/api/pdf", { method: "POST" });

test("the free PDF needs no purchase when the request names the stored edition", async () => {
  const { runtime, input, fingerprint } = await storedEdition();

  const stickers = await prepareFreePdf(visitor(), runtime, input, { editionFingerprint: fingerprint, kind: "stickers" });
  assert.equal(stickers.status, 200);
  assert.equal(stickers.headers.get("content-type"), "application/pdf");
  assert.equal(stickers.headers.get("x-tripquest-edition"), fingerprint);
  assert.ok((await PDFDocument.load(await stickers.arrayBuffer())).getPageCount() >= 1);

  const booklet = await prepareFreePdf(visitor(), runtime, input, { editionFingerprint: fingerprint.toUpperCase() });
  assert.equal(booklet.status, 200);
  assert.equal(booklet.headers.get("x-tripquest-pdf-cache"), "generated");
  const bookletBytes = await booklet.arrayBuffer();
  assert.ok((await PDFDocument.load(bookletBytes)).getPageCount() > 4);

  // The next visitor gets the same file from the durable PDF cache.
  const again = await prepareFreePdf(visitor(), runtime, input, { editionFingerprint: fingerprint });
  assert.equal(again.headers.get("x-tripquest-pdf-cache"), "durable");
  assert.equal((await again.arrayBuffer()).byteLength, bookletBytes.byteLength);

  const parentGuide = await prepareFreePdf(visitor(), runtime, input, { editionFingerprint: fingerprint, kind: "parent-guide" });
  assert.equal(parentGuide.status, 402, "the parent answer guide is not part of the free child PDF");
});

test("a default-named single child still shares the durable PDF cache", async () => {
  const { runtime, input, fingerprint } = await storedEdition();
  const defaultChild = { ...input, family: normalizeFamilyChildren([{ name: "Your child", age: 7 }]) };
  const first = await prepareFreePdf(visitor(), runtime, defaultChild, { editionFingerprint: fingerprint });
  assert.equal(first.headers.get("x-tripquest-pdf-cache"), "generated");
  const second = await prepareFreePdf(visitor(), runtime, defaultChild, { editionFingerprint: fingerprint });
  assert.equal(second.headers.get("x-tripquest-pdf-cache"), "durable");
  const named = await prepareFreePdf(visitor(), runtime, { ...input, family: normalizeFamilyChildren([{ name: "Mia", age: 7 }]) }, { editionFingerprint: fingerprint });
  assert.equal(named.headers.get("x-tripquest-pdf-cache"), "family-generated", "a real name is rendered per request");
});

test("the free PDF is refused unless the edition matches a stored one", async () => {
  const { runtime, input, fingerprint } = await storedEdition();

  const missing = await prepareFreePdf(visitor(), runtime, input, { kind: "stickers" });
  assert.equal(missing.status, 409, "a fingerprint is required");

  const other = await prepareFreePdf(visitor(), runtime, input, { editionFingerprint: "a".repeat(64), kind: "stickers" });
  assert.equal(other.status, 409, "a different edition is not rendered");

  // A trip nobody generated: nothing is generated on demand.
  const unknownTrip = pdfRequestFor({ ...sampleGeneratedBooklet(), destination: "Lisbon" });
  const notCreated = await prepareFreePdf(visitor(), runtime, unknownTrip, { editionFingerprint: fingerprint, kind: "stickers" });
  assert.equal(notCreated.status, 404);

  const noStorage = await prepareFreePdf(visitor(), {}, input, { editionFingerprint: fingerprint });
  assert.equal(noStorage.status, 503);
});

test("an expired edition is no longer free to download", async () => {
  const { runtime, input, fingerprint } = await storedEdition({ expiresAt: Date.now() - 1 });
  const response = await prepareFreePdf(visitor(), runtime, input, { editionFingerprint: fingerprint, kind: "stickers" });
  assert.equal(response.status, 404);
});

test("the library lists every stored edition newest first, with its family", async () => {
  const database = createMigratedDatabase();
  const { storage } = createMemoryArtifacts();
  const family = normalizeFamilyChildren([{ name: "Mia", age: 8 }, { name: "Leo", age: 5 }]);
  const trips = [
    { destination: "Ipoh", generatedAt: "2026-09-01T08:00:00.000Z", family: undefined },
    { destination: "Lisbon", generatedAt: "2026-09-03T08:00:00.000Z", family },
    { destination: "Barcelona", generatedAt: "2026-09-02T08:00:00.000Z", family: undefined },
  ];
  for (const trip of trips) {
    const booklet = { ...sampleGeneratedBooklet(), destination: trip.destination, generatedAt: trip.generatedAt, ...(trip.family ? { family: trip.family } : {}) };
    await writeStoredBooklet(database, storage, {
      cacheKey: await createBookletCacheKey({ ...pdfRequestFor(booklet).identity }),
      booklet,
      researchModel: MODEL,
      composerModel: MODEL,
      expiresAt: trip.destination === "Ipoh" ? 1 : Date.now() + 60_000,
    });
  }
  // A row whose booklet JSON has gone from R2 is still listed, marked missing.
  await database.prepare(`INSERT INTO booklet_cache
    (cache_key, destination, age, days, artifact_key, pdf_key, research_model, composer_model, cache_version, generated_at, expires_at)
    VALUES (?, 'Oslo', 7, 2, 'booklets/old/x/booklet.json', NULL, ?, ?, 'old', '2026-08-01T00:00:00.000Z', 1)`)
    .bind("f".repeat(64), MODEL, MODEL).run();

  const page = await listLibraryEditions(database, storage, { limit: 10, offset: 0 });
  assert.deepEqual(page.editions.map((edition) => edition.destination), ["Lisbon", "Barcelona", "Ipoh", "Oslo"]);
  assert.equal(page.total, 4);
  assert.equal(page.hasMore, false);
  const lisbon = page.editions[0];
  assert.deepEqual(lisbon.children, [{ name: "Mia", age: 8 }, { name: "Leo", age: 5 }]);
  assert.equal(lisbon.available, true);
  assert.match(lisbon.edition, /^[A-F0-9]{8}$/);
  assert.equal(page.editions[2].expired, true, "expired editions stay in the library");
  assert.equal(page.editions[3].available, false);
  assert.equal(page.editions[3].storage, "missing");

  const firstPage = await listLibraryEditions(database, storage, { limit: 2, offset: 0 });
  assert.deepEqual(firstPage.editions.map((edition) => edition.destination), ["Lisbon", "Barcelona"]);
  assert.equal(firstPage.hasMore, true);
  const secondPage = await listLibraryEditions(database, storage, { limit: 2, offset: 2 });
  assert.deepEqual(secondPage.editions.map((edition) => edition.destination), ["Ipoh", "Oslo"]);
  assert.equal(secondPage.hasMore, false);

  assert.deepEqual(libraryPageFrom(null, null), { limit: 50, offset: 0 });
  assert.deepEqual(libraryPageFrom("9999", "-4"), { limit: 200, offset: 0 });
  assert.deepEqual(libraryPageFrom("20", "40"), { limit: 20, offset: 40 });
});

test("a library edition renders its sticker sheets from the stored booklet", async () => {
  const { database, storage, runtime, input, cacheKey, fingerprint } = await storedEdition();
  assert.equal(await readLibraryEdition(database, storage, "not-a-key"), null);
  const found = await readLibraryEdition(database, storage, cacheKey);
  assert.ok(found?.booklet);
  assert.equal(found.fingerprint, fingerprint);
  const response = await renderEditionPdf(new Request("http://localhost:3000/api/library"), runtime, {
    booklet: found.booklet,
    editionFingerprint: found.fingerprint,
    cacheKey,
    input,
    purchase: null,
    kind: "stickers",
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
});
