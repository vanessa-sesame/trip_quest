import { applySiblingPlan } from "../../booklet-ai";
import {
  familyPackPdfFilename,
  createBookletPdf,
  type FamilyPackContext,
} from "../../booklet-pdf";
import {
  familyChildDisplayName,
  mechanicPlanForTrip,
} from "../../family";
import {
  type BookletDatabase,
  type BookletObjectStorage,
  createBookletCacheKey,
  readStoredBooklet,
  readStoredBookletPdf,
  writeStoredBookletPdf,
} from "../../booklet-storage";
import {
  readPurchasePdf,
  readVerifiedPaidPurchase,
  readFamilyId,
  setPurchasePdfKey,
  writePurchasePdf,
  type PaymentRuntime,
  type PurchaseRecord,
} from "../../payment";
import { normalizePdfRequest, type NormalizedPdfRequest } from "../../pdf-request";
import {
  HttpRequestError,
  assertSameOriginRequest,
  readJsonObject,
} from "../../request-security";

export const dynamic = "force-dynamic";

type RuntimeEnvironment = PaymentRuntime & {
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

function pdfResponse(bytes: ArrayBuffer | Uint8Array, filename: string, cache: string) {
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
  runtime: RuntimeEnvironment,
  input: NormalizedPdfRequest,
  purchase: PurchaseRecord | null,
) {
  if (!runtime.DB || !runtime.BOOKLET_FILES) {
    return Response.json({ error: "PDF storage is not connected yet." }, { status: 503 });
  }
  const cacheKey = await createBookletCacheKey(input.identity);
  if (purchase && purchase.cacheKey !== cacheKey) {
    return Response.json({ error: "This purchase does not match the requested booklet." }, { status: 403 });
  }
  const booklet = await readStoredBooklet(runtime.DB, runtime.BOOKLET_FILES, cacheKey, input.identity);
  if (!booklet) {
    return Response.json({ error: "Create this custom booklet before downloading its PDF." }, { status: 404 });
  }

  const personalizedBooklet = applySiblingPlan(booklet, input.family);
  const filename = familyPackPdfFilename(personalizedBooklet);
  const reusablePdf = input.family.length <= 1 && !hasPersonalFamilyNames(input);

  if (purchase?.pdfKey) {
    const storedPurchasePdf = await readPurchasePdf(runtime.BOOKLET_FILES, purchase.pdfKey);
    if (storedPurchasePdf) return pdfResponse(storedPurchasePdf, filename, "purchase");
  }
  if (reusablePdf) {
    const stored = await readStoredBookletPdf(runtime.DB, runtime.BOOKLET_FILES, cacheKey);
    if (stored) return pdfResponse(stored.bytes, filename, "durable");
  }

  const jobKey = `${purchase?.purchaseId || "test"}:${cacheKey}:${input.family.map((child, index) => `${index}:${child.name}`).join("|")}`;
  let job = pdfJobs.get(jobKey);
  if (!job) {
    const familyPack: FamilyPackContext = {
      children: input.family,
      events: input.events,
      mechanicsByDay: mechanicPlanForTrip(input.family, input.days),
    };
    job = createBookletPdf(personalizedBooklet, familyPack);
    pdfJobs.set(jobKey, job);
    void job.finally(() => pdfJobs.delete(jobKey)).catch(() => undefined);
  }
  const pdf = await job;
  if (reusablePdf) {
    await writeStoredBookletPdf(runtime.DB, runtime.BOOKLET_FILES, { cacheKey, filename, pdf });
  }
  if (purchase && !reusablePdf) {
    const pdfKey = await writePurchasePdf(runtime.BOOKLET_FILES, purchase.purchaseId, filename, pdf);
    await setPurchasePdfKey(runtime.DB, purchase.purchaseId, pdfKey);
  }
  return pdfResponse(pdf, filename, purchase ? "purchase-generated" : reusablePdf ? "generated" : "family-generated");
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
    return preparePdf(runtime, input, purchase);
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
    return preparePdf(runtime, input, purchase);
  } catch (error) {
    return errorResponse(error);
  }
}
