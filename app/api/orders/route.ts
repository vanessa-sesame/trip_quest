import {
  listKitOrders,
  readPurchaseById,
  setFulfilmentStatus,
  type PurchaseRecord,
} from "../../lib/payment";
import { claudeModelFrom } from "../../lib/generation/claude";
import { createPackingSlipPdf } from "../../lib/pdf/packing-slip";
import { normalizePdfRequest } from "../../lib/pdf/request";
import {
  errorResponse,
  getRuntimeEnvironment,
  isOwnerRequest,
  pdfResponse,
  preparePdf,
  staticAssetResolver,
  type RuntimeEnvironment,
} from "../../lib/pdf/serve";
import { fulfilmentStatusFrom } from "../../lib/products";
import { assertSameOriginRequest, readJsonObject } from "../../lib/request-security";

export const dynamic = "force-dynamic";

// The owner's kit queue: paid kit orders with their shipping details, the
// files to print for each (booklet, sticker sheets, packing slip), and
// "printed" / "shipped" marks. Only the site owner may use it.

function ownerOnly() {
  return Response.json({ error: "Only the TripQuest owner can see orders." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
}

function orderInput(purchase: PurchaseRecord, runtime: RuntimeEnvironment) {
  return normalizePdfRequest(
    JSON.parse(purchase.requestJson) as Record<string, unknown>,
    claudeModelFrom(runtime), claudeModelFrom(runtime),
  );
}

function orderSummary(purchase: PurchaseRecord & { amountCents: number; currency: string; createdAt: number }, runtime: RuntimeEnvironment) {
  let trip: { destination: string; age: number; days: number; children: Array<{ name: string; age: number }> } | null = null;
  try {
    const input = orderInput(purchase, runtime);
    trip = {
      destination: input.destination,
      age: input.age,
      days: input.days,
      children: input.family.map((child) => ({ name: child.name, age: child.age })),
    };
  } catch {
    trip = null;
  }
  return {
    id: purchase.purchaseId,
    reference: purchase.purchaseId.slice(0, 8).toUpperCase(),
    createdAt: purchase.createdAt,
    amountCents: purchase.amountCents,
    currency: purchase.currency,
    fulfilmentStatus: purchase.fulfilmentStatus ?? "new",
    shipping: purchase.shipping,
    edition: purchase.edition?.fingerprint.slice(0, 8).toUpperCase() ?? "",
    trip,
  };
}

export async function GET(request: Request) {
  try {
    const runtime = await getRuntimeEnvironment();
    if (!isOwnerRequest(request, runtime)) return ownerOnly();
    if (!runtime.DB) return Response.json({ error: "Order storage is not connected yet." }, { status: 503 });
    const url = new URL(request.url);
    const id = url.searchParams.get("id")?.trim() || "";
    if (!id) {
      const orders = await listKitOrders(runtime.DB);
      return Response.json({ orders: orders.map((order) => orderSummary(order, runtime)) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const purchase = await readPurchaseById(runtime.DB, id);
    if (!purchase || purchase.status !== "paid") return Response.json({ error: "Order not found." }, { status: 404 });
    const file = url.searchParams.get("file");
    const input = orderInput(purchase, runtime);
    if (file === "slip") {
      const slip = await createPackingSlipPdf({
        purchaseId: purchase.purchaseId,
        createdAt: purchase.createdAt,
        shipping: purchase.shipping,
        destination: input.destination,
        age: input.age,
        days: input.days,
        family: input.family,
        editionFingerprint: purchase.edition?.fingerprint,
      }, staticAssetResolver(request, runtime));
      return pdfResponse(slip, `tripquest-packing-slip-${purchase.purchaseId.slice(0, 8)}.pdf`, "generated");
    }
    const kind = file === "stickers" || file === "parent-guide" ? file : "booklet";
    return preparePdf(request, runtime, input, purchase, "", kind, url.searchParams.get("print") === "1" && kind !== "stickers");
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const runtime = await getRuntimeEnvironment();
    if (!isOwnerRequest(request, runtime)) return ownerOnly();
    if (!runtime.DB) return Response.json({ error: "Order storage is not connected yet." }, { status: 503 });
    const body = await readJsonObject(request, 1_024);
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const status = fulfilmentStatusFrom(body.status);
    if (!id || !status) return Response.json({ error: "Choose an order and a status." }, { status: 400 });
    const updated = await setFulfilmentStatus(runtime.DB, id, status);
    if (!updated) return Response.json({ error: "Order not found." }, { status: 404 });
    return Response.json({ id, fulfilmentStatus: status });
  } catch (error) {
    return errorResponse(error);
  }
}
