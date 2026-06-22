import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

// Stripe needs the raw request body to verify the signature, so this route must
// run on the Node runtime and read text() rather than json().
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return new Response("Stripe not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return new Response(`Webhook signature verification failed: ${message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid") {
      await applyUpgrade(session.id);
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}

// Flip the pending upgrade to PAID and raise the group's cap. Idempotent: a
// replayed webhook finds the row already PAID and does nothing, and the cap is
// only ever raised (never lowered) via Math.max.
async function applyUpgrade(stripeSessionId: string): Promise<void> {
  const upgrade = await prisma.groupUpgrade.findUnique({ where: { stripeSessionId } });
  if (!upgrade || upgrade.status === "PAID") return;

  await prisma.$transaction(async (tx) => {
    await tx.groupUpgrade.update({
      where: { id: upgrade.id },
      data: { status: "PAID" },
    });
    const group = await tx.groupRoom.findUnique({
      where: { id: upgrade.groupId },
      select: { memberCap: true },
    });
    if (group) {
      await tx.groupRoom.update({
        where: { id: upgrade.groupId },
        data: { memberCap: Math.max(group.memberCap, upgrade.memberCap) },
      });
    }
  });
}
