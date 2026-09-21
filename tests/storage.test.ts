import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  type BookletCacheIdentity,
  type BookletDatabase,
  type BookletObjectStorage,
  BOOKLET_CACHE_VERSION,
  acquireGenerationLock,
  batchRangeForDay,
  bookletArtifactKey,
  bookletPdfKey,
  bookletSnapshotFingerprint,
  consumeGenerationRateLimit,
  createBookletCacheKey,
  createResearchCacheKey,
  deleteStoredBookletBatch,
  parseStoredResearch,
  readStoredBooklet,
  readStoredBookletArtifact,
  readStoredBookletBatch,
  readStoredBookletReference,
  readStoredBookletPdf,
  readStoredResearch,
  releaseGenerationLock,
  writeStoredBooklet,
  writeStoredBookletBatch,
  writeStoredBookletPdf,
  writeStoredResearch,
} from "../app/booklet-storage.ts";
import type { GeneratedBookletData } from "../app/booklet-ai.ts";

function createTestDatabase(): BookletDatabase {
  const sqlite = new DatabaseSync(":memory:");
  const migrationsDirectory = new URL("../drizzle/", import.meta.url);
  for (const filename of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort()) {
    const migration = readFileSync(new URL(filename, migrationsDirectory), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }

  return {
    prepare(query) {
      const statement = sqlite.prepare(query);
      let values: Array<string | number | null> = [];
      const prepared = {
        bind(...nextValues: Array<string | number | null>) {
          values = nextValues;
          return prepared;
        },
        async first<T>() {
          return (statement.get(...values) ?? null) as T | null;
        },
        async run() {
          const result = statement.run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
      };
      return prepared;
    },
  };
}

function createTestArtifacts() {
  const objects = new Map<string, string | Uint8Array>();
  const storage: BookletObjectStorage = {
    async get(key) {
      const value = objects.get(key);
      if (value === undefined) return null;
      const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
      return {
        async arrayBuffer() {
          return bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
        },
        async text() {
          return typeof value === "string" ? value : new TextDecoder().decode(value);
        },
      };
    },
    async put(key, value) {
      if (typeof value === "string") {
        objects.set(key, value);
      } else if (ArrayBuffer.isView(value)) {
        objects.set(
          key,
          new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice(),
        );
      } else {
        objects.set(key, new Uint8Array(value).slice());
      }
      return undefined;
    },
    async delete(key) {
      objects.delete(key);
      return undefined;
    },
  };
  return { objects, storage };
}

function generatedBooklet(): GeneratedBookletData {
  return {
    destination: "Singapore",
    age: 7,
    days: 1,
    itinerary: ["Gardens by the Bay"],
    profile: {
      style: "Garden city clues and skyways",
      intro: "Follow Singapore's garden paths and notice how plants, buildings, and tropical weather meet.",
      word: "terima kasih - thank you",
      etiquette: "Walk gently around planted areas and leave every flower where it grows.",
    },
    dayPlans: [
      {
        day: 1,
        theme: "Gardens by the Bay Supertrees",
        focusLabel: "Vertical gardens",
        mission: "Look for the living plants climbing the Supertrees and compare their shapes.",
        activities: [
          {
            title: "Supertree Word Search",
            kind: "Garden word puzzle",
            body: "Find and circle these four local words: ORCHID, GARDEN, CLOUD, TREE. They can run across, down, or diagonally.",
            prompt: "The ORCHID clue I will remember: __________",
            gameType: "word_search",
            items: [
              { label: "ORCHID", clue: "A flower strongly associated with Singapore." },
              { label: "GARDEN", clue: "A planted place for people to explore." },
              { label: "CLOUD", clue: "The Cloud Forest is named for this misty feature." },
              { label: "TREE", clue: "The Supertrees borrow their shape from this plant." },
            ],
          },
          {
            title: "Skyway Route Mapper",
            kind: "Observation map",
            body: "Trace one continuous route from START to FINISH that visits all four local stops. Avoid the closed roads, try not to use the same street twice, and see how few streets you can use.",
            prompt: "My stop order: __ - __ - __ - __   Streets used: ____",
            gameType: "map_puzzle",
            items: [
              { label: "Grove", clue: "Begin among the tall Supertrees." },
              { label: "Skyway", clue: "Trace the raised walkway." },
              { label: "Dome", clue: "Mark a glass conservatory." },
              { label: "Lake", clue: "Finish beside the water." },
            ],
          },
        ],
      },
    ],
    sources: [
      { title: "Gardens by the Bay", url: "https://www.gardensbythebay.com.sg/" },
      { title: "Visit Singapore", url: "https://www.visitsingapore.com/" },
    ],
    generatedAt: "2026-09-15T00:00:00.000Z",
  };
}

test("durable cache keys are stable but change with booklet inputs", async () => {
  const identity: BookletCacheIdentity = {
    destination: "Singapore",
    age: 7,
    days: 1,
    itinerary: ["Gardens by the Bay"],
    researchModel: "kimi-k3",
    composerModel: "kimi-k2.6",
  };
  const first = await createBookletCacheKey(identity);
  const same = await createBookletCacheKey({
    ...identity,
    destination: "SINGAPORE",
    itinerary: ["GARDENS BY THE BAY"],
  });
  const older = await createBookletCacheKey({ ...identity, age: 8 });
  const namedEdition = await createBookletCacheKey({ ...identity, editionContext: "Mia" });
  const scheduledEdition = await createBookletCacheKey({ ...identity, editionContext: "Mia|airport" });
  const research = await createResearchCacheKey(
    identity.destination,
    identity.itinerary,
    identity.researchModel,
  );

  assert.equal(first, same);
  assert.notEqual(first, older);
  assert.notEqual(first, namedEdition);
  assert.notEqual(namedEdition, scheduledEdition);
  assert.notEqual(first, research);
});

test("destination research is reused across empty trip lengths but not custom stops", async () => {
  const twoOpenDays = await createResearchCacheKey(" Singapore ", ["", ""], "kimi-k3");
  const fiveOpenDays = await createResearchCacheKey("SINGAPORE", ["", "", "", "", ""], "kimi-k3");
  const gardens = await createResearchCacheKey("Singapore", [" Gardens by the Bay ", ""], "kimi-k3");
  const zoo = await createResearchCacheKey("Singapore", ["Singapore Zoo"], "kimi-k3");

  assert.equal(twoOpenDays, fiveOpenDays);
  assert.notEqual(twoOpenDays, gardens);
  assert.notEqual(gardens, zoo);
});

test("D1 metadata and the private R2 artifact restore a generated booklet", async () => {
  const database = createTestDatabase();
  const { objects, storage } = createTestArtifacts();
  const booklet = generatedBooklet();
  const identity: BookletCacheIdentity = {
    destination: booklet.destination,
    age: booklet.age,
    days: booklet.days,
    itinerary: booklet.itinerary,
    researchModel: "kimi-k3",
    composerModel: "kimi-k2.6",
  };
  const cacheKey = await createBookletCacheKey(identity);

  await writeStoredBooklet(database, storage, {
    cacheKey,
    booklet,
    researchModel: identity.researchModel,
    composerModel: identity.composerModel,
    expiresAt: Date.now() + 60_000,
  });

  const fingerprint = await bookletSnapshotFingerprint(booklet);
  assert.ok(objects.has(bookletArtifactKey(cacheKey, fingerprint)));
  assert.deepEqual(
    await readStoredBooklet(database, storage, cacheKey, identity),
    booklet,
  );
  assert.equal(
    await readStoredBooklet(database, storage, cacheKey, { ...identity, age: 8 }),
    null,
  );
  assert.equal(
    await readStoredBooklet(database, storage, cacheKey, identity, Date.now() + 120_000),
    null,
  );

  const pdf = new TextEncoder().encode("%PDF-test");
  await writeStoredBookletPdf(database, storage, {
    cacheKey,
    filename: "tripquest-singapore-age-7.pdf",
    pdf,
  });
  assert.ok(objects.has(bookletPdfKey(cacheKey)));
  const restoredPdf = await readStoredBookletPdf(database, storage, cacheKey);
  assert.equal(new TextDecoder().decode(restoredPdf?.bytes), "%PDF-test");

  await database
    .prepare("UPDATE booklet_cache SET pdf_key = ? WHERE cache_key = ?")
    .bind(`booklets/old-pdf-version/${cacheKey}/booklet.pdf`, cacheKey)
    .run();
  assert.equal(await readStoredBookletPdf(database, storage, cacheKey), null);
});

test("immutable booklet snapshots preserve the frozen family and itinerary events", async () => {
  const database = createTestDatabase();
  const { storage } = createTestArtifacts();
  const booklet: GeneratedBookletData = {
    ...generatedBooklet(),
    family: [{
      id: "child-1",
      name: "Mia",
      age: 7,
      readingLevel: "early-reader",
      interests: ["dinosaurs"],
      avoid: ["long writing"],
      preferredMechanics: ["spot"],
    }],
    events: [{
      id: "event-1",
      day: 1,
      type: "attraction",
      title: "Gardens by the Bay",
      place: "Supertree Grove",
      details: "Evening light show",
    }],
  };
  const identity: BookletCacheIdentity = {
    destination: booklet.destination,
    age: booklet.age,
    days: booklet.days,
    itinerary: booklet.itinerary,
    researchModel: "kimi-k3",
    composerModel: "kimi-k2.6",
  };
  const cacheKey = await createBookletCacheKey(identity);
  const artifactKey = await writeStoredBooklet(database, storage, {
    cacheKey,
    booklet,
    researchModel: identity.researchModel,
    composerModel: identity.composerModel,
    expiresAt: Date.now() + 60_000,
  });
  const fingerprint = await bookletSnapshotFingerprint(booklet);
  const restored = await readStoredBookletArtifact(storage, artifactKey, identity, fingerprint);

  assert.deepEqual(restored?.booklet.family, booklet.family);
  assert.deepEqual(restored?.booklet.events, booklet.events);
  assert.equal(restored?.fingerprint, fingerprint);
});

test("a purchase can keep reading its exact edition after the D1 cache row changes", async () => {
  const database = createTestDatabase();
  const { storage } = createTestArtifacts();
  const booklet = generatedBooklet();
  const identity: BookletCacheIdentity = {
    destination: booklet.destination,
    age: booklet.age,
    days: booklet.days,
    itinerary: booklet.itinerary,
    researchModel: "kimi-k3",
    composerModel: "kimi-k2.6",
  };
  const cacheKey = await createBookletCacheKey(identity);
  const reference = await writeStoredBooklet(database, storage, {
    cacheKey,
    booklet,
    researchModel: identity.researchModel,
    composerModel: identity.composerModel,
    expiresAt: Date.now() + 60_000,
  });
  const storedReference = await readStoredBookletReference(database, storage, cacheKey, identity);
  assert.equal(storedReference?.artifactKey, reference);
  assert.equal(storedReference?.fingerprint, await bookletSnapshotFingerprint(booklet));

  const newerBooklet = { ...booklet, age: 8 };
  const newerIdentity = { ...identity, age: 8 };
  const newerCacheKey = await createBookletCacheKey(newerIdentity);
  const newerArtifact = await writeStoredBooklet(database, storage, {
    cacheKey: newerCacheKey,
    booklet: newerBooklet,
    researchModel: identity.researchModel,
    composerModel: identity.composerModel,
    expiresAt: Date.now() + 60_000,
  });
  assert.notEqual(newerArtifact, reference);
  await database
    .prepare("UPDATE booklet_cache SET artifact_key = ? WHERE cache_key = ?")
    .bind(newerArtifact, cacheKey)
    .run();

  const pinned = await readStoredBookletArtifact(
    storage,
    reference,
    identity,
    storedReference?.fingerprint,
  );
  assert.deepEqual(pinned?.booklet, booklet);
  assert.equal(await readStoredBookletReference(database, storage, cacheKey, identity), null);
});

test("edition fingerprints ignore transport metadata", async () => {
  const booklet = generatedBooklet();
  const fingerprint = await bookletSnapshotFingerprint(booklet);
  const decorated = { ...booklet, editionFingerprint: "f".repeat(64) } as typeof booklet & { editionFingerprint: string };
  assert.equal(await bookletSnapshotFingerprint(decorated), fingerprint);
});

test("legacy mutable booklet objects are promoted to immutable snapshots", async () => {
  const database = createTestDatabase();
  const { objects, storage } = createTestArtifacts();
  const booklet = generatedBooklet();
  const identity: BookletCacheIdentity = {
    destination: booklet.destination,
    age: booklet.age,
    days: booklet.days,
    itinerary: booklet.itinerary,
    researchModel: "kimi-k3",
    composerModel: "kimi-k2.6",
  };
  const cacheKey = await createBookletCacheKey(identity);
  const legacyKey = `booklets/${BOOKLET_CACHE_VERSION}/${cacheKey}/booklet.json`;
  objects.set(legacyKey, JSON.stringify(booklet));
  await database
    .prepare(`INSERT INTO booklet_cache
      (cache_key, destination, age, days, artifact_key, pdf_key, research_model, composer_model, cache_version, generated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`)
    .bind(
      cacheKey,
      booklet.destination,
      booklet.age,
      booklet.days,
      legacyKey,
      identity.researchModel,
      identity.composerModel,
      BOOKLET_CACHE_VERSION,
      Date.now(),
      Date.now() + 60_000,
    )
    .run();

  const reference = await readStoredBookletReference(database, storage, cacheKey, identity);
  const fingerprint = await bookletSnapshotFingerprint(booklet);
  assert.equal(reference?.artifactKey, bookletArtifactKey(cacheKey, fingerprint));
  assert.ok(objects.has(bookletArtifactKey(cacheKey, fingerprint)));
  assert.deepEqual(reference?.booklet, booklet);
});

test("destination research and generation locks persist in D1", async () => {
  const database = createTestDatabase();
  const cacheKey = await createResearchCacheKey(
    "Singapore",
    ["Gardens by the Bay"],
    "kimi-k3",
  );
  const research = {
    notes: "Singapore's Gardens by the Bay combines planted Supertrees, glass conservatories, tropical species, and waterfront paths. ".repeat(4),
    sources: [
      { title: "Gardens by the Bay", url: "https://www.gardensbythebay.com.sg/" },
      { title: "Visit Singapore", url: "https://www.visitsingapore.com/" },
    ],
  };

  await writeStoredResearch(database, {
    cacheKey,
    destination: "Singapore",
    research,
    researchModel: "kimi-k3",
    generatedAt: "2026-09-15T00:00:00.000Z",
    expiresAt: Date.now() + 60_000,
  });
  assert.deepEqual(await readStoredResearch(database, cacheKey), research);

  const now = Date.now();
  assert.equal(
    await acquireGenerationLock(database, cacheKey, "worker-one", now, now + 30_000),
    true,
  );
  assert.equal(
    await acquireGenerationLock(database, cacheKey, "worker-two", now, now + 30_000),
    false,
  );
  await releaseGenerationLock(database, cacheKey, "worker-two");
  assert.equal(
    await acquireGenerationLock(database, cacheKey, "worker-two", now, now + 30_000),
    false,
  );
  await releaseGenerationLock(database, cacheKey, "worker-one");
  assert.equal(
    await acquireGenerationLock(database, cacheKey, "worker-two", now, now + 30_000),
    true,
  );
});

test("stored research rejects weak or malformed source data", () => {
  const notes = "Source-backed destination research. ".repeat(12);
  assert.equal(parseStoredResearch(JSON.stringify({
    notes,
    sources: [{ title: "Only one source", url: "https://example.com" }],
  })), null);
  assert.equal(parseStoredResearch(JSON.stringify({
    notes,
    sources: [
      { title: "Broken URL", url: "https://[" },
      { title: "Official source", url: "https://example.com" },
    ],
  })), null);
});

test("generation rate limits are atomic and reset with the next window", async () => {
  const database = createTestDatabase();
  const hour = 60 * 60 * 1000;
  const now = 1_700_000_000_000;
  assert.equal(await consumeGenerationRateLimit(database, "client-a", now, 2, hour), true);
  assert.equal(await consumeGenerationRateLimit(database, "client-a", now + 1, 2, hour), true);
  assert.equal(await consumeGenerationRateLimit(database, "client-a", now + 2, 2, hour), false);
  assert.equal(await consumeGenerationRateLimit(database, "client-b", now + 2, 2, hour), true);
  assert.equal(await consumeGenerationRateLimit(database, "client-a", now + hour, 2, hour), true);
});

test("a composed day-batch can be saved, restored, and independently invalidated", async () => {
  const { storage } = createTestArtifacts();
  const booklet = generatedBooklet();
  const draft = { profile: booklet.profile, dayPlans: booklet.dayPlans };
  const cacheKey = "cache-key-batches";

  assert.equal(await readStoredBookletBatch(storage, cacheKey, 3, 3), null);

  await writeStoredBookletBatch(storage, cacheKey, 3, 3, draft);
  const restored = await readStoredBookletBatch(storage, cacheKey, 3, 3);
  assert.deepEqual(restored, draft);

  // A batch saved under a different cache key or day range is a separate object.
  assert.equal(await readStoredBookletBatch(storage, "other-cache-key", 3, 3), null);
  assert.equal(await readStoredBookletBatch(storage, cacheKey, 0, 3), null);

  await deleteStoredBookletBatch(storage, cacheKey, 3, 3);
  assert.equal(await readStoredBookletBatch(storage, cacheKey, 3, 3), null);
});

test("a day number maps back to the exact batch that composed it", () => {
  // Trips of four days or fewer compose as one batch; longer trips compose
  // in three-day batches. A whole-booklet QA failure on any given day must
  // resolve to the same batch composeBooklet used, or a repair would
  // recompose the wrong days.
  assert.deepEqual(batchRangeForDay(1, 1), { offset: 0, dayCount: 1 });
  assert.deepEqual(batchRangeForDay(3, 3), { offset: 0, dayCount: 3 });
  assert.deepEqual(batchRangeForDay(1, 5), { offset: 0, dayCount: 3 });
  assert.deepEqual(batchRangeForDay(3, 5), { offset: 0, dayCount: 3 });
  assert.deepEqual(batchRangeForDay(4, 5), { offset: 3, dayCount: 2 });
  assert.deepEqual(batchRangeForDay(5, 5), { offset: 3, dayCount: 2 });
  assert.deepEqual(batchRangeForDay(1, 14), { offset: 0, dayCount: 3 });
  assert.deepEqual(batchRangeForDay(7, 14), { offset: 6, dayCount: 3 });
  assert.deepEqual(batchRangeForDay(14, 14), { offset: 12, dayCount: 2 });
});
