import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const TOURNAMENT = {
  name: "FIFA World Cup 2026",
  slug: "wc2026",
  description: "Canada · Mexico · United States",
  teamsPerGroup: 4,
  isActive: true,
};

const TEAMS: { name: string; fifaCode: string }[] = [
  { name: "Mexico", fifaCode: "MEX" },
  { name: "South Africa", fifaCode: "RSA" },
  { name: "South Korea", fifaCode: "KOR" },
  { name: "Czech Republic", fifaCode: "CZE" },
  { name: "Canada", fifaCode: "CAN" },
  { name: "Bosnia-Herzegovina", fifaCode: "BIH" },
  { name: "Qatar", fifaCode: "QAT" },
  { name: "Switzerland", fifaCode: "SUI" },
  { name: "Brazil", fifaCode: "BRA" },
  { name: "Morocco", fifaCode: "MAR" },
  { name: "Haiti", fifaCode: "HAI" },
  { name: "Scotland", fifaCode: "SCO" },
  { name: "United States", fifaCode: "USA" },
  { name: "Paraguay", fifaCode: "PAR" },
  { name: "Australia", fifaCode: "AUS" },
  { name: "Turkey", fifaCode: "TUR" },
  { name: "Germany", fifaCode: "GER" },
  { name: "Curaçao", fifaCode: "CUW" },
  { name: "Ivory Coast", fifaCode: "CIV" },
  { name: "Ecuador", fifaCode: "ECU" },
  { name: "Netherlands", fifaCode: "NED" },
  { name: "Japan", fifaCode: "JPN" },
  { name: "Sweden", fifaCode: "SWE" },
  { name: "Tunisia", fifaCode: "TUN" },
  { name: "Belgium", fifaCode: "BEL" },
  { name: "Egypt", fifaCode: "EGY" },
  { name: "Iran", fifaCode: "IRN" },
  { name: "New Zealand", fifaCode: "NZL" },
  { name: "Spain", fifaCode: "ESP" },
  { name: "Cabo Verde", fifaCode: "CPV" },
  { name: "Saudi Arabia", fifaCode: "KSA" },
  { name: "Uruguay", fifaCode: "URU" },
  { name: "France", fifaCode: "FRA" },
  { name: "Senegal", fifaCode: "SEN" },
  { name: "Norway", fifaCode: "NOR" },
  { name: "Iraq", fifaCode: "IRQ" },
  { name: "Argentina", fifaCode: "ARG" },
  { name: "Algeria", fifaCode: "ALG" },
  { name: "Austria", fifaCode: "AUT" },
  { name: "Jordan", fifaCode: "JOR" },
  { name: "Portugal", fifaCode: "POR" },
  { name: "Uzbekistan", fifaCode: "UZB" },
  { name: "Colombia", fifaCode: "COL" },
  { name: "DR Congo", fifaCode: "COD" },
  { name: "England", fifaCode: "ENG" },
  { name: "Croatia", fifaCode: "CRO" },
  { name: "Ghana", fifaCode: "GHA" },
  { name: "Panama", fifaCode: "PAN" },
];

const GROUPS: { name: string; teamCodes: string[] }[] = [
  { name: "A", teamCodes: ["MEX", "RSA", "KOR", "CZE"] },
  { name: "B", teamCodes: ["CAN", "BIH", "QAT", "SUI"] },
  { name: "C", teamCodes: ["BRA", "MAR", "HAI", "SCO"] },
  { name: "D", teamCodes: ["USA", "PAR", "AUS", "TUR"] },
  { name: "E", teamCodes: ["GER", "CUW", "CIV", "ECU"] },
  { name: "F", teamCodes: ["NED", "JPN", "SWE", "TUN"] },
  { name: "G", teamCodes: ["BEL", "EGY", "IRN", "NZL"] },
  { name: "H", teamCodes: ["ESP", "CPV", "KSA", "URU"] },
  { name: "I", teamCodes: ["FRA", "SEN", "NOR", "IRQ"] },
  { name: "J", teamCodes: ["ARG", "ALG", "AUT", "JOR"] },
  { name: "K", teamCodes: ["POR", "UZB", "COL", "COD"] },
  { name: "L", teamCodes: ["ENG", "CRO", "GHA", "PAN"] },
];

async function main() {
  console.log("Seeding FIFA World Cup 2026...");

  const tournament = await prisma.tournament.upsert({
    where: { slug: TOURNAMENT.slug },
    update: {},
    create: TOURNAMENT,
  });
  console.log(`Tournament: ${tournament.name} (${tournament.id})`);

  for (const team of TEAMS) {
    await prisma.team.upsert({
      where: { fifaCode: team.fifaCode },
      update: { name: team.name },
      create: team,
    });
  }
  console.log(`Upserted ${TEAMS.length} teams`);

  for (let i = 0; i < GROUPS.length; i++) {
    const { name, teamCodes } = GROUPS[i];

    const group = await prisma.tournamentGroup.upsert({
      where: { tournamentId_name: { tournamentId: tournament.id, name } },
      update: {},
      create: { tournamentId: tournament.id, name, sortOrder: i },
    });

    for (let seed = 0; seed < teamCodes.length; seed++) {
      const team = await prisma.team.findUnique({
        where: { fifaCode: teamCodes[seed] },
      });
      if (!team) throw new Error(`Team not found: ${teamCodes[seed]}`);

      await prisma.tournamentGroupTeam.upsert({
        where: { groupId_teamId: { groupId: group.id, teamId: team.id } },
        update: {},
        create: { groupId: group.id, teamId: team.id, seed: seed + 1 },
      });
    }

    console.log(`Group ${name}: ${teamCodes.join(", ")}`);
  }

  await seedBracket(tournament.id);

  console.log("Done.");
}

// ─── Bracket seed ────────────────────────────────────────────────────────────

async function seedBracket(tournamentId: string) {
  const existing = await prisma.tournamentPhase.count({ where: { tournamentId } });
  if (existing > 0) {
    console.log("Bracket already seeded, skipping.");
    return;
  }

  // Group name → id
  const groups = await prisma.tournamentGroup.findMany({ where: { tournamentId } });
  const G: Record<string, string> = {};
  for (const g of groups) G[g.name] = g.id;

  // Helper: GROUP_POSITION source fields
  const gp = (letter: string, pos: 1 | 2) => ({
    sourceType: "GROUP_POSITION" as const,
    groupId: G[letter],
    position: pos,
  });

  // Create phases
  const phaseR32 = await prisma.tournamentPhase.create({
    data: { tournamentId, name: "Round of 32", slug: "r32", sortOrder: 1, isKnockout: true },
  });
  const phaseR16 = await prisma.tournamentPhase.create({
    data: { tournamentId, name: "Round of 16", slug: "r16", sortOrder: 2, isKnockout: true },
  });
  const phaseQF = await prisma.tournamentPhase.create({
    data: { tournamentId, name: "Quarter-Finals", slug: "qf", sortOrder: 3, isKnockout: true },
  });
  const phaseSF = await prisma.tournamentPhase.create({
    data: { tournamentId, name: "Semi-Finals", slug: "sf", sortOrder: 4, isKnockout: true },
  });
  const phaseFinal = await prisma.tournamentPhase.create({
    data: { tournamentId, name: "Final", slug: "final", sortOrder: 5, isKnockout: true },
  });
  console.log("Created 5 knockout phases.");

  // ── R32 (16 matches) ────────────────────────────────────────────────
  // Section 1
  const r32_m1 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, label: "1A", sortOrder: 1, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["A"], homeSourcePosition: 1, awaySourceType: "BEST_THIRD" } });
  const r32_m2 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder: 2, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["A"], homeSourcePosition: 2, awaySourceType: "GROUP_POSITION", awaySourceGroupId: G["B"], awaySourcePosition: 2 } });
  const r32_m3 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, label: "1B", sortOrder: 3, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["B"], homeSourcePosition: 1, awaySourceType: "BEST_THIRD" } });
  const r32_m4 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder: 4, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["C"], homeSourcePosition: 2, awaySourceType: "GROUP_POSITION", awaySourceGroupId: G["D"], awaySourcePosition: 2 } });
  const r32_m5 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, label: "1C", sortOrder: 5, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["C"], homeSourcePosition: 1, awaySourceType: "GROUP_POSITION", awaySourceGroupId: G["G"], awaySourcePosition: 2 } });
  const r32_m6 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, label: "1D", sortOrder: 6, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["D"], homeSourcePosition: 1, awaySourceType: "BEST_THIRD" } });
  const r32_m7 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, label: "1E", sortOrder: 7, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["E"], homeSourcePosition: 1, awaySourceType: "BEST_THIRD" } });
  const r32_m8 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder: 8, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["E"], homeSourcePosition: 2, awaySourceType: "GROUP_POSITION", awaySourceGroupId: G["F"], awaySourcePosition: 2 } });

  // Section 2
  const r32_m9  = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, label: "1F", sortOrder: 9,  homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["F"], homeSourcePosition: 1, awaySourceType: "GROUP_POSITION", awaySourceGroupId: G["I"], awaySourcePosition: 2 } });
  const r32_m10 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, label: "1G", sortOrder: 10, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["G"], homeSourcePosition: 1, awaySourceType: "BEST_THIRD" } });
  const r32_m11 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, label: "1I", sortOrder: 11, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["I"], homeSourcePosition: 1, awaySourceType: "BEST_THIRD" } });
  const r32_m12 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder: 12, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["H"], homeSourcePosition: 2, awaySourceType: "GROUP_POSITION", awaySourceGroupId: G["J"], awaySourcePosition: 2 } });
  const r32_m13 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, label: "1H", sortOrder: 13, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["H"], homeSourcePosition: 1, awaySourceType: "GROUP_POSITION", awaySourceGroupId: G["K"], awaySourcePosition: 2 } });
  const r32_m14 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, label: "1K", sortOrder: 14, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["K"], homeSourcePosition: 1, awaySourceType: "BEST_THIRD" } });
  const r32_m15 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, label: "1L", sortOrder: 15, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["L"], homeSourcePosition: 1, awaySourceType: "BEST_THIRD" } });
  const r32_m16 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, label: "1J", sortOrder: 16, homeSourceType: "GROUP_POSITION", homeSourceGroupId: G["J"], homeSourcePosition: 1, awaySourceType: "GROUP_POSITION", awaySourceGroupId: G["L"], awaySourcePosition: 2 } });
  console.log("Created 16 R32 matches.");

  // ── R16 (8 matches) ─────────────────────────────────────────────────
  const win = "WINNER" as const;
  const r16_m1 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 1, homeSourceType: "MATCH_RESULT", homeSourceMatchId: r32_m1.id, homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: r32_m2.id, awaySourceOutcome: win } });
  const r16_m2 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 2, homeSourceType: "MATCH_RESULT", homeSourceMatchId: r32_m3.id, homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: r32_m4.id, awaySourceOutcome: win } });
  const r16_m3 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 3, homeSourceType: "MATCH_RESULT", homeSourceMatchId: r32_m5.id, homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: r32_m6.id, awaySourceOutcome: win } });
  const r16_m4 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 4, homeSourceType: "MATCH_RESULT", homeSourceMatchId: r32_m7.id, homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: r32_m8.id, awaySourceOutcome: win } });
  const r16_m5 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 5, homeSourceType: "MATCH_RESULT", homeSourceMatchId: r32_m9.id,  homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: r32_m10.id, awaySourceOutcome: win } });
  const r16_m6 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 6, homeSourceType: "MATCH_RESULT", homeSourceMatchId: r32_m11.id, homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: r32_m12.id, awaySourceOutcome: win } });
  const r16_m7 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 7, homeSourceType: "MATCH_RESULT", homeSourceMatchId: r32_m13.id, homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: r32_m14.id, awaySourceOutcome: win } });
  const r16_m8 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 8, homeSourceType: "MATCH_RESULT", homeSourceMatchId: r32_m15.id, homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: r32_m16.id, awaySourceOutcome: win } });
  console.log("Created 8 R16 matches.");

  // ── Quarter-Finals (4 matches) ────────────────────────────────────
  const qf_m1 = await prisma.match.create({ data: { tournamentId, phaseId: phaseQF.id, sortOrder: 1, homeSourceType: "MATCH_RESULT", homeSourceMatchId: r16_m1.id, homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: r16_m2.id, awaySourceOutcome: win } });
  const qf_m2 = await prisma.match.create({ data: { tournamentId, phaseId: phaseQF.id, sortOrder: 2, homeSourceType: "MATCH_RESULT", homeSourceMatchId: r16_m3.id, homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: r16_m4.id, awaySourceOutcome: win } });
  const qf_m3 = await prisma.match.create({ data: { tournamentId, phaseId: phaseQF.id, sortOrder: 3, homeSourceType: "MATCH_RESULT", homeSourceMatchId: r16_m5.id, homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: r16_m6.id, awaySourceOutcome: win } });
  const qf_m4 = await prisma.match.create({ data: { tournamentId, phaseId: phaseQF.id, sortOrder: 4, homeSourceType: "MATCH_RESULT", homeSourceMatchId: r16_m7.id, homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: r16_m8.id, awaySourceOutcome: win } });
  console.log("Created 4 QF matches.");

  // ── Semi-Finals (2 matches) ───────────────────────────────────────
  const sf_m1 = await prisma.match.create({ data: { tournamentId, phaseId: phaseSF.id, sortOrder: 1, homeSourceType: "MATCH_RESULT", homeSourceMatchId: qf_m1.id, homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: qf_m2.id, awaySourceOutcome: win } });
  const sf_m2 = await prisma.match.create({ data: { tournamentId, phaseId: phaseSF.id, sortOrder: 2, homeSourceType: "MATCH_RESULT", homeSourceMatchId: qf_m3.id, homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: qf_m4.id, awaySourceOutcome: win } });
  console.log("Created 2 SF matches.");

  // ── Final (1 match) ───────────────────────────────────────────────
  await prisma.match.create({ data: { tournamentId, phaseId: phaseFinal.id, label: "Final", sortOrder: 1, homeSourceType: "MATCH_RESULT", homeSourceMatchId: sf_m1.id, homeSourceOutcome: win, awaySourceType: "MATCH_RESULT", awaySourceMatchId: sf_m2.id, awaySourceOutcome: win } });
  console.log("Created Final match.");
  console.log("Bracket seeding complete: 5 phases, 31 matches.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
