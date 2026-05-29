import { forbidden, getCurrentUser, unauthorized } from "@/app/api/helpers";
import { prisma } from "@/lib/prisma";
import { lookupThirdPlaceScenario } from "@/lib/third-place-scenarios";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

export async function POST(req: Request, context: { params: Promise<{ stageId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const { stageId } = await context.params;
  const body = await req.json();
  const groupStandings: Record<string, string[]> = body.groupStandings ?? {};
  const selectedThirds: string[] = body.selectedThirds ?? [];

  const stage = await prisma.tournamentStage.findUnique({ where: { id: stageId } });
  if (!stage) return Response.json({ error: "Stage not found" }, { status: 404 });
  if (stage.type !== "GROUP_QUALIFICATION") return Response.json({ error: "Only for GROUP_QUALIFICATION stages" }, { status: 400 });
  if (stage.status !== "CLOSED") return Response.json({ error: "Stage must be CLOSED to lock results" }, { status: 409 });
  if (selectedThirds.length !== 8) return Response.json({ error: "Exactly 8 third-place teams must be selected" }, { status: 400 });

  // Fetch group names for the given groupIds
  const groupIds = Object.keys(groupStandings);
  const groups = await prisma.tournamentGroup.findMany({
    where: { id: { in: groupIds } },
    orderBy: { sortOrder: "asc" },
  });
  const groupById: Record<string, { name: string }> = {};
  for (const g of groups) groupById[g.id] = { name: g.name };

  // Build groupByName lookup: groupName -> { winner, runnerUp, third }
  const groupByName: Record<string, { winner: string; runnerUp: string; third: string }> = {};
  for (const [gId, teamIds] of Object.entries(groupStandings)) {
    const name = groupById[gId]?.name;
    if (!name || teamIds.length < 3) continue;
    groupByName[name] = { winner: teamIds[0], runnerUp: teamIds[1], third: teamIds[2] };
  }

  // Compute 32 qualifiers: top 2 from each group + 8 selected thirds
  const qualifiers: string[] = [];
  for (const { winner, runnerUp } of Object.values(groupByName)) {
    qualifiers.push(winner, runnerUp);
  }
  qualifiers.push(...selectedThirds);

  if (qualifiers.length !== 32) {
    return Response.json({ error: `Expected 32 qualifiers, got ${qualifiers.length}` }, { status: 400 });
  }

  // Build teamId → groupName map for thirds
  const teamToGroupName: Record<string, string> = {};
  for (const [gId, teamIds] of Object.entries(groupStandings)) {
    const name = groupById[gId]?.name;
    if (name && teamIds[2]) teamToGroupName[teamIds[2]] = name;
  }

  const advancingGroupLetters = selectedThirds.map(t => teamToGroupName[t]).filter(Boolean);
  const scenario = lookupThirdPlaceScenario(advancingGroupLetters);

  function getThirdTeamForSlot(slot: string): string | null {
    const assignment = scenario?.[slot as keyof typeof scenario]; // e.g. "3E"
    if (!assignment) return null;
    const groupLetter = (assignment as string).slice(1); // "E"
    return groupByName[groupLetter]?.third ?? null;
  }

  // Save StageQualificationResult
  await prisma.stageQualificationResult.upsert({
    where: { stageId },
    create: { stageId, qualifiers },
    update: { qualifiers },
  });

  // Save StageGroupResult
  await prisma.stageGroupResult.upsert({
    where: { stageId },
    create: { stageId, standings: groupStandings, thirdPlace: selectedThirds },
    update: { standings: groupStandings, thirdPlace: selectedThirds },
  });

  // Score all members (same logic as /score endpoint)
  const qualifierSet = new Set(qualifiers);
  const groupRooms = await prisma.groupRoom.findMany({ where: { tournamentId: stage.tournamentId } });

  for (const room of groupRooms) {
    const members = await prisma.groupMembership.findMany({ where: { groupId: room.id, isActive: true } });
    for (const member of members) {
      const prediction = await prisma.stagePrediction.findFirst({
        where: { stageId, groupId: room.id, userId: member.userId },
      });
      let correctPicks = 0;
      let incorrectPicks = 0;
      if (prediction?.qualificationPicks) {
        const picks = prediction.qualificationPicks as string[];
        for (const teamId of picks) {
          if (qualifierSet.has(teamId)) correctPicks++;
          else incorrectPicks++;
        }
      }
      const points = correctPicks * 2;
      await prisma.stageScore.upsert({
        where: { userId_stageId_groupId: { stageId, userId: member.userId, groupId: room.id } },
        create: { stageId, userId: member.userId, groupId: room.id, points, correctPicks, breakdown: { correct: correctPicks, incorrect: incorrectPicks, total: 32 } },
        update: { points, correctPicks, breakdown: { correct: correctPicks, incorrect: incorrectPicks, total: 32 } },
      });
    }
  }

  // Mark stage as SCORED
  await prisma.tournamentStage.update({ where: { id: stageId }, data: { status: "SCORED" } });

  // Generate R32 matches for the next KNOCKOUT stage
  const nextStage = await prisma.tournamentStage.findFirst({
    where: { tournamentId: stage.tournamentId, order: stage.order + 1, type: "KNOCKOUT" },
  });

  let r32Generated = false;
  if (nextStage && scenario) {
    const existingMatches = await prisma.stageMatch.count({ where: { stageId: nextStage.id } });
    if (existingMatches === 0) {
      // Build 16 R32 matches using the bracket from the seeder
      const r32 = [
        { n: "1",  home: groupByName["E"]?.winner,   away: getThirdTeamForSlot("1E") },
        { n: "2",  home: groupByName["I"]?.winner,   away: getThirdTeamForSlot("1I") },
        { n: "3",  home: groupByName["A"]?.runnerUp, away: groupByName["B"]?.runnerUp },
        { n: "4",  home: groupByName["F"]?.winner,   away: groupByName["C"]?.runnerUp },
        { n: "5",  home: groupByName["K"]?.runnerUp, away: groupByName["L"]?.runnerUp },
        { n: "6",  home: groupByName["H"]?.winner,   away: groupByName["J"]?.runnerUp },
        { n: "7",  home: groupByName["D"]?.winner,   away: getThirdTeamForSlot("1D") },
        { n: "8",  home: groupByName["G"]?.winner,   away: getThirdTeamForSlot("1G") },
        { n: "9",  home: groupByName["C"]?.winner,   away: groupByName["F"]?.runnerUp },
        { n: "10", home: groupByName["E"]?.runnerUp, away: groupByName["I"]?.runnerUp },
        { n: "11", home: groupByName["A"]?.winner,   away: getThirdTeamForSlot("1A") },
        { n: "12", home: groupByName["L"]?.winner,   away: getThirdTeamForSlot("1L") },
        { n: "13", home: groupByName["J"]?.winner,   away: groupByName["H"]?.runnerUp },
        { n: "14", home: groupByName["D"]?.runnerUp, away: groupByName["G"]?.runnerUp },
        { n: "15", home: groupByName["B"]?.winner,   away: getThirdTeamForSlot("1B") },
        { n: "16", home: groupByName["K"]?.winner,   away: getThirdTeamForSlot("1K") },
      ];

      const valid = r32.filter(m => m.home && m.away);
      if (valid.length > 0) {
        await prisma.stageMatch.createMany({
          data: valid.map(m => ({
            stageId: nextStage.id,
            matchNumber: m.n,
            homeTeamId: m.home!,
            awayTeamId: m.away!,
          })),
        });
        r32Generated = true;
      }
    }
  }

  return Response.json({ success: true, r32Generated, qualifiers: qualifiers.length });
}
