import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, unauthorized, forbidden, badRequest } from "@/app/api/helpers";
import { getStripe } from "@/lib/stripe";
import { findTierByCap } from "@/lib/group-limits";

// Starts a one-time Stripe Checkout to raise this group's member cap to a paid
// tier. Only the portal admin, the group owner, or a group admin may purchase.
// A PENDING GroupUpgrade row is recorded here; the webhook flips it to PAID and
// applies the new cap once Stripe confirms payment.
export async function POST(request: NextRequest, context: { params: Promise<{ groupId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const { groupId } = await context.params;
  if (!groupId) return badRequest("Missing groupId");

  const body = await request.json().catch(() => ({}));
  const targetCap = Number(body.cap);
  const tier = findTierByCap(targetCap);
  if (!tier || tier.priceCents <= 0) return badRequest("Invalid upgrade tier");

  const group = await prisma.groupRoom.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, ownerId: true, memberCap: true },
  });
  if (!group) return badRequest("Group not found");

  let allowed = user.role === "ADMIN" || group.ownerId === user.id;
  if (!allowed) {
    const membership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId } },
    });
    allowed = membership?.role === "GROUP_ADMIN";
  }
  if (!allowed) return forbidden("Only group admins or the portal admin can upgrade this group");

  if (tier.cap <= group.memberCap) {
    return badRequest("This group already has an equal or larger member cap");
  }

  const stripe = getStripe();
  if (!stripe) return badRequest("Payments are not configured");

  const baseUrl = process.env.NEXTAUTH_URL ?? new URL(request.url).origin;
  const groupUrl = `${baseUrl}/dashboard/groups/${group.id}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: group.id,
    metadata: { groupId: group.id, memberCap: String(tier.cap) },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: tier.priceCents,
          product_data: {
            name: `Group upgrade — up to ${tier.cap} members`,
            description: `Raises "${group.name}" to a ${tier.cap}-member cap`,
          },
        },
      },
    ],
    success_url: `${groupUrl}?upgrade=success`,
    cancel_url: `${groupUrl}?upgrade=cancelled`,
  });

  if (!session.url) return badRequest("Could not start checkout");

  await prisma.groupUpgrade.create({
    data: {
      groupId: group.id,
      stripeSessionId: session.id,
      memberCap: tier.cap,
      amountCents: tier.priceCents,
      purchasedById: user.id,
    },
  });

  return new Response(JSON.stringify({ url: session.url }), { status: 200 });
}
