import {
  type BookletSource,
  type GeneratedBookletData,
  normalizeItinerary,
  validateBookletDraft,
} from "./booklet-ai.ts";
import {
  normalizeFamilyChildren,
  normalizeItineraryEvents,
} from "./family.ts";

export const RESEARCH_CACHE_VERSION = "research-2026-09-15-2";
export const BOOKLET_CACHE_VERSION = "booklet-2026-09-19-7";
export const BOOKLET_PDF_CACHE_VERSION = "pdf-2026-09-20-4";

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

function normalizedText(value: string) {
  return value.toLocaleLowerCase();
}

export async function createResearchCacheKey(
  destination: string,
  itinerary: string[],
  researchModel: string,
) {
  return digest({
    version: RESEARCH_CACHE_VERSION,
    destination: normalizedText(destination),
    itinerary: itinerary.map(normalizedText),
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
  return digest(snapshot);
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
    const family = Array.isArray(parsed.family)
      ? normalizeFamilyChildren(parsed.family)
      : undefined;
    const events = Array.isArray(parsed.events)
      ? normalizeItineraryEvents(parsed.events, parsed.days)
      : undefined;

    return {
      destination: parsed.destination,
      age: parsed.age,
      days: parsed.days,
      itinerary,
      ...draft,
      sources,
      generatedAt: parsed.generatedAt,
      ...(family ? { family } : {}),
      ...(events ? { events } : {}),
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
