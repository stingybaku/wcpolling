import { prisma } from "@/lib/prisma";
import {
  lookupThirdPlaceScenario,
  THIRD_PLACE_MATCH_SLOTS,
  ThirdPlaceSlot,
} from "@/lib/third-place-scenarios";

type PredictionWithContext = {
  id: string;
  tournamentId: string;
  groupStandings: {
    groupId: string;
    teamId: string;
    position: number;
    group: { name: string };
  }[];
  entries: {
    matchId: string;
    predictedHomeTeamId: string | null;
    predictedAwayTeamId: string | null;
    predictedHomeScore: number | null;
    predictedAwayScore: number | null;
    match: { groupId: string | null };
  }[];
};

/** From the user's predicted group-stage scores, compute points/GD/GF per team. */
function computeGroupStageStats(
  entries: PredictionWithContext["entries"]
): Map<string, { points: number; goalDiff: number; goalsFor: number }> {
  const stats = new Map<string, { points: number; goalDiff: number; goalsFor: number }>();

  const ensure = (teamId: string) => {
    if (!stats.has(teamId)) stats.set(teamId, { points: 0, goalDiff: 0, goalsFor: 0 });
    return stats.get(teamId)!;
  };

  for (const entry of entries) {
    if (!entry.match.groupId) continue; // skip knockout matches
    const { predictedHomeTeamId: hId, predictedAwayTeamId: aId,
            predictedHomeScore: hG, predictedAwayScore: aG } = entry;
    if (!hId || !aId || hG == null || aG == null) continue;

    const home = ensure(hId);
    const away = ensure(aId);

    home.goalsFor += hG;
    away.goalsFor += aG;
    home.goalDiff += hG - aG;
    away.goalDiff += aG - hG;

    if (hG > aG) { home.points += 3; }
    else if (hG < aG) { away.points += 3; }
    else { home.points += 1; away.points += 1; }
  }

  return stats;
}

/**
 * After a user saves their group-stage predictions (standings + scores), call this
 * to auto-populate the Round-of-32 PredictionEntry rows.
 *
 * - GROUP_POSITION slots: filled from PredictionGroupStanding
 * - BEST_THIRD slots (1A,1B,1D,1E,1G,1I,1K,1L): filled via FIFA 495-scenario lookup
 *
 * Silently no-ops if the tournament has no R32 phase or the standings are incomplete.
 */
export async function populatePredictionR32Bracket(predictionId: string): Promise<void> {
  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId },
    include: {
      groupStandings: { include: { group: { select: { name: true } } } },
      entries: {
        include: { match: { select: { groupId: true } } },
      },
    },
  });
  if (!prediction) return;

  // Build groupName (uppercase) → position → teamId
  const positionMap = new Map<string, Map<number, string>>();
  for (const s of prediction.groupStandings) {
    const g = s.group.name.toUpperCase();
    if (!positionMap.has(g)) positionMap.set(g, new Map());
    positionMap.get(g)!.set(s.position, s.teamId);
  }

  // Need at least some standings to proceed
  if (positionMap.size === 0) return;

  // Find the first knockout phase for this tournament
  const r32Phase = await prisma.tournamentPhase.findFirst({
    where: { tournamentId: prediction.tournamentId, isKnockout: true },
    orderBy: { sortOrder: "asc" },
  });
  if (!r32Phase) return;

  const r32Matches = await prisma.match.findMany({
    where: { tournamentId: prediction.tournamentId, phaseId: r32Phase.id },
    include: {
      homeSourceGroup: { select: { name: true } },
      awaySourceGroup: { select: { name: true } },
    },
    orderBy: { sortOrder: "asc" },
  });
  if (r32Matches.length === 0) return;

  // Compute scenario only if we have all 12 groups' 3rd-place standings
  const stats = computeGroupStageStats(prediction.entries);
  let scenarioAssignments: Record<ThirdPlaceSlot, string> | null = null;

  if (positionMap.size === 12) {
    const thirdPlaceCandidates = [...positionMap.entries()]
      .map(([groupName, positions]) => {
        const teamId = positions.get(3);
        if (!teamId) return null;
        const s = stats.get(teamId) ?? { points: 0, goalDiff: 0, goalsFor: 0 };
        return { groupName, teamId, ...s };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    thirdPlaceCandidates.sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDiff - a.goalDiff ||
        b.goalsFor - a.goalsFor ||
        a.groupName.localeCompare(b.groupName)
    );

    const best8 = thirdPlaceCandidates.slice(0, 8);
    if (best8.length === 8) {
      scenarioAssignments = lookupThirdPlaceScenario(best8.map((c) => c.groupName));
    }
  }

  // teamId of each group's 3rd-place qualifier (for slot lookup)
  const thirdPlaceByGroup = new Map<string, string>();
  if (scenarioAssignments) {
    for (const slot of THIRD_PLACE_MATCH_SLOTS) {
      const ref = scenarioAssignments[slot]; // e.g. "3E"
      const groupLetter = ref.slice(1).toUpperCase(); // "E"
      const teamId = positionMap.get(groupLetter)?.get(3);
      if (teamId) thirdPlaceByGroup.set(groupLetter, teamId);
    }
  }

  // Upsert PredictionEntry for each R32 match we can resolve
  const thirdPlaceSlotSet = new Set<string>(THIRD_PLACE_MATCH_SLOTS);

  for (const match of r32Matches) {
    let homeTeamId: string | null = null;
    let awayTeamId: string | null = null;

    // Resolve home participant
    if (
      match.homeSourceType === "GROUP_POSITION" &&
      match.homeSourceGroup &&
      match.homeSourcePosition
    ) {
      homeTeamId =
        positionMap.get(match.homeSourceGroup.name.toUpperCase())?.get(match.homeSourcePosition) ?? null;
    }

    // Resolve away participant
    if (
      match.awaySourceType === "GROUP_POSITION" &&
      match.awaySourceGroup &&
      match.awaySourcePosition
    ) {
      awayTeamId =
        positionMap.get(match.awaySourceGroup.name.toUpperCase())?.get(match.awaySourcePosition) ?? null;
    }

    // BEST_THIRD slot — use scenario assignment keyed by match label (e.g. "1A")
    const label = match.label?.trim() ?? "";
    if (
      match.awaySourceType === "BEST_THIRD" &&
      scenarioAssignments &&
      thirdPlaceSlotSet.has(label)
    ) {
      const slot = label as ThirdPlaceSlot;
      const groupLetter = scenarioAssignments[slot].slice(1).toUpperCase();
      awayTeamId = thirdPlaceByGroup.get(groupLetter) ?? null;
    }
    if (
      match.homeSourceType === "BEST_THIRD" &&
      scenarioAssignments &&
      thirdPlaceSlotSet.has(label)
    ) {
      const slot = label as ThirdPlaceSlot;
      const groupLetter = scenarioAssignments[slot].slice(1).toUpperCase();
      homeTeamId = thirdPlaceByGroup.get(groupLetter) ?? null;
    }

    if (homeTeamId === null && awayTeamId === null) continue;

    await prisma.predictionEntry.upsert({
      where: { predictionId_matchId: { predictionId, matchId: match.id } },
      create: {
        predictionId,
        matchId: match.id,
        predictedHomeTeamId: homeTeamId,
        predictedAwayTeamId: awayTeamId,
      },
      update: {
        predictedHomeTeamId: homeTeamId,
        predictedAwayTeamId: awayTeamId,
      },
    });
  }
}
