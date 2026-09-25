import { applySiblingPlan } from "../../lib/generation/booklet-ai";
import {
  familyPackPdfFilename,
  createBookletPdf,
  type FamilyPackContext,
} from "../../lib/pdf/booklet-pdf";
import {
  familyChildDisplayName,
  mechanicPlanForTrip,
} from "../../lib/family";
import {
  type BookletDatabase,
  type BookletObjectStorage,
  bookletSnapshotFingerprint,
  createBookletCacheKey,
  readStoredBookletArtifact,
  readStoredBooklet,
  readStoredBookletPdf,
  writeStoredBookletPdf,
} from "../../lib/storage/booklet-storage";
import {
  readPurchasePdf,
  readVerifiedPaidPurchase,
  readFamilyId,
  setPurchasePdfKey,
  writePurchasePdf,
  type PaymentRuntime,
  type PurchaseRecord,
} from "../../lib/payment";
import { normalizePdfRequest, type NormalizedPdfRequest } from "../../lib/pdf/request";
import {
  HttpRequestError,
  assertSameOriginRequest,
  readJsonObject,
} from "../../lib/request-security";
import { illustrationStorageKey } from "../../lib/generation/illustration-ai";

export const dynamic = "force-dynamic";

type RuntimeEnvironment = PaymentRuntime & {
  ASSETS?: { fetch(request: Request): Promise<Response> };
  BOOKLET_FILES?: BookletObjectStorage;
  DB?: BookletDatabase;
  KIMI_COMPOSER_MODEL?: string;
  KIMI_RESEARCH_MODEL?: string;
  TRIPQUEST_OWNER_EMAIL?: string;
  TRIPQUEST_PDF_TEST_MODE?: string;
};

const pdfJobs = new Map<string, Promise<Uint8Array>>();

async function getRuntimeEnvironment(): Promise<RuntimeEnvironment> {
  try {
    const workers = await import("cloudflare:workers");
    return workers.env as unknown as RuntimeEnvironment;
  } catch {
    return process.env as RuntimeEnvironment;
  }
}
function isOwnerRequest(request: Request, runtime: RuntimeEnvironment) {
  const owner = runtime.TRIPQUEST_OWNER_EMAIL?.trim().toLocaleLowerCase();
  const visitor = request.headers.get("oai-authenticated-user-email")?.trim().toLocaleLowerCase();
  return Boolean(owner && visitor && owner === visitor);
}

function canPreparePdf(request: Request, runtime: RuntimeEnvironment) {
  return isOwnerRequest(request, runtime) || runtime.TRIPQUEST_PDF_TEST_MODE === "true";
}

function pdfResponse(
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

async function preparePdf(
  request: Request,
  runtime: RuntimeEnvironment,
  input: NormalizedPdfRequest,
  purchase: PurchaseRecord | null,
  requestedFingerprint = "",
) {
  if (!runtime.DB || !runtime.BOOKLET_FILES) {
    return Response.json({ error: "PDF storage is not connected yet." }, { status: 503 });
  }
  const computedCacheKey = await createBookletCacheKey(input.identity);
  if (purchase?.edition && purchase.cacheKey !== computedCacheKey) {
    return Response.json({ error: "This purchase does not match the requested booklet." }, { status: 403 });
  }
  const cacheKey = purchase?.cacheKey || computedCacheKey;

  if (purchase?.pdfKey) {
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
  const filename = familyPackPdfFilename(personalizedBooklet);
  const reusablePdf = input.family.length <= 1 && !hasPersonalFamilyNames(input);
  if (reusablePdf) {
    const stored = await readStoredBookletPdf(runtime.DB, runtime.BOOKLET_FILES, cacheKey, Date.now(), editionFingerprint);
    if (stored) return pdfResponse(stored.bytes, filename, "durable", editionFingerprint);
  }

  const jobKey = `${purchase?.purchaseId || "test"}:${cacheKey}:${input.family.map((child, index) => `${index}:${child.name}`).join("|")}`;
  let job = pdfJobs.get(jobKey);
  if (!job) {
    const familyPack: FamilyPackContext = {
      children: input.family,
      events: input.events,
      mechanicsByDay: mechanicPlanForTrip(input.family, input.days),
    };
    // Also reused as-is for font files (createBookletPdf's resolveFontBytes,
    // below): illustrationStorageKey only matches the R2-backed
    // illustrations/v.../artwork.png shape, so a /fonts/*.ttf path already
    // falls through to the generic ASSETS.fetch branch correctly.
    const resolveStaticAsset = async (path: string) => {
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

function errorResponse(error: unknown) {
  if (error instanceof HttpRequestError) return Response.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : "The PDF could not be created.";
  console.error("[TripQuest PDF]", message);
  const isInputError = /destination|age|trip length|daily plans|day \d+ plan/i.test(message);
  return Response.json({ error: isInputError ? message : "The printable PDF could not be created. Please try again." }, { status: isInputError ? 400 : 500 });
}

async function paidPurchaseForRequest(
  request: Request,
  runtime: RuntimeEnvironment,
  sessionId: string,
  input: NormalizedPdfRequest,
) {
  if (!runtime.DB || !runtime.STRIPE_SECRET_KEY) return null;
  const familyId = readFamilyId(request);
  if (!familyId) return null;
  const purchase = await readVerifiedPaidPurchase(runtime, runtime.DB, sessionId, familyId);
  if (!purchase) return null;
  const cacheKey = await createBookletCacheKey(input.identity);
  return purchase.cacheKey === cacheKey ? purchase : null;
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const runtime = await getRuntimeEnvironment();
    const body = await readJsonObject(request, 32_768);
    const input = normalizePdfRequest(body, runtime.KIMI_RESEARCH_MODEL?.trim() || "kimi-k3", runtime.KIMI_COMPOSER_MODEL?.trim() || "kimi-k2.6");
    let purchase: PurchaseRecord | null = null;
    if (!canPreparePdf(request, runtime)) {
      const sessionId = typeof body.checkoutSessionId === "string" ? body.checkoutSessionId.trim() : "";
      purchase = await paidPurchaseForRequest(request, runtime, sessionId, input);
      if (!purchase) return Response.json({ error: "A completed purchase is required before downloading this PDF." }, { status: 402 });
    }
    const requestedFingerprint = typeof body.editionFingerprint === "string"
      ? body.editionFingerprint.trim().toLocaleLowerCase()
      : "";
    if (!/^[a-f0-9]{64}$/.test(requestedFingerprint)) {
      return Response.json(
        { error: "Create this custom booklet again so the PDF can be matched to the exact preview edition." },
        { status: 409 },
      );
    }
    return preparePdf(request, runtime, input, purchase, requestedFingerprint);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const runtime = await getRuntimeEnvironment();
    const sessionId = new URL(request.url).searchParams.get("session_id")?.trim() || "";
    if (!runtime.DB || !runtime.BOOKLET_FILES || !sessionId) {
      return Response.json({ error: "A completed checkout session is required." }, { status: 400 });
    }
    const familyId = readFamilyId(request);
    if (!familyId) return Response.json({ error: "The purchase session is missing its family device token." }, { status: 403 });
    const purchase = await readVerifiedPaidPurchase(runtime, runtime.DB, sessionId, familyId);
    if (!purchase) return Response.json({ error: "Payment has not completed or this purchase is not valid." }, { status: 402 });
    const requestValue = JSON.parse(purchase.requestJson) as Record<string, unknown>;
    const input = normalizePdfRequest(requestValue, runtime.KIMI_RESEARCH_MODEL?.trim() || "kimi-k3", runtime.KIMI_COMPOSER_MODEL?.trim() || "kimi-k2.6");
    return preparePdf(request, runtime, input, purchase);
  } catch (error) {
    return errorResponse(error);
  }
}
