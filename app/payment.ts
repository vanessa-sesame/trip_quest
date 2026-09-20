import type { BookletDatabase, BookletObjectStorage } from "./booklet-storage";

export type PaymentRuntime = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  STRIPE_PRICE_CENTS?: string;
  STRIPE_CURRENCY?: string;
  TRIPQUEST_PUBLIC_URL?: string;
};

export type PurchaseRecord = {
  purchaseId: string;
  checkoutSessionId: string;
  familyId: string;
  cacheKey: string;
  requestJson: string;
  status: "pending" | "paid" | "failed";
  pdfKey: string | null;
};

type StripeSession = {
  id: string;
  url?: string | null;
  payment_status?: string;
  metadata?: Record<string, string>;
  client_reference_id?: string | null;
};

const STRIPE_API = "https://api.stripe.com/v1";
const encoder = new TextEncoder();

function secret(runtime: PaymentRuntime) {
  return runtime.STRIPE_SECRET_KEY?.trim() || "";
}

function safeFamilyId(value: string) {
  return /^[a-z0-9_-]{16,128}$/i.test(value) ? value : "";
}

export function readFamilyId(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const value = cookie.match(/(?:^|;\s*)tripquest_family_id=([^;]+)/)?.[1] || "";
  return safeFamilyId(value);
}

export function familyCookie(familyId: string) {
  return `tripquest_family_id=${familyId}; Max-Age=31536000; Path=/; SameSite=Lax; HttpOnly; Secure`;
}

export function paymentIsConfigured(runtime: PaymentRuntime) {
  const cents = Number(runtime.STRIPE_PRICE_CENTS || "99");
  return Boolean(secret(runtime) && (runtime.STRIPE_PRICE_ID?.trim() || Number.isInteger(cents) && cents > 0));
}

function paymentAmount(runtime: PaymentRuntime) {
  const amount = Number(runtime.STRIPE_PRICE_CENTS || "99");
  return Number.isInteger(amount) && amount > 0 ? amount : 99;
}

function currency(runtime: PaymentRuntime) {
  const value = runtime.STRIPE_CURRENCY?.trim().toLocaleLowerCase() || "sgd";
  return /^[a-z]{3}$/.test(value) ? value : "sgd";
}

function publicUrl(runtime: PaymentRuntime, request: Request) {
  const configured = runtime.TRIPQUEST_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  return new URL(request.url).origin;
}

async function stripeRequest<T>(runtime: PaymentRuntime, path: string, init: RequestInit = {}) {
  const response = await fetch(`${STRIPE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret(runtime)}`,
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message || `Stripe request failed (${response.status}).`);
  }
  return payload;
}

export async function createCheckoutSession(
  runtime: PaymentRuntime,
  request: Request,
  input: { purchaseId: string; cacheKey: string; familyId: string },
) {
  if (!paymentIsConfigured(runtime)) {
    throw new Error("Secure payment is not connected yet. Add the Stripe keys before accepting purchases.");
  }
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("line_items[0][quantity]", "1");
  const priceId = runtime.STRIPE_PRICE_ID?.trim();
  if (priceId) {
    form.set("line_items[0][price]", priceId);
  } else {
    form.set("line_items[0][price_data][currency]", currency(runtime));
    form.set("line_items[0][price_data][unit_amount]", String(paymentAmount(runtime)));
    form.set("line_items[0][price_data][product_data][name]", "TripQuest printable family booklet");
  }
  form.set("success_url", `${publicUrl(runtime, request)}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${publicUrl(runtime, request)}/?checkout=cancelled`);
  form.set("client_reference_id", input.purchaseId);
  form.set("metadata[purchase_id]", input.purchaseId);
  form.set("metadata[cache_key]", input.cacheKey);
  form.set("metadata[family_id]", input.familyId);
  return stripeRequest<StripeSession>(runtime, "/checkout/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

export async function readPurchaseBySession(database: BookletDatabase, sessionId: string) {
  const row = await database
    .prepare(`SELECT purchase_id AS purchaseId, checkout_session_id AS checkoutSessionId,
      family_id AS familyId, cache_key AS cacheKey, request_json AS requestJson,
      status, pdf_key AS pdfKey FROM purchase_entitlements WHERE checkout_session_id = ?`)
    .bind(sessionId)
    .first<Record<string, string | null>>();
  if (!row || !row.purchaseId || !row.checkoutSessionId || !row.familyId || !row.cacheKey || !row.requestJson) return null;
  if (row.status !== "pending" && row.status !== "paid" && row.status !== "failed") return null;
  return {
    purchaseId: row.purchaseId,
    checkoutSessionId: row.checkoutSessionId,
    familyId: row.familyId,
    cacheKey: row.cacheKey,
    requestJson: row.requestJson,
    status: row.status,
    pdfKey: row.pdfKey,
  } satisfies PurchaseRecord;
}

export async function writePendingPurchase(
  database: BookletDatabase,
  input: Omit<PurchaseRecord, "status" | "pdfKey">,
  amountCents: number,
  currencyCode: string,
) {
  const now = Date.now();
  await database.prepare(`INSERT INTO purchase_entitlements
    (purchase_id, checkout_session_id, family_id, cache_key, request_json, status, amount_cents, currency, pdf_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, NULL, ?, ?)`)
    .bind(input.purchaseId, input.checkoutSessionId, input.familyId, input.cacheKey, input.requestJson, amountCents, currencyCode, now, now)
    .run();
}

export async function markPurchasePaid(database: BookletDatabase, purchaseId: string, sessionId: string) {
  await database.prepare(`UPDATE purchase_entitlements
    SET status = 'paid', updated_at = ?
    WHERE purchase_id = ? AND checkout_session_id = ? AND status != 'paid'`)
    .bind(Date.now(), purchaseId, sessionId)
    .run();
}

export async function setPurchasePdfKey(database: BookletDatabase, purchaseId: string, pdfKey: string) {
  await database.prepare("UPDATE purchase_entitlements SET pdf_key = ?, updated_at = ? WHERE purchase_id = ?")
    .bind(pdfKey, Date.now(), purchaseId)
    .run();
}

export async function readVerifiedPaidPurchase(
  runtime: PaymentRuntime,
  database: BookletDatabase,
  sessionId: string,
  familyId: string,
) {
  if (!sessionId || sessionId.length > 200 || !familyId) return null;
  const purchase = await readPurchaseBySession(database, sessionId);
  if (!purchase || purchase.familyId !== familyId) return null;
  let session: StripeSession;
  try {
    session = await stripeRequest<StripeSession>(runtime, `/checkout/sessions/${encodeURIComponent(sessionId)}`);
  } catch {
    return null;
  }
  const metadata = session.metadata || {};
  if (
    session.id !== purchase.checkoutSessionId ||
    metadata.purchase_id !== purchase.purchaseId ||
    metadata.cache_key !== purchase.cacheKey ||
    metadata.family_id !== purchase.familyId ||
    session.payment_status !== "paid"
  ) return null;
  await markPurchasePaid(database, purchase.purchaseId, session.id);
  return { ...purchase, status: "paid" as const };
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function verifyStripeSignature(payload: string, signature: string, webhookSecret: string, now = Date.now()) {
  const timestamp = signature.match(/(?:^|,)t=(\d+)(?:,|$)/)?.[1];
  const signatures = [...signature.matchAll(/(?:^|,)v1=([a-f0-9]+)(?:,|$)/gi)].map((match) => match[1]);
  if (!timestamp || !signatures.length || Math.abs(now - Number(timestamp) * 1_000) > 300_000) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`)));
  return signatures.some((candidate) => constantTimeEqual(candidate.toLocaleLowerCase(), expected));
}

export function purchasePdfKey(purchaseId: string) {
  return `purchases/${purchaseId}/booklet.pdf`;
}

export async function readPurchasePdf(artifacts: BookletObjectStorage, key: string) {
  if (!key.startsWith("purchases/") || !key.endsWith("/booklet.pdf")) return null;
  const object = await artifacts.get(key);
  if (!object?.arrayBuffer) return null;
  return object.arrayBuffer();
}

export async function writePurchasePdf(
  artifacts: BookletObjectStorage,
  purchaseId: string,
  filename: string,
  pdf: ArrayBuffer | ArrayBufferView,
) {
  const key = purchasePdfKey(purchaseId);
  await artifacts.put(key, pdf, {
    httpMetadata: {
      cacheControl: "private, no-store",
      contentDisposition: `attachment; filename="${filename}"`,
      contentType: "application/pdf",
    },
    customMetadata: { filename, purpose: "paid-purchase-pdf" },
  });
  return key;
}

export function parseStripeEvent(payload: string) {
  return JSON.parse(payload) as {
    type?: string;
    data?: { object?: StripeSession };
  };
}
