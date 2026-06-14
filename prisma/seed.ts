import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getPoolConfig } from "../lib/aws-db";

const adapter = new PrismaPg(getPoolConfig());
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

export async function seedDatabase() {
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
  await seedTieBreakers(tournament.id);

  await seedStagedTournament();

  await seedBadges();

  console.log("Done.");
}

// ─── Badge catalog seed ───────────────────────────────────────────────────────
// Display text lives in messages/{en,es}.json keyed by slug; only slug/category/
// icon are stored. Mirrors the catalog INSERT in the add_badges migration.

const BADGES = [
  { slug: "clean_sweep",  category: "SKILL",       icon: "🧹" },
  { slug: "stage_mvp",    category: "SKILL",       icon: "🏅" },
  { slug: "hot_streak",   category: "CONSISTENCY", icon: "🔥" },
  { slug: "ever_present", category: "CONSISTENCY", icon: "📅" },
  { slug: "locked_in",    category: "UNLOCK",      icon: "🔒" },
  { slug: "top_of_table", category: "SOCIAL",      icon: "👑" },
] as const;

async function seedBadges() {
  for (const b of BADGES) {
    await prisma.badge.upsert({
      where: { slug: b.slug },
      update: { category: b.category, icon: b.icon },
      create: { slug: b.slug, category: b.category, icon: b.icon },
    });
  }
  console.log(`Upserted ${BADGES.length} badges.`);
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

  const gp  = "GROUP_POSITION" as const;
  const bt  = "BEST_THIRD"     as const;
  const mr  = "MATCH_RESULT"   as const;
  const win = "WINNER"         as const;

  // ── Phases ────────────────────────────────────────────────────────
  const phaseR32   = await prisma.tournamentPhase.create({ data: { tournamentId, name: "Round of 32",    slug: "r32",   sortOrder: 1, isKnockout: true } });
  const phaseR16   = await prisma.tournamentPhase.create({ data: { tournamentId, name: "Round of 16",    slug: "r16",   sortOrder: 2, isKnockout: true } });
  const phaseQF    = await prisma.tournamentPhase.create({ data: { tournamentId, name: "Quarter-Finals", slug: "qf",    sortOrder: 3, isKnockout: true } });
  const phaseSF    = await prisma.tournamentPhase.create({ data: { tournamentId, name: "Semi-Finals",    slug: "sf",    sortOrder: 4, isKnockout: true } });
  const phaseFinal = await prisma.tournamentPhase.create({ data: { tournamentId, name: "Final",          slug: "final", sortOrder: 5, isKnockout: true } });
  console.log("Created 5 knockout phases.");

  // ── R32 — sort orders reflect bracket visual position (top→bottom) ─
  // Consecutive pairs feed the same R16 match.
  // Left half (→ SF1): M74,M77 | M73,M75 | M83,M84 | M81,M82
  // Right half (→ SF2): M76,M78 | M79,M80 | M86,M88 | M85,M87
  // BEST_THIRD labels must match THIRD_PLACE_MATCH_SLOTS: 1A,1B,1D,1E,1G,1I,1K,1L
  const r32_m1  = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder:  1, label: "1E", homeSourceType: gp, homeSourceGroupId: G["E"], homeSourcePosition: 1, awaySourceType: bt } });                                                      // M74: 1E vs BT
  const r32_m2  = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder:  2, label: "1I", homeSourceType: gp, homeSourceGroupId: G["I"], homeSourcePosition: 1, awaySourceType: bt } });                                                      // M77: 1I vs BT
  const r32_m3  = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder:  3,             homeSourceType: gp, homeSourceGroupId: G["A"], homeSourcePosition: 2, awaySourceType: gp, awaySourceGroupId: G["B"], awaySourcePosition: 2 } }); // M73: 2A vs 2B
  const r32_m4  = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder:  4,             homeSourceType: gp, homeSourceGroupId: G["F"], homeSourcePosition: 1, awaySourceType: gp, awaySourceGroupId: G["C"], awaySourcePosition: 2 } }); // M75: 1F vs 2C
  const r32_m5  = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder:  5,             homeSourceType: gp, homeSourceGroupId: G["K"], homeSourcePosition: 2, awaySourceType: gp, awaySourceGroupId: G["L"], awaySourcePosition: 2 } }); // M83: 2K vs 2L
  const r32_m6  = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder:  6,             homeSourceType: gp, homeSourceGroupId: G["H"], homeSourcePosition: 1, awaySourceType: gp, awaySourceGroupId: G["J"], awaySourcePosition: 2 } }); // M84: 1H vs 2J
  const r32_m7  = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder:  7, label: "1D", homeSourceType: gp, homeSourceGroupId: G["D"], homeSourcePosition: 1, awaySourceType: bt } });                                                      // M81: 1D vs BT
  const r32_m8  = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder:  8, label: "1G", homeSourceType: gp, homeSourceGroupId: G["G"], homeSourcePosition: 1, awaySourceType: bt } });                                                      // M82: 1G vs BT
  const r32_m9  = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder:  9,             homeSourceType: gp, homeSourceGroupId: G["C"], homeSourcePosition: 1, awaySourceType: gp, awaySourceGroupId: G["F"], awaySourcePosition: 2 } }); // M76: 1C vs 2F
  const r32_m10 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder: 10,             homeSourceType: gp, homeSourceGroupId: G["E"], homeSourcePosition: 2, awaySourceType: gp, awaySourceGroupId: G["I"], awaySourcePosition: 2 } }); // M78: 2E vs 2I
  const r32_m11 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder: 11, label: "1A", homeSourceType: gp, homeSourceGroupId: G["A"], homeSourcePosition: 1, awaySourceType: bt } });                                                      // M79: 1A vs BT
  const r32_m12 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder: 12, label: "1L", homeSourceType: gp, homeSourceGroupId: G["L"], homeSourcePosition: 1, awaySourceType: bt } });                                                      // M80: 1L vs BT
  const r32_m13 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder: 13,             homeSourceType: gp, homeSourceGroupId: G["J"], homeSourcePosition: 1, awaySourceType: gp, awaySourceGroupId: G["H"], awaySourcePosition: 2 } }); // M86: 1J vs 2H
  const r32_m14 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder: 14,             homeSourceType: gp, homeSourceGroupId: G["D"], homeSourcePosition: 2, awaySourceType: gp, awaySourceGroupId: G["G"], awaySourcePosition: 2 } }); // M88: 2D vs 2G
  const r32_m15 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder: 15, label: "1B", homeSourceType: gp, homeSourceGroupId: G["B"], homeSourcePosition: 1, awaySourceType: bt } });                                                      // M85: 1B vs BT
  const r32_m16 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR32.id, sortOrder: 16, label: "1K", homeSourceType: gp, homeSourceGroupId: G["K"], homeSourcePosition: 1, awaySourceType: bt } });                                                      // M87: 1K vs BT
  console.log("Created 16 R32 matches.");

  // ── R16 — consecutive R32 pairs (1&2, 3&4, …) feed each match ────
  const r16_m1 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 1, homeSourceType: mr, homeSourceMatchId: r32_m1.id,  homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: r32_m2.id,  awaySourceOutcome: win } }); // M89: W74 vs W77
  const r16_m2 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 2, homeSourceType: mr, homeSourceMatchId: r32_m3.id,  homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: r32_m4.id,  awaySourceOutcome: win } }); // M90: W73 vs W75
  const r16_m3 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 3, homeSourceType: mr, homeSourceMatchId: r32_m5.id,  homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: r32_m6.id,  awaySourceOutcome: win } }); // M93: W83 vs W84
  const r16_m4 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 4, homeSourceType: mr, homeSourceMatchId: r32_m7.id,  homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: r32_m8.id,  awaySourceOutcome: win } }); // M94: W81 vs W82
  const r16_m5 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 5, homeSourceType: mr, homeSourceMatchId: r32_m9.id,  homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: r32_m10.id, awaySourceOutcome: win } }); // M91: W76 vs W78
  const r16_m6 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 6, homeSourceType: mr, homeSourceMatchId: r32_m11.id, homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: r32_m12.id, awaySourceOutcome: win } }); // M92: W79 vs W80
  const r16_m7 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 7, homeSourceType: mr, homeSourceMatchId: r32_m13.id, homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: r32_m14.id, awaySourceOutcome: win } }); // M95: W86 vs W88
  const r16_m8 = await prisma.match.create({ data: { tournamentId, phaseId: phaseR16.id, sortOrder: 8, homeSourceType: mr, homeSourceMatchId: r32_m15.id, homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: r32_m16.id, awaySourceOutcome: win } }); // M96: W85 vs W87
  console.log("Created 8 R16 matches.");

  // ── Quarter-Finals ────────────────────────────────────────────────
  const qf_m1 = await prisma.match.create({ data: { tournamentId, phaseId: phaseQF.id, sortOrder: 1, homeSourceType: mr, homeSourceMatchId: r16_m1.id, homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: r16_m2.id, awaySourceOutcome: win } }); // M97: W89 vs W90
  const qf_m2 = await prisma.match.create({ data: { tournamentId, phaseId: phaseQF.id, sortOrder: 2, homeSourceType: mr, homeSourceMatchId: r16_m3.id, homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: r16_m4.id, awaySourceOutcome: win } }); // M98: W93 vs W94
  const qf_m3 = await prisma.match.create({ data: { tournamentId, phaseId: phaseQF.id, sortOrder: 3, homeSourceType: mr, homeSourceMatchId: r16_m5.id, homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: r16_m6.id, awaySourceOutcome: win } }); // M99: W91 vs W92
  const qf_m4 = await prisma.match.create({ data: { tournamentId, phaseId: phaseQF.id, sortOrder: 4, homeSourceType: mr, homeSourceMatchId: r16_m7.id, homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: r16_m8.id, awaySourceOutcome: win } }); // M100: W95 vs W96
  console.log("Created 4 QF matches.");

  // ── Semi-Finals ───────────────────────────────────────────────────
  const sf_m1 = await prisma.match.create({ data: { tournamentId, phaseId: phaseSF.id, sortOrder: 1, homeSourceType: mr, homeSourceMatchId: qf_m1.id, homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: qf_m2.id, awaySourceOutcome: win } });
  const sf_m2 = await prisma.match.create({ data: { tournamentId, phaseId: phaseSF.id, sortOrder: 2, homeSourceType: mr, homeSourceMatchId: qf_m3.id, homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: qf_m4.id, awaySourceOutcome: win } });
  console.log("Created 2 SF matches.");

  // ── Final ─────────────────────────────────────────────────────────
  await prisma.match.create({ data: { tournamentId, phaseId: phaseFinal.id, label: "Final", sortOrder: 1, homeSourceType: mr, homeSourceMatchId: sf_m1.id, homeSourceOutcome: win, awaySourceType: mr, awaySourceMatchId: sf_m2.id, awaySourceOutcome: win } });
  console.log("Created Final match.");
  console.log("Bracket seeding complete: 5 phases, 31 matches.");
}

async function seedTieBreakers(tournamentId: string) {
  const existing = await prisma.tieBreakerQuestion.count({ where: { tournamentId } });
  if (existing > 0) {
    console.log("Tie-breaker questions already seeded, skipping.");
    return;
  }

  const questions = [
    { sortOrder: 1, type: "NUMBER" as const, prompt: "Total goals scored in the tournament" },
    { sortOrder: 2, type: "NUMBER" as const, prompt: "Total goals scored in the Final" },
    { sortOrder: 3, type: "TEXT"   as const, prompt: "Name of the Golden Boot winner" },
    { sortOrder: 4, type: "NUMBER" as const, prompt: "Number of penalty shootouts in the knockout rounds" },
    { sortOrder: 5, type: "NUMBER" as const, prompt: "Total red cards shown across the tournament" },
  ];

  for (const q of questions) {
    await prisma.tieBreakerQuestion.create({ data: { tournamentId, ...q } });
  }
  console.log(`Seeded ${questions.length} tie-breaker questions.`);
}

// ─── Staged tournament seed ───────────────────────────────────────────────────

async function seedStagedTournament() {
  const existing = await prisma.tournament.findUnique({ where: { slug: "wc2026-staged" } });
  if (existing) {
    console.log("Staged tournament already seeded, skipping.");
    return;
  }

  const tournament = await prisma.tournament.create({
    data: {
      name: "FIFA World Cup 2026 — Staged",
      slug: "wc2026-staged",
      description: "Canada · Mexico · United States (Staged predictions)",
      isActive: true,
      type: "STAGED",
    },
  });
  console.log(`Staged tournament created: ${tournament.name} (${tournament.id})`);

  const stages = [
    {
      order: 1,
      name: "Group Qualification",
      roundLabel: "GQ",
      type: "GROUP_QUALIFICATION" as const,
      opensAt: new Date("2026-06-11T12:00:00Z"),
      closesAt: new Date("2026-06-24T10:00:00Z"),
    },
    {
      order: 2,
      name: "Round of 32",
      roundLabel: "R32",
      type: "KNOCKOUT" as const,
      opensAt: new Date("2026-06-27T18:00:00Z"),
      closesAt: new Date("2026-06-28T17:00:00Z"),
    },
    {
      order: 3,
      name: "Round of 16",
      roundLabel: "R16",
      type: "KNOCKOUT" as const,
      opensAt: new Date("2026-07-04T22:00:00Z"),
      closesAt: new Date("2026-07-05T20:00:00Z"),
    },
    {
      order: 4,
      name: "Quarter-Finals",
      roundLabel: "QF",
      type: "KNOCKOUT" as const,
      opensAt: new Date("2026-07-09T22:00:00Z"),
      closesAt: new Date("2026-07-10T20:00:00Z"),
    },
    {
      order: 5,
      name: "Semi-Finals",
      roundLabel: "SF",
      type: "KNOCKOUT" as const,
      opensAt: new Date("2026-07-14T22:00:00Z"),
      closesAt: new Date("2026-07-15T20:00:00Z"),
    },
    {
      order: 6,
      name: "Final",
      roundLabel: "Final",
      type: "KNOCKOUT" as const,
      opensAt: new Date("2026-07-18T22:00:00Z"),
      closesAt: new Date("2026-07-19T20:00:00Z"),
    },
  ];

  for (const stage of stages) {
    await prisma.tournamentStage.create({
      data: { tournamentId: tournament.id, ...stage },
    });
  }
  console.log(`Seeded ${stages.length} stages for staged tournament.`);
}

// Auto-run only when executed directly (`prisma db seed` / `tsx prisma/seed.ts`),
// not when imported by the seed API route.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedDatabase()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
