/**
 * Demo activity seeder for the STAGED tournament.
 *
 * Creates fictitious users, groups, their staged predictions (Group
 * Qualification + Round of 32), the resulting leaderboard scores, and a week of
 * daily trivia questions — so the app shows realistic activity for demos.
 *
 * SAFE + IDEMPOTENT:
 *  - All demo users use the @wcdemo.local email domain. Every run first deletes
 *    those users, which cascades to their owned groups, memberships,
 *    predictions, scores, trivia answers and achievements. Real users/groups are
 *    never touched.
 *  - Member scores are written directly for demo members only (we do NOT call
 *    the whole-stage scorer), so existing real groups keep their own scores.
 *  - Trivia questions are upserted by (tournamentId, publishDate), so re-running
 *    refreshes the same days instead of duplicating.
 *
 * This module is connection-agnostic: it uses the shared `lib/prisma` client, so
 * it works locally (DATABASE_URL) and inside the Vercel runtime (Aurora IAM).
 * Run it via `npm run seed:demo` (CLI) or the guarded
 * /api/admin/seed-demo route (deployed).
 */
import { prisma } from "./prisma";
import { hashPassword } from "./password";

export const DEMO_DOMAIN = "wcdemo.local";
export const DEMO_PASSWORD = "demo1234";

export const DEMO_ADMIN_EMAIL = `admin@${DEMO_DOMAIN}`;

export type SeedSummary = {
  tournament: string;
  users: number;
  groups: number;
  groupNames: string[];
  qualPredictions: number;
  r32Predictions: number;
  scores: number;
  triviaQuestions: number;
  cleared: number;
  adminEmail: string;
  qualifiersSeeded: boolean;
  qualifierCount: number;
  stages: { name: string; type: string; status: string }[];
};

// Deterministic PRNG so re-runs produce the same demo data (stable screenshots).
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const FIRST_NAMES = [
  "Sofía", "Mateo", "Valentina", "Diego", "Camila", "Andrés", "Lucía", "Javier",
  "Isabella", "Carlos", "Daniela", "Miguel", "Renata", "Sebastián", "Paula",
  "Tomás", "Gabriela", "Emilio",
];
const LAST_NAMES = [
  "García", "Rodríguez", "Martínez", "López", "Hernández", "Torres", "Ramírez",
  "Flores", "Vargas", "Castro", "Ortega", "Mendoza", "Rojas", "Núñez", "Silva",
  "Romero", "Guerrero", "Cabrera",
];

const GROUP_NAMES = ["Oficina FC", "Los Pronosticadores", "Familia Mundialista"];

const USERS_PER_GROUP = 6; // owner + 5 members

type TriviaSeed = {
  prompt: { en: string; es: string };
  options: { key: string; label: { en: string; es: string } }[];
  correctKey: string;
};

const TRIVIA: TriviaSeed[] = [
  {
    prompt: { en: "Which country won the 2022 FIFA World Cup?", es: "¿Qué país ganó el Mundial de la FIFA 2022?" },
    options: [
      { key: "A", label: { en: "France", es: "Francia" } },
      { key: "B", label: { en: "Argentina", es: "Argentina" } },
      { key: "C", label: { en: "Brazil", es: "Brasil" } },
      { key: "D", label: { en: "Croatia", es: "Croacia" } },
    ],
    correctKey: "B",
  },
  {
    prompt: { en: "How many countries are hosting the 2026 World Cup?", es: "¿Cuántos países son sede del Mundial 2026?" },
    options: [
      { key: "A", label: { en: "One", es: "Uno" } },
      { key: "B", label: { en: "Two", es: "Dos" } },
      { key: "C", label: { en: "Three", es: "Tres" } },
      { key: "D", label: { en: "Four", es: "Cuatro" } },
    ],
    correctKey: "C",
  },
  {
    prompt: { en: "How many teams will play in the 2026 World Cup?", es: "¿Cuántas selecciones jugarán el Mundial 2026?" },
    options: [
      { key: "A", label: { en: "32", es: "32" } },
      { key: "B", label: { en: "40", es: "40" } },
      { key: "C", label: { en: "48", es: "48" } },
      { key: "D", label: { en: "64", es: "64" } },
    ],
    correctKey: "C",
  },
  {
    prompt: { en: "Who holds the record for most World Cup titles?", es: "¿Quién tiene el récord de más títulos mundiales?" },
    options: [
      { key: "A", label: { en: "Germany", es: "Alemania" } },
      { key: "B", label: { en: "Italy", es: "Italia" } },
      { key: "C", label: { en: "Brazil", es: "Brasil" } },
      { key: "D", label: { en: "Argentina", es: "Argentina" } },
    ],
    correctKey: "C",
  },
  {
    prompt: { en: "Who is the all-time top scorer in World Cup history?", es: "¿Quién es el máximo goleador histórico de los Mundiales?" },
    options: [
      { key: "A", label: { en: "Miroslav Klose", es: "Miroslav Klose" } },
      { key: "B", label: { en: "Ronaldo Nazário", es: "Ronaldo Nazário" } },
      { key: "C", label: { en: "Lionel Messi", es: "Lionel Messi" } },
      { key: "D", label: { en: "Pelé", es: "Pelé" } },
    ],
    correctKey: "A",
  },
  {
    prompt: { en: "In which year did the first FIFA World Cup take place?", es: "¿En qué año se celebró el primer Mundial de la FIFA?" },
    options: [
      { key: "A", label: { en: "1928", es: "1928" } },
      { key: "B", label: { en: "1930", es: "1930" } },
      { key: "C", label: { en: "1934", es: "1934" } },
      { key: "D", label: { en: "1950", es: "1950" } },
    ],
    correctKey: "B",
  },
  {
    prompt: { en: "Which nation hosted and won the very first World Cup?", es: "¿Qué país fue sede y ganó el primer Mundial?" },
    options: [
      { key: "A", label: { en: "Brazil", es: "Brasil" } },
      { key: "B", label: { en: "Italy", es: "Italia" } },
      { key: "C", label: { en: "Uruguay", es: "Uruguay" } },
      { key: "D", label: { en: "Argentina", es: "Argentina" } },
    ],
    correctKey: "C",
  },
  {
    prompt: { en: "What is the maximum number of substitutions a team may make in regular time today?", es: "¿Cuántos cambios puede hacer un equipo en tiempo reglamentario hoy?" },
    options: [
      { key: "A", label: { en: "3", es: "3" } },
      { key: "B", label: { en: "4", es: "4" } },
      { key: "C", label: { en: "5", es: "5" } },
      { key: "D", label: { en: "6", es: "6" } },
    ],
    correctKey: "C",
  },
];

function utcDateNDaysAgo(n: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - n));
}

function randomInviteCode(rng: () => number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(rng() * chars.length)];
  return s;
}

/**
 * Seed (or re-seed) demo activity into the active staged tournament.
 * Returns a structured summary. Throws if no staged tournament/qual stage exists.
 */
export async function seedDemo(): Promise<SeedSummary> {
  const tournament = await prisma.tournament.findFirst({
    where: { type: "STAGED", archivedAt: null },
    orderBy: { isActive: "desc" },
  });
  if (!tournament) throw new Error("No staged tournament found to seed against.");

  const stages = await prisma.tournamentStage.findMany({
    where: { tournamentId: tournament.id },
    orderBy: { order: "asc" },
  });
  const qualStage = stages.find((s) => s.type === "GROUP_QUALIFICATION");
  const r32Stage = stages.find((s) => s.roundLabel === "R32" || s.name === "Round of 32");
  if (!qualStage) throw new Error("No Group Qualification stage found.");

  const teams = await prisma.team.findMany({ select: { id: true } });
  const allTeamIds = teams.map((t) => t.id);

  // Ensure the Group Qualification stage has an ACTUAL result, so demo scores,
  // leaderboards and the scoring-audit modal have real data to show (otherwise
  // every score is 0 and the audit reads "awaiting results"). Deterministic 32
  // qualifiers. Only seeds when no result exists — never clobbers real entered
  // results — and marks the stage SCORED so it presents as finished.
  let qualResult = await prisma.stageQualificationResult.findUnique({ where: { stageId: qualStage.id } });
  let qualifiersSeeded = false;
  const existingQualifiers = (qualResult?.qualifiers as string[] | undefined) ?? [];
  if (existingQualifiers.length === 0) {
    const qualifierCount = Math.min(32, allTeamIds.length);
    const chosen = shuffle(allTeamIds, mulberry32(424242)).slice(0, qualifierCount);
    qualResult = await prisma.stageQualificationResult.upsert({
      where: { stageId: qualStage.id },
      create: { stageId: qualStage.id, qualifiers: chosen },
      update: { qualifiers: chosen },
    });
    await prisma.tournamentStage.update({ where: { id: qualStage.id }, data: { status: "SCORED" } });
    qualifiersSeeded = true;
  }
  const qualifierIds = (qualResult?.qualifiers as string[] | undefined) ?? [];
  const qualifierSet = new Set(qualifierIds);
  const nonQualifierIds = allTeamIds.filter((id) => !qualifierSet.has(id));

  const r32Matches = r32Stage
    ? await prisma.stageMatch.findMany({
        where: { stageId: r32Stage.id },
        select: { id: true, homeTeamId: true, awayTeamId: true },
        orderBy: { matchNumber: "asc" },
      })
    : [];

  // ── 1. Wipe any previous demo data (cascades through demo users) ────────────
  const deleted = await prisma.user.deleteMany({ where: { email: { endsWith: `@${DEMO_DOMAIN}` } } });

  const passwordHash = hashPassword(DEMO_PASSWORD);
  let userCounter = 0;

  const summary: SeedSummary = {
    tournament: tournament.name,
    users: 0,
    groups: 0,
    groupNames: GROUP_NAMES,
    qualPredictions: 0,
    r32Predictions: 0,
    scores: 0,
    triviaQuestions: 0,
    cleared: deleted.count,
    adminEmail: DEMO_ADMIN_EMAIL,
    qualifiersSeeded,
    qualifierCount: qualifierIds.length,
    stages: [],
  };

  // ── 1b. Portal ADMIN demo account ───────────────────────────────────────────
  // Role ADMIN can reach /dashboard/admin (tournament/match management, scoring)
  // and bypasses group permissions (audit any group). Recreated each run.
  await prisma.user.create({
    data: { email: DEMO_ADMIN_EMAIL, name: "Demo Admin", passwordHash, role: "ADMIN", locale: "en" },
  });
  summary.users++;

  // ── 2. Create groups, members, predictions and scores ───────────────────────
  for (let g = 0; g < GROUP_NAMES.length; g++) {
    const rng = mulberry32(1000 + g); // stable per-group

    // Create this group's users.
    const groupUsers: { id: string }[] = [];
    for (let u = 0; u < USERS_PER_GROUP; u++) {
      const first = FIRST_NAMES[userCounter % FIRST_NAMES.length];
      const last = LAST_NAMES[(userCounter * 7) % LAST_NAMES.length];
      const email = `demo${userCounter + 1}@${DEMO_DOMAIN}`;
      const user = await prisma.user.create({
        data: { email, name: `${first} ${last}`, passwordHash, role: "USER", locale: g % 2 === 0 ? "es" : "en" },
        select: { id: true },
      });
      groupUsers.push(user);
      userCounter++;
      summary.users++;
    }

    const owner = groupUsers[0];
    const group = await prisma.groupRoom.create({
      data: {
        tournamentId: tournament.id,
        name: GROUP_NAMES[g],
        description: "Demo group for showcasing app activity.",
        ownerId: owner.id,
        inviteCode: randomInviteCode(rng),
        status: "APPROVED",
        memberCap: 20,
        memberships: {
          create: groupUsers.map((u, idx) => ({
            userId: u.id,
            role: idx === 0 ? "GROUP_ADMIN" : "MEMBER",
            isActive: true,
          })),
        },
      },
      select: { id: true },
    });
    summary.groups++;

    // Predictions + scores for each member.
    for (let m = 0; m < groupUsers.length; m++) {
      const user = groupUsers[m];
      const prng = mulberry32(7000 + g * 100 + m);

      // Group Qualification: pick exactly 32 teams with a controlled number of
      // correct picks so the leaderboard has a realistic spread (each correct
      // pick is worth 2 points → 34..62 pts here).
      const correctCount = 17 + Math.floor(prng() * 14); // 17..30
      const incorrectCount = 32 - correctCount; // 2..15 (≤16 non-qualifiers)
      const picks = [
        ...shuffle(qualifierIds, prng).slice(0, correctCount),
        ...shuffle(nonQualifierIds, prng).slice(0, incorrectCount),
      ];

      await prisma.stagePrediction.create({
        data: {
          userId: user.id,
          stageId: qualStage.id,
          groupId: group.id,
          qualificationPicks: picks,
          submittedAt: new Date(),
        },
      });
      summary.qualPredictions++;

      // Score it directly (demo members only) — mirrors lib/stage-scoring qual logic.
      const correctPicks = picks.filter((id) => qualifierSet.has(id)).length;
      await prisma.stageScore.create({
        data: {
          userId: user.id,
          stageId: qualStage.id,
          groupId: group.id,
          points: correctPicks * 2,
          correctPicks,
          breakdown: { correct: correctPicks, incorrect: 32 - correctPicks, total: 32 },
        },
      });
      summary.scores++;

      // Round of 32: submitted match picks (unscored — stage is still OPEN, no
      // winners yet), so members show as "submitted" awaiting results.
      if (r32Stage && r32Matches.length > 0) {
        const matchPicks = r32Matches.map((match) => ({
          matchId: match.id,
          winnerId: prng() < 0.5 ? match.homeTeamId : match.awayTeamId,
        }));
        await prisma.stagePrediction.create({
          data: {
            userId: user.id,
            stageId: r32Stage.id,
            groupId: group.id,
            matchPicks,
            submittedAt: new Date(),
          },
        });
        summary.r32Predictions++;
      }
    }
  }

  // ── 3. Daily trivia questions (today and the preceding days) ────────────────
  for (let i = 0; i < TRIVIA.length; i++) {
    const q = TRIVIA[i];
    const publishDate = utcDateNDaysAgo(i); // i=0 → today
    await prisma.triviaQuestion.upsert({
      where: { tournamentId_publishDate: { tournamentId: tournament.id, publishDate } },
      create: {
        tournamentId: tournament.id,
        publishDate,
        prompt: q.prompt,
        options: q.options,
        correctKey: q.correctKey,
        points: 2,
      },
      update: { prompt: q.prompt, options: q.options, correctKey: q.correctKey, points: 2 },
    });
    summary.triviaQuestions++;
  }

  // Report the stage inventory + statuses so callers know what's recordable
  // (e.g. whether an OPEN stage exists for a live pick / admin close-and-score).
  const finalStages = await prisma.tournamentStage.findMany({
    where: { tournamentId: tournament.id },
    orderBy: { order: "asc" },
    select: { name: true, type: true, status: true },
  });
  summary.stages = finalStages.map((s) => ({ name: s.name, type: s.type, status: s.status }));

  return summary;
}
