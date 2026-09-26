import {
  type BookletDraft,
  type BookletSource,
  type GeneratedBookletData,
  normalizeItinerary,
  validateBookletDraft,
} from "../generation/booklet-ai.ts";
import {
  normalizeFamilyChildren,
  normalizeItineraryEvents,
} from "../family.ts";

export const RESEARCH_CACHE_VERSION = "research-2026-09-15-2";
export const BOOKLET_CACHE_VERSION = "booklet-2026-09-26-3";
export const BOOKLET_PDF_CACHE_VERSION = "pdf-2026-09-26-a5-1";
export const BOOKLET_BATCH_CACHE_VERSION = "batch-2026-09-21-1";

type D1Value = string | number | null;

type D1RunResult = {
  meta?: {
    changes?: number;
  };
};

type D1Statement = {
  bind(...values: D1Value[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<D1RunResult>;
};

export type BookletDatabase = {
  prepare(query: string): D1Statement;
};

type StoredObject = {
  arrayBuffer?(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  customMetadata?: Record<string, string>;
};

type ObjectMetadata = {
  httpMetadata?: {
    cacheControl?: string;
    contentDisposition?: string;
    contentType?: string;
  };
  customMetadata?: Record<string, string>;
};

export type BookletObjectStorage = {
  get(key: string): Promise<StoredObject | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    options?: ObjectMetadata,
  ): Promise<unknown>;
  delete(key: string): Promise<unknown>;
};

export type StoredResearch = {
  notes: string;
  sources: BookletSource[];
};

export type BookletCacheIdentity = {
  destination: string;
  age: number;
  days: number;
  itinerary: string[];
  researchModel: string;
  composerModel: string;
  familyContext?: string;
  familySize?: number;
  editionContext?: string;
};

const encoder = new TextEncoder();

async function digest(value: unknown) {
  const input = encoder.encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Plain JSON.stringify serializes object keys in insertion order, so two
// logically identical booklets can hash differently depending on which code
// path happened to build a nested object (for example questReveal.photoPath
// lands in a different key position depending on whether it was attached at
// composition time or rebuilt while re-validating a stored booklet). Sorting
// keys recursively makes the fingerprint depend only on content.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    // JSON.stringify replaces an undefined array element with null rather
    // than omitting it — match that exactly, or an array containing one
    // would hash differently than its real JSON.stringify'd form.
    return `[${value.map((item) => (item === undefined ? "null" : stableStringify(item))).join(",")}]`;
  }
  if (value && typeof value === "object") {
    // JSON.stringify silently drops an object property whose value is
    // undefined. A live 50-scenario test run found a real case this
    // affects: coverIllustrationPath is added via bare shorthand
    // (`{ ...result, coverIllustrationPath }`) and resolves to undefined
    // whenever both image providers fail, which creates the key with an
    // undefined value in memory — Object.entries includes it, so without
    // this filter the in-memory fingerprint included a key that the
    // durably-stored copy (round-tripped through real JSON.stringify, which
    // drops it) never has, permanently failing every /api/pdf 409 check for
    // that booklet.
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function stableDigest(value: unknown) {
  const input = encoder.encode(stableStringify(value));
  const hash = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizedText(value: string) {
  return value.toLocaleLowerCase();
}

export async function createResearchCacheKey(
  destination: string,
  itinerary: string[],
  researchModel: string,
) {
  // Empty days do not change destination research. Filtering them lets a
  // two-day and a five-day open itinerary reuse the same researched city.
  const plannedStops = itinerary
    .map((value) => normalizedText(value.trim()))
    .filter(Boolean);
  return digest({
    version: RESEARCH_CACHE_VERSION,
    destination: normalizedText(destination.trim()),
    itinerary: plannedStops,
    researchModel,
  });
}

export async function createBookletCacheKey(identity: BookletCacheIdentity) {
  return digest({
    version: BOOKLET_CACHE_VERSION,
    destination: normalizedText(identity.destination),
    age: identity.age,
    days: identity.days,
    itinerary: identity.itinerary.map(normalizedText),
    researchModel: identity.researchModel,
    composerModel: identity.composerModel,
    familyContext: identity.familyContext || "",
    familySize: identity.familySize || 1,
    editionContext: identity.editionContext || "",
  });
}

export function bookletArtifactKey(cacheKey: string, fingerprint: string) {
  return `booklets/${BOOKLET_CACHE_VERSION}/${cacheKey}/${fingerprint}/booklet.json`;
}

export function bookletBatchArtifactKey(
  cacheKey: string,
  dayOffset: number,
  dayCount: number,
) {
  return `booklet-batches/${BOOKLET_BATCH_CACHE_VERSION}/${cacheKey}/${dayOffset}-${dayCount}.json`;
}

// Long, single model calls are fragile on mobile. Three-day batches keep
// each request bounded and can be restored independently after a reconnect.
// One day per composition request: requests run in parallel, and a model
// writes one day about three times faster than three, so a trip of any
// length takes about as long as a single day.
export function composeBatchSize(days: number) {
  return Math.min(1, days);
}

// Maps a 1-indexed day number back to the batch that composed it, so a
// whole-booklet QA failure can invalidate and recompose just that batch
// instead of every batch in the request.
export function batchRangeForDay(day: number, totalDays: number) {
  const batchSize = composeBatchSize(totalDays);
  const offset = Math.floor((day - 1) / batchSize) * batchSize;
  const dayCount = Math.min(batchSize, totalDays - offset);
  return { offset, dayCount };
}

export async function readStoredBookletBatch(
  artifacts: BookletObjectStorage | undefined,
  cacheKey: string,
  dayOffset: number,
  dayCount: number,
): Promise<BookletDraft | null> {
  if (!artifacts) return null;
  const artifact = await artifacts.get(
    bookletBatchArtifactKey(cacheKey, dayOffset, dayCount),
  );
  if (!artifact) return null;
  try {
    const parsed = JSON.parse(await artifact.text());
    return parsed && typeof parsed === "object" ? parsed as BookletDraft : null;
  } catch {
    return null;
  }
}

export async function writeStoredBookletBatch(
  artifacts: BookletObjectStorage | undefined,
  cacheKey: string,
  dayOffset: number,
  dayCount: number,
  draft: BookletDraft,
) {
  if (!artifacts) return;
  await artifacts.put(
    bookletBatchArtifactKey(cacheKey, dayOffset, dayCount),
    JSON.stringify(draft),
    {
      httpMetadata: {
        cacheControl: "private, no-store",
        contentType: "application/json; charset=utf-8",
      },
      customMetadata: {
        dayCount: String(dayCount),
        dayOffset: String(dayOffset),
        version: BOOKLET_BATCH_CACHE_VERSION,
      },
    },
  );
}

export async function deleteStoredBookletBatch(
  artifacts: BookletObjectStorage | undefined,
  cacheKey: string,
  dayOffset: number,
  dayCount: number,
) {
  if (!artifacts) return;
  await artifacts.delete(bookletBatchArtifactKey(cacheKey, dayOffset, dayCount));
}

function legacyBookletArtifactKey(cacheKey: string) {
  return `booklets/${BOOKLET_CACHE_VERSION}/${cacheKey}/booklet.json`;
}

export function isBookletArtifactKey(value: string) {
  const parts = value.split("/");
  return (
    parts.length === 5 &&
    parts[0] === "booklets" &&
    parts[1] === BOOKLET_CACHE_VERSION &&
    /^[a-f0-9]{64}$/i.test(parts[2]) &&
    /^[a-f0-9]{64}$/i.test(parts[3]) &&
    parts[4] === "booklet.json"
  );
}

export function bookletPdfKey(cacheKey: string) {
  return `booklets/${BOOKLET_PDF_CACHE_VERSION}/${cacheKey}/booklet.pdf`;
}

export async function bookletSnapshotFingerprint(booklet: GeneratedBookletData) {
  const snapshot = { ...(booklet as GeneratedBookletData & { editionFingerprint?: unknown }) };
  delete snapshot.editionFingerprint;
  return stableDigest(snapshot);
}

export type StoredBookletReference = {
  booklet: GeneratedBookletData;
  artifactKey: string;
  fingerprint: string;
};

function parseSources(value: unknown) {
  if (!Array.isArray(value)) return null;

  const sources = value.flatMap((item): BookletSource[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    if (
      typeof source.title !== "string" ||
      typeof source.url !== "string" ||
      !source.title.trim() ||
      source.title.length > 300 ||
      source.url.length > 2_048
    ) {
      return [];
    }
    try {
      const url = new URL(source.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") return [];
      return [{ title: source.title.trim(), url: url.href }];
    } catch {
      return [];
    }
  });

  return sources.length === value.length ? sources : null;
}

export function parseStoredResearch(value: string): StoredResearch | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const sources = parseSources(parsed.sources);
    if (typeof parsed.notes !== "string" || parsed.notes.length < 300 || !sources || sources.length < 2) {
      return null;
    }
    return { notes: parsed.notes, sources };
  } catch {
    return null;
  }
}

export function parseStoredBooklet(value: string): GeneratedBookletData | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      typeof parsed.destination !== "string" ||
      typeof parsed.age !== "number" ||
      typeof parsed.days !== "number" ||
      typeof parsed.generatedAt !== "string"
    ) {
      return null;
    }

    const itinerary = normalizeItinerary(parsed.itinerary, parsed.days);
    const sources = parseSources(parsed.sources);
    if (!sources) return null;
    const draft = validateBookletDraft(parsed, parsed.days, parsed.age);
    const hasDayArchitecture = Array.isArray(parsed.dayPlans) && parsed.dayPlans.every((day) =>
      Boolean(day && typeof day === "object" && (day as Record<string, unknown>).architectureVersion === 2),
    );
    const family = Array.isArray(parsed.family)
      ? normalizeFamilyChildren(parsed.family)
      : undefined;
    const events = Array.isArray(parsed.events)
      ? normalizeItineraryEvents(parsed.events, parsed.days)
      : undefined;
    // Same validated shape as Activity.illustrationPath/questReveal.photoPath
    // (see booklet-ai.ts) — without this, a re-read from durable storage
    // silently drops the AI-generated cover art, changing the booklet's
    // fingerprint and making every later /api/pdf call 409.
    const coverIllustrationPath = typeof parsed.coverIllustrationPath === "string"
      && /^\/api\/illustration\?key=illustrations%2Fv(?:1|2)%2F[a-f0-9]{64}%2Fartwork\.png$/i.test(parsed.coverIllustrationPath)
      ? parsed.coverIllustrationPath
      : undefined;

    return {
      destination: parsed.destination,
      age: parsed.age,
      days: parsed.days,
      itinerary,
      ...(hasDayArchitecture
        ? draft
        : {
            profile: parsed.profile as GeneratedBookletData["profile"],
            dayPlans: parsed.dayPlans as GeneratedBookletData["dayPlans"],
          }),
      sources,
      generatedAt: parsed.generatedAt,
      ...(family ? { family } : {}),
      ...(events ? { events } : {}),
      ...(coverIllustrationPath ? { coverIllustrationPath } : {}),
    };
  } catch {
    return null;
  }
}

function sameIdentity(booklet: GeneratedBookletData, identity: BookletCacheIdentity) {
  return (
    normalizedText(booklet.destination) === normalizedText(identity.destination) &&
    booklet.age === identity.age &&
    booklet.days === identity.days &&
    booklet.itinerary.length === identity.itinerary.length &&
    booklet.itinerary.every(
      (item, index) => normalizedText(item) === normalizedText(identity.itinerary[index] ?? ""),
    )
  );
}

export async function readStoredResearch(
  database: BookletDatabase,
  cacheKey: string,
  now = Date.now(),
) {
  const row = await database
    .prepare(
      "SELECT research_json AS researchJson, expires_at AS expiresAt FROM destination_research_cache WHERE cache_key = ? AND expires_at > ?",
    )
    .bind(cacheKey, now)
    .first<{ researchJson: string; expiresAt: number }>();
  return row ? parseStoredResearch(row.researchJson) : null;
}

export async function writeStoredResearch(
  database: BookletDatabase,
  input: {
    cacheKey: string;
    destination: string;
    research: StoredResearch;
    researchModel: string;
    generatedAt: string;
    expiresAt: number;
  },
) {
  await database
    .prepare(
      `INSERT INTO destination_research_cache
        (cache_key, destination, research_json, research_model, cache_version, generated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
        destination = excluded.destination,
        research_json = excluded.research_json,
        research_model = excluded.research_model,
        cache_version = excluded.cache_version,
        generated_at = excluded.generated_at,
        expires_at = excluded.expires_at`,
    )
    .bind(
      input.cacheKey,
      input.destination,
      JSON.stringify(input.research),
      input.researchModel,
      RESEARCH_CACHE_VERSION,
      input.generatedAt,
      input.expiresAt,
    )
    .run();
}

export async function readStoredBooklet(
  database: BookletDatabase,
  artifacts: BookletObjectStorage,
  cacheKey: string,
  identity: BookletCacheIdentity,
  now = Date.now(),
) {
  const reference = await readStoredBookletReference(
    database,
    artifacts,
    cacheKey,
    identity,
    now,
  );
  return reference?.booklet || null;
}

export async function readStoredBookletArtifact(
  artifacts: BookletObjectStorage,
  artifactKey: string,
  identity: BookletCacheIdentity,
  expectedFingerprint?: string,
) {
  if (!isBookletArtifactKey(artifactKey)) return null;
  const artifact = await artifacts.get(artifactKey);
  if (!artifact) return null;
  const booklet = parseStoredBooklet(await artifact.text());
  if (!booklet || !sameIdentity(booklet, identity)) return null;
  const fingerprint = await bookletSnapshotFingerprint(booklet);
  if (expectedFingerprint && fingerprint !== expectedFingerprint) return null;
  return { booklet, artifactKey, fingerprint } satisfies StoredBookletReference;
}

export async function readStoredBookletReference(
  database: BookletDatabase,
  artifacts: BookletObjectStorage,
  cacheKey: string,
  identity: BookletCacheIdentity,
  now = Date.now(),
) {
  const row = await database
    .prepare(
      "SELECT artifact_key AS artifactKey FROM booklet_cache WHERE cache_key = ? AND expires_at > ?",
    )
    .bind(cacheKey, now)
    .first<{ artifactKey: string }>();
  if (!row?.artifactKey) return null;
  const current = await readStoredBookletArtifact(artifacts, row.artifactKey, identity);
  if (current) return current;

  // Releases before immutable snapshots used one mutable object per cache key.
  // Promote that object in place so existing previews and unpaid checkouts remain usable.
  if (row.artifactKey !== legacyBookletArtifactKey(cacheKey)) return null;
  const legacyArtifact = await artifacts.get(row.artifactKey);
  if (!legacyArtifact) return null;
  const booklet = parseStoredBooklet(await legacyArtifact.text());
  if (!booklet || !sameIdentity(booklet, identity)) return null;
  const fingerprint = await bookletSnapshotFingerprint(booklet);
  const artifactKey = bookletArtifactKey(cacheKey, fingerprint);
  await artifacts.put(artifactKey, JSON.stringify(booklet), {
    httpMetadata: {
      cacheControl: "private, no-store",
      contentType: "application/json; charset=utf-8",
    },
    customMetadata: {
      age: String(booklet.age),
      days: String(booklet.days),
      version: BOOKLET_CACHE_VERSION,
      fingerprint,
    },
  });
  await database
    .prepare("UPDATE booklet_cache SET artifact_key = ? WHERE cache_key = ? AND artifact_key = ?")
    .bind(artifactKey, cacheKey, row.artifactKey)
    .run();
  return { booklet, artifactKey, fingerprint };
}

export async function writeStoredBooklet(
  database: BookletDatabase,
  artifacts: BookletObjectStorage,
  input: {
    cacheKey: string;
    booklet: GeneratedBookletData;
    researchModel: string;
    composerModel: string;
    expiresAt: number;
  },
) {
  const fingerprint = await bookletSnapshotFingerprint(input.booklet);
  const artifactKey = bookletArtifactKey(input.cacheKey, fingerprint);
  await artifacts.put(artifactKey, JSON.stringify(input.booklet), {
    httpMetadata: {
      cacheControl: "private, no-store",
      contentType: "application/json; charset=utf-8",
    },
    customMetadata: {
      age: String(input.booklet.age),
      days: String(input.booklet.days),
      version: BOOKLET_CACHE_VERSION,
      fingerprint,
    },
  });

  await database
    .prepare(
      `INSERT INTO booklet_cache
        (cache_key, destination, age, days, artifact_key, pdf_key, research_model, composer_model, cache_version, generated_at, expires_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
        destination = excluded.destination,
        age = excluded.age,
        days = excluded.days,
        artifact_key = excluded.artifact_key,
        pdf_key = NULL,
        research_model = excluded.research_model,
        composer_model = excluded.composer_model,
        cache_version = excluded.cache_version,
        generated_at = excluded.generated_at,
        expires_at = excluded.expires_at`,
    )
    .bind(
      input.cacheKey,
      input.booklet.destination,
      input.booklet.age,
      input.booklet.days,
      artifactKey,
      input.researchModel,
      input.composerModel,
      BOOKLET_CACHE_VERSION,
      input.booklet.generatedAt,
      input.expiresAt,
    )
    .run();

  return artifactKey;
}

export async function readStoredBookletPdf(
  database: BookletDatabase,
  artifacts: BookletObjectStorage,
  cacheKey: string,
  now = Date.now(),
  expectedFingerprint?: string,
) {
  const row = await database
    .prepare(
      "SELECT pdf_key AS pdfKey FROM booklet_cache WHERE cache_key = ? AND pdf_key IS NOT NULL AND expires_at > ?",
    )
    .bind(cacheKey, now)
    .first<{ pdfKey: string }>();
  if (!row) return null;
  if (!row.pdfKey.startsWith(`booklets/${BOOKLET_PDF_CACHE_VERSION}/`)) return null;

  const artifact = await artifacts.get(row.pdfKey);
  if (!artifact?.arrayBuffer) return null;
  if (expectedFingerprint && artifact.customMetadata?.editionFingerprint !== expectedFingerprint) return null;
  return {
    bytes: await artifact.arrayBuffer(),
    pdfKey: row.pdfKey,
  };
}

export async function writeStoredBookletPdf(
  database: BookletDatabase,
  artifacts: BookletObjectStorage,
  input: {
    cacheKey: string;
    filename: string;
    pdf: ArrayBuffer | ArrayBufferView;
    editionFingerprint?: string;
  },
) {
  const pdfKey = bookletPdfKey(input.cacheKey);
  await artifacts.put(pdfKey, input.pdf, {
    httpMetadata: {
      cacheControl: "private, no-store",
      contentDisposition: `attachment; filename="${input.filename}"`,
      contentType: "application/pdf",
    },
    customMetadata: {
      filename: input.filename,
      version: BOOKLET_PDF_CACHE_VERSION,
      editionFingerprint: input.editionFingerprint || "",
    },
  });
  await database
    .prepare("UPDATE booklet_cache SET pdf_key = ? WHERE cache_key = ?")
    .bind(pdfKey, input.cacheKey)
    .run();
  return pdfKey;
}

export async function acquireGenerationLock(
  database: BookletDatabase,
  cacheKey: string,
  ownerId: string,
  now: number,
  expiresAt: number,
) {
  const result = await database
    .prepare(
      `INSERT INTO generation_locks (cache_key, owner_id, expires_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
        owner_id = excluded.owner_id,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
       WHERE generation_locks.owner_id = excluded.owner_id OR generation_locks.expires_at <= ?`,
    )
    .bind(cacheKey, ownerId, expiresAt, now, now)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}

export async function releaseGenerationLock(
  database: BookletDatabase,
  cacheKey: string,
  ownerId: string,
) {
  await database
    .prepare("DELETE FROM generation_locks WHERE cache_key = ? AND owner_id = ?")
    .bind(cacheKey, ownerId)
    .run();
}

export async function consumeGenerationRateLimit(
  database: BookletDatabase,
  clientKey: string,
  now: number,
  limit: number,
  windowMilliseconds: number,
) {
  const windowStart = Math.floor(now / windowMilliseconds) * windowMilliseconds;
  const result = await database
    .prepare(
      `INSERT INTO generation_rate_limits
        (client_key, window_start, request_count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(client_key) DO UPDATE SET
        window_start = excluded.window_start,
        request_count = CASE
          WHEN generation_rate_limits.window_start = excluded.window_start
          THEN generation_rate_limits.request_count + 1
          ELSE 1
        END,
        updated_at = excluded.updated_at
       WHERE generation_rate_limits.window_start != excluded.window_start
          OR generation_rate_limits.request_count < ?`,
    )
    .bind(clientKey, windowStart, now, limit)
    .run();
  return Number(result.meta?.changes ?? 0) > 0;
}
