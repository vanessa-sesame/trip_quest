// The owner's library: every generated edition in booklet_cache, newest
// first, with the family it was made for (from the stored booklet JSON in
// R2). Used by app/api/library and app/library.
import type { GeneratedBookletData } from "./generation/booklet-ai.ts";
import {
  type BookletDatabase,
  type BookletObjectStorage,
  bookletSnapshotFingerprint,
  isBookletArtifactKey,
  parseStoredBooklet,
} from "./storage/booklet-storage.ts";

export const LIBRARY_PAGE_SIZE = 50;
export const LIBRARY_MAX_PAGE_SIZE = 200;

type LibraryRow = {
  cacheKey: string;
  destination: string;
  age: number;
  days: number;
  artifactKey: string;
  pdfKey: string | null;
  researchModel: string;
  composerModel: string;
  generatedAt: string;
  expiresAt: number;
};

export type LibraryEdition = {
  cacheKey: string;
  destination: string;
  age: number;
  days: number;
  generatedAt: string;
  expiresAt: number;
  // Past expires_at: visitors can no longer download it for free, but the
  // owner's library still renders it.
  expired: boolean;
  researchModel: string;
  composerModel: string;
  hasStoredPdf: boolean;
  // False when the booklet JSON is gone from R2 ("missing") or was written
  // by an older release in a shape this one no longer reads ("unreadable").
  available: boolean;
  storage: EditionRead["status"];
  edition: string;
  children: Array<{ name: string; age: number }>;
  itinerary: string[];
};

const LIBRARY_COLUMNS = `cache_key AS cacheKey, destination, age, days, artifact_key AS artifactKey,
  pdf_key AS pdfKey, research_model AS researchModel, composer_model AS composerModel,
  generated_at AS generatedAt, expires_at AS expiresAt`;

export function libraryPageFrom(limitValue: unknown, offsetValue: unknown) {
  const limit = Math.floor(Number(limitValue));
  const offset = Math.floor(Number(offsetValue));
  return {
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(LIBRARY_MAX_PAGE_SIZE, limit) : LIBRARY_PAGE_SIZE,
    offset: Number.isFinite(offset) && offset > 0 ? Math.min(1_000_000, offset) : 0,
  };
}

// Booklet JSON keys from any cache version: today's immutable snapshots
// (booklets/<version>/<cacheKey>/<fingerprint>/booklet.json) and older
// releases' one object per cache key.
const ANY_VERSION_ARTIFACT_KEY = /^booklets\/[\w.-]+\/[a-f0-9]{64}(?:\/[a-f0-9]{64})?\/booklet\.json$/i;

type EditionRead =
  | { status: "ok"; booklet: GeneratedBookletData }
  | { status: "missing" | "unreadable"; booklet: null };

async function readEditionBooklet(artifacts: BookletObjectStorage, artifactKey: string): Promise<EditionRead> {
  if (!isBookletArtifactKey(artifactKey) && !ANY_VERSION_ARTIFACT_KEY.test(artifactKey)) return { status: "missing", booklet: null };
  try {
    const object = await artifacts.get(artifactKey);
    if (!object) return { status: "missing", booklet: null };
    const booklet = parseStoredBooklet(await object.text());
    return booklet ? { status: "ok", booklet } : { status: "unreadable", booklet: null };
  } catch {
    return { status: "unreadable", booklet: null };
  }
}

function editionSummary(row: LibraryRow, read: EditionRead, fingerprint: string, now: number): LibraryEdition {
  const { booklet } = read;
  return {
    cacheKey: row.cacheKey,
    destination: row.destination,
    age: Number(row.age),
    days: Number(row.days),
    generatedAt: row.generatedAt,
    expiresAt: Number(row.expiresAt) || 0,
    expired: Number(row.expiresAt) <= now,
    researchModel: row.researchModel,
    composerModel: row.composerModel,
    hasStoredPdf: Boolean(row.pdfKey),
    available: Boolean(booklet),
    storage: read.status,
    edition: fingerprint.slice(0, 8).toUpperCase(),
    children: (booklet?.family ?? []).map((child) => ({ name: child.name, age: child.age })),
    itinerary: booklet?.itinerary.filter(Boolean) ?? [],
  };
}

// Newest first (generated_at is an ISO timestamp, so text order is time
// order). One page at a time; each edition costs one R2 read.
export async function listLibraryEditions(
  database: BookletDatabase,
  artifacts: BookletObjectStorage,
  page: { limit: number; offset: number } = { limit: LIBRARY_PAGE_SIZE, offset: 0 },
  now = Date.now(),
) {
  const statement = database
    .prepare(`SELECT ${LIBRARY_COLUMNS} FROM booklet_cache ORDER BY generated_at DESC, cache_key LIMIT ? OFFSET ?`)
    // One extra row says whether another page exists.
    .bind(page.limit + 1, page.offset);
  if (!statement.all) throw new Error("This database cannot list editions.");
  const { results } = await statement.all<LibraryRow>();
  const rows = results.slice(0, page.limit);
  const editions = await Promise.all(rows.map(async (row) => {
    const read = await readEditionBooklet(artifacts, row.artifactKey);
    const fingerprint = read.booklet ? await bookletSnapshotFingerprint(read.booklet) : "";
    return editionSummary(row, read, fingerprint, now);
  }));
  const countRow = await database.prepare("SELECT COUNT(*) AS total FROM booklet_cache").bind().first<{ total: number }>();
  return {
    editions,
    total: Number(countRow?.total) || editions.length,
    hasMore: results.length > page.limit,
    ...page,
  };
}

// One edition with its stored booklet, for the owner's downloads.
export async function readLibraryEdition(
  database: BookletDatabase,
  artifacts: BookletObjectStorage,
  cacheKey: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(cacheKey)) return null;
  const row = await database
    .prepare(`SELECT ${LIBRARY_COLUMNS} FROM booklet_cache WHERE cache_key = ?`)
    .bind(cacheKey)
    .first<LibraryRow>();
  if (!row) return null;
  const { booklet } = await readEditionBooklet(artifacts, row.artifactKey);
  if (!booklet) return { row, booklet: null, fingerprint: "" };
  return { row, booklet, fingerprint: await bookletSnapshotFingerprint(booklet) };
}
