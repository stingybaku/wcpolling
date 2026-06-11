/**
 * How many times an admin may unlock a member's submitted prediction within a
 * single stage (phase). The budget is per StagePrediction, so every phase gives
 * each member a fresh allowance — guaranteeing at least one unlock per phase.
 */
export const UNLOCKS_PER_STAGE = 1;

export function unlocksRemaining(unlockCount: number): number {
  return Math.max(0, UNLOCKS_PER_STAGE - unlockCount);
}
