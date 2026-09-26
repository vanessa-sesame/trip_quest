import assert from "node:assert/strict";
import test from "node:test";
import { bookletArtifactKey } from "../app/lib/storage/booklet-storage.ts";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { PDFDocument } from "pdf-lib";
import type { BookletDatabase } from "../app/lib/storage/booklet-storage.ts";
import {
  createCheckoutSession,
  listKitOrders,
  markPurchasePaidFromStripeSession,
  paymentAmount,
  paymentCurrency,
  purchaseEditionFromRequestJson,
  readPurchaseById,
  setFulfilmentStatus,
  shippingFromStripeSession,
  verifyStripeSignature,
  writePendingPurchase,
} from "../app/lib/payment.ts";
import { PRODUCTS } from "../app/lib/products.ts";
import { normalizeFamilyChildren } from "../app/lib/family.ts";
import { createPackingSlipPdf, kitPackingList } from "../app/lib/pdf/packing-slip.ts";
import { isOwnerRequest } from "../app/lib/pdf/serve.ts";

test("Stripe webhook signatures accept a fresh HMAC and reject stale or altered payloads", async () => {
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  const secret = "whsec_test_secret";
  const now = 1_700_000_000_000;
  const timestamp = String(now / 1_000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Array.from(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${payload}`))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const header = `t=${timestamp},v1=${signature}`;

  assert.equal(await verifyStripeSignature(payload, header, secret, now), true);
  assert.equal(await verifyStripeSignature(`${payload}.`, header, secret, now), false);
  assert.equal(await verifyStripeSignature(payload, header, secret, now + 301_000), false);
});

test("purchase requests preserve a validated edition artifact and fingerprint", () => {
  const edition = {
    editionArtifactKey: bookletArtifactKey("a".repeat(64), "b".repeat(64)),
    editionFingerprint: "B".repeat(64),
  };
  assert.deepEqual(
    purchaseEditionFromRequestJson(JSON.stringify(edition)),
    {
      artifactKey: edition.editionArtifactKey,
      fingerprint: edition.editionFingerprint.toLocaleLowerCase(),
    },
  );
  assert.equal(
    purchaseEditionFromRequestJson(JSON.stringify({
      ...edition,
      editionFingerprint: "wrong",
    })),
    null,
  );
  assert.equal(
    purchaseEditionFromRequestJson(JSON.stringify({
      ...edition,
      editionArtifactKey: "booklets/old-version/not-safe/booklet.json",
    })),
    null,
  );
});

function createOrdersDatabase(): BookletDatabase {
  const sqlite = new DatabaseSync(":memory:");
  const migrationsDirectory = new URL("../drizzle/", import.meta.url);
  for (const filename of readdirSync(migrationsDirectory).filter((name) => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(new URL(filename, migrationsDirectory), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }
  return {
    prepare(query) {
      const statement = sqlite.prepare(query);
      let values: Array<string | number | null> = [];
      const prepared = {
        bind(...nextValues: Array<string | number | null>) {
          values = nextValues;
          return prepared;
        },
        async first<T>() {
          return (statement.get(...values) ?? null) as T | null;
        },
        async run() {
          return { meta: { changes: Number(statement.run(...values).changes) } };
        },
        async all<T>() {
          return { results: statement.all(...values) as T[] };
        },
      };
      return prepared;
    },
  };
}

async function checkoutForm(product: "kit" | "pdf") {
  const originalFetch = globalThis.fetch;
  let body = "";
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    body = String(init?.body ?? "");
    return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.test/1" }), { status: 200 });
  }) as typeof fetch;
  try {
    await createCheckoutSession(
      { STRIPE_SECRET_KEY: "sk_test_123" },
      new Request("https://tripquest.test/api/checkout"),
      { purchaseId: "p1", cacheKey: "c1", familyId: "f".repeat(20), edition: { artifactKey: "a", fingerprint: "b" }, product },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  return new URLSearchParams(body);
}

test("a kit checkout collects a Singapore address and phone; a PDF checkout does not", async () => {
  const kit = await checkoutForm("kit");
  assert.equal(kit.get("shipping_address_collection[allowed_countries][0]"), "SG");
  assert.equal(kit.get("phone_number_collection[enabled]"), "true");
  assert.equal(kit.get("line_items[0][price_data][unit_amount]"), "1990");
  assert.equal(kit.get("line_items[0][price_data][currency]"), "sgd");
  assert.equal(kit.get("line_items[0][price_data][product_data][name]"), PRODUCTS.kit.name);
  assert.equal(kit.get("metadata[product]"), "kit");
  assert.match(kit.get("success_url") ?? "", /product=kit/);

  const pdf = await checkoutForm("pdf");
  assert.equal(pdf.get("shipping_address_collection[allowed_countries][0]"), null);
  assert.equal(pdf.get("phone_number_collection[enabled]"), null);
  assert.equal(pdf.get("line_items[0][price_data][unit_amount]"), "99");
});

test("prices and currency come from one place, with env overrides", () => {
  assert.equal(paymentAmount({}, "kit"), 1990);
  assert.equal(paymentAmount({}, "pdf"), 99);
  assert.equal(paymentAmount({ STRIPE_KIT_PRICE_CENTS: "2490" }, "kit"), 2490);
  assert.equal(paymentAmount({ STRIPE_KIT_PRICE_CENTS: "oops" }, "kit"), 1990);
  assert.equal(paymentCurrency({}), "sgd");
});

test("a paid kit keeps its shipping details and moves through the print queue", async () => {
  const database = createOrdersDatabase();
  const purchaseId = "11111111-2222-3333-4444-555555555555";
  await writePendingPurchase(database, {
    purchaseId,
    checkoutSessionId: "cs_kit_1",
    familyId: "f".repeat(20),
    cacheKey: "cache-1",
    requestJson: JSON.stringify({ destination: "Barcelona" }),
    product: "kit",
  }, 1990, "sgd");
  await writePendingPurchase(database, {
    purchaseId: "99999999-2222-3333-4444-555555555555",
    checkoutSessionId: "cs_pdf_1",
    familyId: "f".repeat(20),
    cacheKey: "cache-2",
    requestJson: "{}",
  }, 99, "sgd");

  const marked = await markPurchasePaidFromStripeSession(database, {
    id: "cs_kit_1",
    payment_status: "paid",
    metadata: { purchase_id: purchaseId, cache_key: "cache-1", family_id: "f".repeat(20) },
    customer_details: { name: "Ana Tan", email: "ana@example.com", phone: "+6590000000" },
    collected_information: {
      shipping_details: { name: "Ana Tan", address: { line1: "1 Orchard Road", line2: "#05-01", city: "", postal_code: "238824", country: "SG" } },
    },
  });
  assert.equal(marked, true);

  const orders = await listKitOrders(database);
  assert.equal(orders.length, 1, "only paid kits are listed");
  assert.equal(orders[0].fulfilmentStatus, "new");
  assert.equal(orders[0].shipping?.address.postalCode, "238824");
  assert.equal(orders[0].shipping?.phone, "+6590000000");
  assert.equal(orders[0].amountCents, 1990);

  assert.equal(await setFulfilmentStatus(database, purchaseId, "printed"), true);
  assert.equal(await setFulfilmentStatus(database, "99999999-2222-3333-4444-555555555555", "printed"), false, "PDF purchases are not kits");
  assert.equal((await readPurchaseById(database, purchaseId))?.fulfilmentStatus, "printed");
});

test("older Stripe sessions put shipping in shipping_details", () => {
  const shipping = shippingFromStripeSession({
    id: "cs_1",
    shipping_details: { name: "Wei", address: { line1: "2 Bishan St", postal_code: "570002", country: "SG" } },
  });
  assert.equal(shipping?.name, "Wei");
  assert.equal(shipping?.address.line1, "2 Bishan St");
  assert.equal(shippingFromStripeSession({ id: "cs_2" }), null);
});

test("only the owner's signed-in email may use the orders queue", () => {
  const runtime = { TRIPQUEST_OWNER_EMAIL: "Owner@Example.com" };
  const request = (email?: string) => new Request("https://tripquest.test/api/orders", { headers: email ? { "oai-authenticated-user-email": email } : {} });
  assert.equal(isOwnerRequest(request("owner@example.com"), runtime), true);
  assert.equal(isOwnerRequest(request("someone@example.com"), runtime), false);
  assert.equal(isOwnerRequest(request(), runtime), false);
  assert.equal(isOwnerRequest(request("owner@example.com"), {}), false);
});

test("a packing slip is one A5 page with the address label", async () => {
  const bytes = await createPackingSlipPdf({
    purchaseId: "11111111-2222-3333-4444-555555555555",
    createdAt: Date.UTC(2026, 8, 26),
    shipping: { name: "Ana Tan", phone: "+6590000000", email: "", address: { line1: "1 Orchard Road", line2: "", city: "", postalCode: "238824", country: "SG" } },
    destination: "Barcelona",
    age: 9,
    days: 3,
    family: normalizeFamilyChildren([{ name: "Mia", age: 9 }]),
    editionFingerprint: "e0e46375" + "0".repeat(56),
  });
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 1);
  assert.ok(Math.abs(document.getPage(0).getWidth() - 419.53) < 0.1);
  assert.equal(kitPackingList({ editionFingerprint: "e0e46375" }).length, 6);
});
