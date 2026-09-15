import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  type BookletCacheIdentity,
  type BookletDatabase,
  type BookletObjectStorage,
  acquireGenerationLock,
  bookletArtifactKey,
  bookletPdfKey,
  createBookletCacheKey,
  createResearchCacheKey,
  readStoredBooklet,
  readStoredBookletPdf,
  readStoredResearch,
  releaseGenerationLock,
  writeStoredBooklet,
  writeStoredBookletPdf,
  writeStoredResearch,
} from "../app/booklet-storage.ts";
import type { GeneratedBookletData } from "../app/booklet-ai.ts";

function createTestDatabase(): BookletDatabase {
  const sqlite = new DatabaseSync(":memory:");
  const migration = readFileSync(
    new URL("../drizzle/0000_misty_scarlet_spider.sql", import.meta.url),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) sqlite.exec(statement);
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
            body: "Connect the four stops in order, then add one symbol that makes the route easier to follow.",
            prompt: "Best route clue: __________",
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
  const research = await createResearchCacheKey(
    identity.destination,
    identity.itinerary,
    identity.researchModel,
  );

  assert.equal(first, same);
  assert.notEqual(first, older);
  assert.notEqual(first, research);
  assert.match(bookletArtifactKey(first), new RegExp(`${first}/booklet\\.json$`));
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

  assert.ok(objects.has(bookletArtifactKey(cacheKey)));
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
