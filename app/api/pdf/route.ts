import {
  readFamilyId,
  readVerifiedPaidPurchase,
} from "../../lib/payment";
import { claudeModelFrom } from "../../lib/generation/claude";
import { normalizePdfRequest } from "../../lib/pdf/request";
import {
  errorResponse,
  getRuntimeEnvironment,
  pdfKindFrom,
  prepareFreePdf,
  preparePdf,
} from "../../lib/pdf/serve";
import { assertSameOriginRequest, readJsonObject } from "../../lib/request-security";

export const dynamic = "force-dynamic";

// The printable PDF is free: anyone who created a booklet may download its
// booklet PDF and sticker sheets (see prepareFreePdf for the edition check).
export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const runtime = await getRuntimeEnvironment();
    const body = await readJsonObject(request, 32_768);
    const input = normalizePdfRequest(body, claudeModelFrom(runtime), claudeModelFrom(runtime));
    return prepareFreePdf(request, runtime, input, body);
  } catch (error) {
    return errorResponse(error);
  }
}

// Past purchasers (and kit buyers returning from Stripe) download the exact
// edition their checkout preserved.
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
    const input = normalizePdfRequest(requestValue, claudeModelFrom(runtime), claudeModelFrom(runtime));
    return preparePdf(request, runtime, input, purchase, "", pdfKindFrom(url.searchParams.get("kind")));
  } catch (error) {
    return errorResponse(error);
  }
}
