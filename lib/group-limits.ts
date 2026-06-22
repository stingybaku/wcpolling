// Abuse-prevention limits and paid upgrade tiers for group rooms. Shared by the
// API routes that enforce them, the Stripe checkout/webhook flow, and the UI
// that explains them.

export const MAX_GROUPS_PER_USER = 1;

// Default member cap for a newly created group (the free tier). Existing rooms
// created before the cap became per-group were backfilled to 100; see the
// add_group_member_cap_and_upgrades migration.
export const DEFAULT_GROUP_MEMBER_CAP = 20;

/**
 * One-time member-cap upgrade tiers, in ascending order. `priceCents` is what
 * Stripe charges to raise a room's cap to `cap`. The free tier (priceCents 0)
 * is the baseline and is never sold.
 */
export type MemberTier = { cap: number; priceCents: number };

export const GROUP_MEMBER_TIERS: readonly MemberTier[] = [
  { cap: 20, priceCents: 0 },
  { cap: 50, priceCents: 2000 },
  { cap: 100, priceCents: 5000 },
  { cap: 200, priceCents: 10000 },
] as const;

/** The largest cap any group can reach. */
export const MAX_GROUP_MEMBER_CAP = GROUP_MEMBER_TIERS[GROUP_MEMBER_TIERS.length - 1].cap;

/** Look up a purchasable tier by the cap it unlocks. */
export function findTierByCap(cap: number): MemberTier | undefined {
  return GROUP_MEMBER_TIERS.find((t) => t.cap === cap);
}

/**
 * Tiers a group with the given current cap may upgrade to: every paid tier whose
 * cap is strictly larger than what it already has.
 */
export function upgradeOptionsFor(currentCap: number): MemberTier[] {
  return GROUP_MEMBER_TIERS.filter((t) => t.priceCents > 0 && t.cap > currentCap);
}
