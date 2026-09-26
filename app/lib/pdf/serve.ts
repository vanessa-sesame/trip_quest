// Serving the printable PDFs: the purchase-checked booklet and sticker
// downloads (app/api/pdf) and the owner's order downloads (app/api/orders).
import { applySiblingPlan } from "../generation/booklet-ai.ts";
import {
  familyPackPdfFilename,
  createBookletPdf,
  type FamilyPackContext,
} from "./booklet-pdf.ts";
import {
  familyChildDisplayName,
  familyPackFor,
} from "../family.ts";
import {
  type BookletDatabase,
  type BookletObjectStorage,
  bookletSnapshotFingerprint,
  createBookletCacheKey,
  readStoredBookletArtifact,
  readStoredBooklet,
  readStoredBookletPdf,
  writeStoredBookletPdf,
} from "../storage/booklet-storage.ts";
import {
  readPurchasePdf,
  setPurchasePdfKey,
  writePurchasePdf,
  type PaymentRuntime,
  type PurchaseRecord,
} from "../payment.ts";
import type { NormalizedPdfRequest } from "./request.ts";
import { createStickerSheetPdf, stickerSheetsPdfFilename } from "./stickers.ts";
import { HttpRequestError } from "../request-security.ts";
import { illustrationStorageKey } from "../generation/illustration-ai.ts";

export type RuntimeEnvironment = PaymentRuntime & {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  BOOKLET_FILES?: BookletObjectStorage;
  DB?: BookletDatabase;
  KIMI_COMPOSER_MODEL?: string;
  KIMI_RESEARCH_MODEL?: string;
  TRIPQUEST_OWNER_EMAIL?: string;
  TRIPQUEST_PDF_TEST_MODE?: string;
};

const pdfJobs = new Map<string, Promise<Uint8Array>>();

// "booklet" is the printable booklet; "stickers" its matching sticker sheets.
export type PdfKind = "booklet" | "stickers";

export function pdfKindFrom(value: unknown): PdfKind {
  return value === "stickers" ? "stickers" : "booklet";
}

// Fonts and illustrations for the renderers: R2-stored illustrations by
// key, anything else from the site's static assets. illustrationStorageKey
// only matches the illustrations/v.../artwork.png shape, so /fonts/*.ttf
// falls through to the static branch.
export function staticAssetResolver(request: Request, runtime: RuntimeEnvironment) {
  return async (path: string) => {
    const storedKey = illustrationStorageKey(path);
    if (storedKey) {
      const stored = await runtime.BOOKLET_FILES?.get(storedKey);
      return stored?.arrayBuffer ? new Uint8Array(await stored.arrayBuffer()) : null;
    }
    if (!path.startsWith("/") || path.startsWith("//")) return null;
    const assetRequest = new Request(new URL(path, request.url));
    // Local dev has no ASSETS binding (vite.config.ts only simulates D1/R2),
    // which silently rendered every dev PDF in Helvetica with no curated
    // art; the dev server serves public/ itself, so fetch it from there.
    const response = runtime.ASSETS
      ? await runtime.ASSETS.fetch(assetRequest)
      : await fetch(assetRequest);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  };
}

export async function getRuntimeEnvironment(): Promise<RuntimeEnvironment> {
  try {
    const workers = await import("cloudflare:workers");
    return workers.env as unknown as RuntimeEnvironment;
  } catch {
    return process.env as RuntimeEnvironment;
  }
}
export function isOwnerRequest(request: Request, runtime: RuntimeEnvironment) {
  const owner = runtime.TRIPQUEST_OWNER_EMAIL?.trim().toLocaleLowerCase();
  const visitor = request.headers.get("oai-authenticated-user-email")?.trim().toLocaleLowerCase();
  return Boolean(owner && visitor && owner === visitor);
}

export function canPreparePdf(request: Request, runtime: RuntimeEnvironment) {
  return isOwnerRequest(request, runtime) || runtime.TRIPQUEST_PDF_TEST_MODE === "true";
}

export function pdfResponse(
  bytes: ArrayBuffer | Uint8Array,
  filename: string,
  cache: string,
  editionFingerprint?: string,
) {
  const body = bytes instanceof Uint8Array
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    : bytes;
  return new Response(body as ArrayBuffer, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(body.byteLength),
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
      "X-TripQuest-Pdf-Cache": cache,
      ...(editionFingerprint ? { "X-TripQuest-Edition": editionFingerprint } : {}),
    },
  });
}

function hasPersonalFamilyNames(input: NormalizedPdfRequest) {
  return input.family.some((child, index) => {
    const fallback = index === 0 ? "Your child" : `Explorer ${index + 1}`;
    return familyChildDisplayName(child, index) !== fallback;
  });
}

export async function preparePdf(
  request: Request,
  runtime: RuntimeEnvironment,
  input: NormalizedPdfRequest,
  purchase: PurchaseRecord | null,
  requestedFingerprint = "",
  kind: PdfKind = "booklet",
) {
  if (!runtime.DB || !runtime.BOOKLET_FILES) {
    return Response.json({ error: "PDF storage is not connected yet." }, { status: 503 });
  }
  const computedCacheKey = await createBookletCacheKey(input.identity);
  if (purchase?.edition && purchase.cacheKey !== computedCacheKey) {
    return Response.json({ error: "This purchase does not match the requested booklet." }, { status: 403 });
  }
  const cacheKey = purchase?.cacheKey || computedCacheKey;

  if (purchase?.pdfKey && kind === "booklet") {
    const storedPurchasePdf = await readPurchasePdf(
      runtime.BOOKLET_FILES,
      purchase.pdfKey,
      purchase.edition?.fingerprint,
    );
    if (storedPurchasePdf) {
      const editionFingerprint = purchase.edition?.fingerprint;
      return pdfResponse(storedPurchasePdf, "tripquest-booklet.pdf", "purchase", editionFingerprint);
    }
  }
  if (purchase && !purchase.edition) {
    return Response.json(
      { error: "This earlier purchase has no preserved edition snapshot. Please contact TripQuest support rather than downloading a different booklet." },
      { status: 409 },
    );
  }

  const exactEdition = purchase?.edition
    ? await readStoredBookletArtifact(
        runtime.BOOKLET_FILES,
        purchase.edition.artifactKey,
        input.identity,
        purchase.edition.fingerprint,
      )
    : null;
  const storedBooklet = exactEdition?.booklet || await readStoredBooklet(
    runtime.DB,
    runtime.BOOKLET_FILES,
    cacheKey,
    input.identity,
  );
  if (!storedBooklet || purchase?.edition && !exactEdition) {
    return Response.json(
      { error: purchase ? "The purchased edition snapshot is no longer available." : "Create this custom booklet before downloading its PDF." },
      { status: purchase ? 409 : 404 },
    );
  }
  const editionFingerprint = exactEdition?.fingerprint || await bookletSnapshotFingerprint(storedBooklet);
  if (requestedFingerprint && requestedFingerprint !== editionFingerprint) {
    return Response.json(
      { error: "This PDF does not match the booklet edition currently shown in the preview." },
      { status: 409 },
    );
  }
  const personalizedBooklet = applySiblingPlan(storedBooklet, input.family);
  const resolveStaticAsset = staticAssetResolver(request, runtime);
  if (kind === "stickers") {
    const stickers = await createStickerSheetPdf(
      personalizedBooklet,
      familyPackFor(input.family, input.events, input.days),
      resolveStaticAsset,
      { alignmentPage: true },
    );
    return pdfResponse(stickers, stickerSheetsPdfFilename(personalizedBooklet), "stickers", editionFingerprint);
  }
  const filename = familyPackPdfFilename(personalizedBooklet);
  const reusablePdf = input.family.length <= 1 && !hasPersonalFamilyNames(input);
  if (reusablePdf) {
    const stored = await readStoredBookletPdf(runtime.DB, runtime.BOOKLET_FILES, cacheKey, Date.now(), editionFingerprint);
    if (stored) return pdfResponse(stored.bytes, filename, "durable", editionFingerprint);
  }

  const jobKey = `${purchase?.purchaseId || "test"}:${cacheKey}:${input.family.map((child, index) => `${index}:${child.name}`).join("|")}`;
  let job = pdfJobs.get(jobKey);
  if (!job) {
    const familyPack: FamilyPackContext = familyPackFor(input.family, input.events, input.days);
    job = createBookletPdf(personalizedBooklet, familyPack, resolveStaticAsset, resolveStaticAsset);
    pdfJobs.set(jobKey, job);
    void job.finally(() => pdfJobs.delete(jobKey)).catch(() => undefined);
  }
  const pdf = await job;
  if (reusablePdf) {
    await writeStoredBookletPdf(runtime.DB, runtime.BOOKLET_FILES, { cacheKey, filename, pdf, editionFingerprint });
  }
  if (purchase && !reusablePdf) {
    const pdfKey = await writePurchasePdf(runtime.BOOKLET_FILES, purchase.purchaseId, filename, pdf, editionFingerprint);
    await setPurchasePdfKey(runtime.DB, purchase.purchaseId, pdfKey);
  }
  return pdfResponse(
    pdf,
    filename,
    purchase ? "purchase-generated" : reusablePdf ? "generated" : "family-generated",
    editionFingerprint,
  );
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpRequestError) return Response.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : "The PDF could not be created.";
  console.error("[TripQuest PDF]", message);
  const isInputError = /destination|age|trip length|daily plans|day \d+ plan/i.test(message);
  return Response.json({ error: isInputError ? message : "The printable PDF could not be created. Please try again." }, { status: isInputError ? 400 : 500 });
}

