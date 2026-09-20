import {
  createBookletCacheKey,
  readStoredBookletReference,
  type BookletDatabase,
  type BookletObjectStorage,
} from "../../booklet-storage";
import { normalizePdfRequest } from "../../pdf-request";
import {
  createCheckoutSession,
  familyCookie,
  paymentIsConfigured,
  readFamilyId,
  writePendingPurchase,
  type PaymentRuntime,
} from "../../payment";
import {
  HttpRequestError,
  assertSameOriginRequest,
  readJsonObject,
} from "../../request-security";

export const dynamic = "force-dynamic";

type RuntimeEnvironment = PaymentRuntime & {
  DB?: BookletDatabase;
  BOOKLET_FILES?: BookletObjectStorage;
  KIMI_COMPOSER_MODEL?: string;
  KIMI_RESEARCH_MODEL?: string;
};

async function getRuntimeEnvironment(): Promise<RuntimeEnvironment> {
  try {
    const workers = await import("cloudflare:workers");
    return workers.env as unknown as RuntimeEnvironment;
  } catch {
    return process.env as RuntimeEnvironment;
  }
}

function response(body: unknown, familyId?: string, status = 200) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json",
  });
  if (familyId) headers.set("Set-Cookie", familyCookie(familyId));
  return Response.json(body, { status, headers });
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const runtime = await getRuntimeEnvironment();
    if (!runtime.DB || !runtime.BOOKLET_FILES) {
      return response({ error: "Payment storage is not connected yet." }, undefined, 503);
    }
    if (!paymentIsConfigured(runtime)) {
      return response({ error: "Secure payment is not connected yet. No charge was made." }, undefined, 503);
    }

    const body = await readJsonObject(request, 32_768);
    const input = normalizePdfRequest(
      body,
      runtime.KIMI_RESEARCH_MODEL?.trim() || "kimi-k3",
      runtime.KIMI_COMPOSER_MODEL?.trim() || "kimi-k2.6",
    );
    const cacheKey = await createBookletCacheKey(input.identity);
    const edition = await readStoredBookletReference(
      runtime.DB,
      runtime.BOOKLET_FILES,
      cacheKey,
      input.identity,
    );
    if (!edition) {
      return response({ error: "Create this custom booklet before starting checkout." }, undefined, 404);
    }
    const requestedFingerprint = typeof body.editionFingerprint === "string"
      ? body.editionFingerprint.trim().toLocaleLowerCase()
      : "";
    if (!/^[a-f0-9]{64}$/.test(requestedFingerprint)) {
      return response(
        { error: "Create this custom booklet again before checkout so its exact edition can be verified." },
        undefined,
        409,
      );
    }
    if (requestedFingerprint !== edition.fingerprint) {
      return response(
        { error: "This preview has changed. Create the booklet again before checkout so the preview and PDF stay identical." },
        undefined,
        409,
      );
    }

    const familyId = readFamilyId(request) || crypto.randomUUID();
    const purchaseId = crypto.randomUUID();
    const session = await createCheckoutSession(runtime, request, {
      purchaseId,
      cacheKey,
      familyId,
      edition: { artifactKey: edition.artifactKey, fingerprint: edition.fingerprint },
    });
    if (!session.id || !session.url) throw new Error("Stripe did not return a checkout link.");
    const requestJson = JSON.stringify({
      destination: input.destination,
      age: input.age,
      days: input.days,
      itinerary: input.itinerary,
      family: input.family,
      events: input.events,
      editionArtifactKey: edition.artifactKey,
      editionFingerprint: edition.fingerprint,
    });
    const amountCents = Number(runtime.STRIPE_PRICE_CENTS || "99");
    const currency = runtime.STRIPE_CURRENCY?.trim().toLocaleLowerCase() || "usd";
    await writePendingPurchase(runtime.DB, {
      purchaseId,
      checkoutSessionId: session.id,
      familyId,
      cacheKey,
      requestJson,
    }, Number.isInteger(amountCents) && amountCents > 0 ? amountCents : 99, currency);

    return response({ url: session.url, editionFingerprint: edition.fingerprint }, familyId);
  } catch (error) {
    if (error instanceof HttpRequestError) return response({ error: error.message }, undefined, error.status);
    const message = error instanceof Error ? error.message : "Secure checkout could not be started.";
    console.error("[TripQuest checkout]", message);
    return response({ error: /destination|age|trip length|daily plans|family/i.test(message) ? message : "Secure checkout could not be started. No charge was made." }, undefined, 400);
  }
}
