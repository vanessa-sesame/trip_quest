// Serving the printable PDFs: the free booklet and sticker downloads for a
// created edition (app/api/pdf), past purchasers' downloads, and the
// owner's order and library downloads (app/api/orders, app/api/library).
import { applySiblingPlan, type GeneratedBookletData } from "../generation/booklet-ai.ts";
import { hasOwnerSession } from "../owner-session.ts";
import {
  familyPackPdfFilename,
  createBookletPdf,
  createParentGuidePdf,
  parentGuidePdfFilename,
  type FamilyPackContext,
} from "./booklet-pdf.ts";
import { createEnvelopeInsertsPdf, envelopeInsertsPdfFilename, type NextKitOffer } from "./envelope.ts";
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
  CLAUDE_MODEL?: string;
  TRIPQUEST_OWNER_EMAIL?: string;
  TRIPQUEST_OWNER_PASSCODE?: string;
  // The "next adventure" card in each kit's mystery envelope: a Stripe
  // promotion code and the line that describes it ("S$3 off ..."). No
  // code, no card, so a kit never carries a code Stripe would refuse.
  TRIPQUEST_NEXT_KIT_CODE?: string;
  TRIPQUEST_NEXT_KIT_OFFER?: string;
  TRIPQUEST_PUBLIC_URL?: string;
};

function nextKitOffer(runtime: RuntimeEnvironment): NextKitOffer | null {
  const code = runtime.TRIPQUEST_NEXT_KIT_CODE?.trim();
  if (!code) return null;
  const site = (runtime.TRIPQUEST_PUBLIC_URL?.trim() || "https://tripquestkids.com").replace(/^https?:\/\//, "").replace(/\/$/, "");
  return { code, offer: runtime.TRIPQUEST_NEXT_KIT_OFFER?.trim() || "A little thank-you off your next kit.", site };
}

const pdfJobs = new Map<string, Promise<Uint8Array>>();

// "booklet" is the child-facing printable booklet, the only file anyone
// downloads. The sticker sheets and parent answer guide belong to the mailed
// explorer kit: only the owner renders them (orders, library) to print.
export type PdfKind = "booklet" | "stickers" | "parent-guide" | "envelope";

export function pdfKindFrom(value: unknown): PdfKind {
  return value === "stickers" || value === "parent-guide" ? value : "booklet";
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
const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// True for the local dev server (vinext dev on localhost). A deployed
// Worker only receives requests whose URL carries the public hostname:
// Cloudflare routes by that hostname, so a request naming "localhost"
// never reaches this Worker in production. The same-origin check on every
// POST (assertSameOriginRequest) already depends on request.url holding
// the browser's real origin, so production checkout and generation would
// fail if it did not.
export function isLocalDevelopmentRequest(request: Request) {
  try {
    return LOCAL_DEVELOPMENT_HOSTS.has(new URL(request.url).hostname);
  } catch {
    return false;
  }
}

// The site owner: the signed-in email the hosting puts on each request
// matches TRIPQUEST_OWNER_EMAIL. On the local dev server (no hosting
// sign-in) whoever runs it is the owner.
// The owner is local development, the hosting's signed-in owner email
// (OpenAI Sites), or a browser signed in at /owner with the passcode.
export function isOwnerRequest(request: Request, runtime: RuntimeEnvironment) {
  if (isLocalDevelopmentRequest(request)) return true;
  if (hasOwnerSession(request, runtime)) return true;
  const owner = runtime.TRIPQUEST_OWNER_EMAIL?.trim().toLocaleLowerCase();
  const visitor = request.headers.get("oai-authenticated-user-email")?.trim().toLocaleLowerCase();
  return Boolean(owner && visitor && owner === visitor);
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

// The default names ("Your child", "Explorer 2", "Sibling 2") all print as
// "Explorer N", so only a real name makes a PDF personal (and uncacheable).
function hasPersonalFamilyNames(input: NormalizedPdfRequest) {
  return input.family.some((child, index) => familyChildDisplayName(child, index) !== `Explorer ${index + 1}`);
}

export async function preparePdf(
  request: Request,
  runtime: RuntimeEnvironment,
  input: NormalizedPdfRequest,
  purchase: PurchaseRecord | null,
  requestedFingerprint = "",
  kind: PdfKind = "booklet",
  print = false,
) {
  if (!runtime.DB || !runtime.BOOKLET_FILES) {
    return Response.json({ error: "PDF storage is not connected yet." }, { status: 503 });
  }
  // A purchase keeps its own cache key and edition snapshot. The key
  // computed now can differ (a newer cache version or model), so it is
  // not compared: callers either matched the purchase to this request
  // (POST) or built the request from the purchase itself (GET, orders).
  const cacheKey = purchase?.cacheKey || await createBookletCacheKey(input.identity);

  // Do not reuse older paid booklet bytes: the preserved edition snapshot is
  // stable, but the renderer can improve. Rendering from the snapshot keeps
  // preview/download aligned after design fixes.
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
  return renderEditionPdf(request, runtime, {
    booklet: storedBooklet,
    editionFingerprint,
    cacheKey,
    input,
    purchase,
    kind,
    print,
  });
}

// The free download (POST /api/pdf). No purchase is needed, but the request
// must name the exact edition shown in the preview, and that edition must
// already be stored for this trip: this renders a booklet that exists and
// never generates one.
export async function prepareFreePdf(
  request: Request,
  runtime: RuntimeEnvironment,
  input: NormalizedPdfRequest,
  body: Record<string, unknown>,
) {
  const requestedFingerprint = typeof body.editionFingerprint === "string"
    ? body.editionFingerprint.trim().toLocaleLowerCase()
    : "";
  if (!/^[a-f0-9]{64}$/.test(requestedFingerprint)) {
    return Response.json(
      { error: "Create this custom booklet again so the PDF can be matched to the exact preview edition." },
      { status: 409 },
    );
  }
  if (pdfKindFrom(body.kind) !== "booklet") {
    return Response.json(
      { error: "The sticker sheets and parent guide come printed in the mailed explorer kit." },
      { status: 402 },
    );
  }
  return preparePdf(request, runtime, input, null, requestedFingerprint, "booklet");
}

export type EditionPdfInput = {
  booklet: GeneratedBookletData;
  editionFingerprint: string;
  cacheKey: string;
  input: NormalizedPdfRequest;
  purchase: PurchaseRecord | null;
  kind: PdfKind;
  // The print-shop file (3mm bleed, A5 trim box), for the owner's orders.
  print?: boolean;
};

const printFilename = (filename: string) => filename.replace(/\.pdf$/i, "-print-3mm-bleed.pdf");

// Renders an already-verified edition: sticker sheets, or the booklet from
// the durable PDF cache when it carries no family names (otherwise it is
// rendered per request, and kept per purchase for a paid one).
export async function renderEditionPdf(
  request: Request,
  runtime: RuntimeEnvironment,
  { booklet: storedBooklet, editionFingerprint, cacheKey, input, purchase, kind, print = false }: EditionPdfInput,
) {
  if (!runtime.DB || !runtime.BOOKLET_FILES) {
    return Response.json({ error: "PDF storage is not connected yet." }, { status: 503 });
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
  if (kind === "envelope") {
    if (!isOwnerRequest(request, runtime)) return Response.json({ error: "Only the TripQuest owner prints envelope inserts." }, { status: 403 });
    const inserts = await createEnvelopeInsertsPdf(
      personalizedBooklet,
      familyPackFor(input.family, input.events, input.days),
      resolveStaticAsset,
      resolveStaticAsset,
      nextKitOffer(runtime),
    );
    return pdfResponse(inserts, envelopeInsertsPdfFilename(personalizedBooklet), "envelope", editionFingerprint);
  }
  if (kind === "parent-guide") {
    if (!purchase && !isOwnerRequest(request, runtime)) {
      return Response.json(
        { error: "The parent guide and answer sheet are included with the paid printable kit." },
        { status: 402 },
      );
    }
    const guide = await createParentGuidePdf(
      personalizedBooklet,
      familyPackFor(input.family, input.events, input.days),
      resolveStaticAsset,
      { resolveImage: resolveStaticAsset, printBleed: print },
    );
    const guideName = parentGuidePdfFilename(personalizedBooklet);
    return pdfResponse(guide, print ? printFilename(guideName) : guideName, "parent-guide", editionFingerprint);
  }
  const filename = familyPackPdfFilename(personalizedBooklet);
  if (print) {
    const familyPack = familyPackFor(input.family, input.events, input.days);
    const pdf = await createBookletPdf(personalizedBooklet, familyPack, resolveStaticAsset, resolveStaticAsset, { printBleed: true });
    return pdfResponse(pdf, printFilename(filename), "print", editionFingerprint);
  }
  const reusablePdf = input.family.length <= 1 && !hasPersonalFamilyNames(input);
  if (reusablePdf) {
    const stored = await readStoredBookletPdf(runtime.DB, runtime.BOOKLET_FILES, cacheKey, Date.now(), editionFingerprint);
    if (stored) return pdfResponse(stored.bytes, filename, "durable", editionFingerprint);
  }

  const jobKey = `${kind}:${purchase?.purchaseId || "free"}:${cacheKey}:${editionFingerprint}:${input.family.map((child, index) => `${index}:${child.name}`).join("|")}`;
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
