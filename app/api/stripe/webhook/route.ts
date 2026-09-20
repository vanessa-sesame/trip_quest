import type { BookletDatabase } from "../../../booklet-storage";
import {
  markPurchasePaidFromStripeSession,
  parseStripeEvent,
  verifyStripeSignature,
  type PaymentRuntime,
} from "../../../payment";

export const dynamic = "force-dynamic";

type RuntimeEnvironment = PaymentRuntime & { DB?: BookletDatabase };

async function getRuntimeEnvironment(): Promise<RuntimeEnvironment> {
  try {
    const workers = await import("cloudflare:workers");
    return workers.env as unknown as RuntimeEnvironment;
  } catch {
    return process.env as RuntimeEnvironment;
  }
}

export async function POST(request: Request) {
  const runtime = await getRuntimeEnvironment();
  const signature = request.headers.get("stripe-signature") || "";
  const secret = runtime.STRIPE_WEBHOOK_SECRET?.trim() || "";
  if (!secret || !runtime.DB || !signature) return new Response("Webhook is not configured.", { status: 503 });

  const payload = await request.text();
  if (!(await verifyStripeSignature(payload, signature, secret))) {
    return new Response("Invalid signature.", { status: 400 });
  }

  try {
    const event = parseStripeEvent(payload);
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data?.object;
      if (session?.id) {
        const marked = await markPurchasePaidFromStripeSession(runtime.DB, session);
        if (!marked) {
          return new Response("Purchase record is not ready for this paid session.", { status: 409 });
        }
      }
    }
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("[TripQuest Stripe webhook]", error instanceof Error ? error.message : error);
    return new Response("Webhook could not be processed.", { status: 500 });
  }
}
