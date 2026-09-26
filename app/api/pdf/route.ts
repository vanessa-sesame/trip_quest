import {
  readFamilyId,
  readVerifiedPaidPurchase,
  type PurchaseRecord,
} from "../../lib/payment";
import { normalizePdfRequest, type NormalizedPdfRequest } from "../../lib/pdf/request";
import {
  canPreparePdf,
  errorResponse,
  getRuntimeEnvironment,
  pdfKindFrom,
  preparePdf,
  type RuntimeEnvironment,
} from "../../lib/pdf/serve";
import { assertSameOriginRequest, readJsonObject } from "../../lib/request-security";
import { createBookletCacheKey } from "../../lib/storage/booklet-storage";

export const dynamic = "force-dynamic";

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
    return preparePdf(request, runtime, input, purchase, requestedFingerprint, pdfKindFrom(body.kind));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const runtime = await getRuntimeEnvironment();
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("session_id")?.trim() || "";
    if (!runtime.DB || !runtime.BOOKLET_FILES || !sessionId) {
      return Response.json({ error: "A completed checkout session is required." }, { status: 400 });
    }
    const familyId = readFamilyId(request);
    if (!familyId) return Response.json({ error: "The purchase session is missing its family device token." }, { status: 403 });
    const purchase = await readVerifiedPaidPurchase(runtime, runtime.DB, sessionId, familyId);
    if (!purchase) return Response.json({ error: "Payment has not completed or this purchase is not valid." }, { status: 402 });
    const requestValue = JSON.parse(purchase.requestJson) as Record<string, unknown>;
    const input = normalizePdfRequest(requestValue, runtime.KIMI_RESEARCH_MODEL?.trim() || "kimi-k3", runtime.KIMI_COMPOSER_MODEL?.trim() || "kimi-k2.6");
    return preparePdf(request, runtime, input, purchase, "", pdfKindFrom(url.searchParams.get("kind")));
  } catch (error) {
    return errorResponse(error);
  }
}
