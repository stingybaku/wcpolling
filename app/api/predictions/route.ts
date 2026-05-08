import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentTournament, getCurrentUser, unauthorized, badRequest } from "@/app/api/helpers";
import { populatePredictionR32Bracket } from "@/lib/prediction-bracket";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const tournament = await getCurrentTournament(request.nextUrl.searchParams.get("tournamentId"));
  if (!tournament) {
    return new Response(JSON.stringify({ predictions: [], tournament: null }), { status: 200 });
  }

  const predictions = await prisma.prediction.findMany({
    where: {
      userId: user.id,
      tournamentId: tournament?.id,
    },
    include: {
      entries: {
        include: {
          match: {
            include: {
              phase: true,
              group: true,
              homeTeam: true,
              awayTeam: true,
            },
          },
          predictedHomeTeam: true,
          predictedAwayTeam: true,
        },
      },
      groupStandings: {
        include: {
          group: true,
          team: true,
        },
        orderBy: [{ group: { sortOrder: "asc" } }, { position: "asc" }],
      },
      thirdPlaceRankings: {
        orderBy: { rank: "asc" },
      },
      tieBreakerAnswers: {
        include: {
          question: true,
        },
        orderBy: { question: { sortOrder: "asc" } },
      },
      submissions: {
        include: {
          group: true,
          scores: {
            orderBy: [{ scoreType: "asc" }, { label: "asc" }],
          },
        },
      },
      tournament: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  return new Response(JSON.stringify({ predictions, tournament }), { status: 200 });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  const body = await request.json();
  const tournament = await getCurrentTournament(String(body.tournamentId ?? "").trim() || null);
  if (!tournament) return badRequest("No tournament configured");
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  type PredictionEntryData = {
    matchId: string;
    predictedHomeTeamId?: string | null;
    predictedAwayTeamId?: string | null;
    predictedHomeScore?: number | null;
    predictedAwayScore?: number | null;
  };
  type StandingData = {
    groupId: string;
    teamId: string;
    position: number;
  };
  type TieBreakerData = {
    questionId: string;
    answer: string;
  };

  const entries = Array.isArray(body.entries) ? body.entries : [];
  const groupStandings = Array.isArray(body.groupStandings) ? (body.groupStandings as StandingData[]) : [];
  const tieBreakerAnswers = Array.isArray(body.tieBreakerAnswers) ? (body.tieBreakerAnswers as TieBreakerData[]) : [];
  const thirdPlaceRankingIds: string[] = Array.isArray(body.thirdPlaceRanking) ? body.thirdPlaceRanking.map(String) : [];
  if (!name) return badRequest("Prediction name is required");

  const prediction = await prisma.prediction.create({
    data: {
      userId: user.id,
      tournamentId: tournament.id,
      name,
      description,
      entries: {
        create: entries.map((entry: PredictionEntryData) => ({
          matchId: String(entry.matchId),
          predictedHomeTeamId: entry.predictedHomeTeamId ? String(entry.predictedHomeTeamId) : null,
          predictedAwayTeamId: entry.predictedAwayTeamId ? String(entry.predictedAwayTeamId) : null,
          predictedHomeScore: entry.predictedHomeScore == null ? null : Number(entry.predictedHomeScore),
          predictedAwayScore: entry.predictedAwayScore == null ? null : Number(entry.predictedAwayScore),
        })),
      },
      groupStandings: {
        create: groupStandings
          .filter((standing) => String(standing.teamId ?? "").trim())
          .map((standing) => ({
            groupId: String(standing.groupId),
            teamId: String(standing.teamId),
            position: Number(standing.position),
          })),
      },
      thirdPlaceRankings: {
        create: thirdPlaceRankingIds
          .filter((teamId) => teamId.trim())
          .map((teamId, i) => ({ teamId, rank: i + 1 })),
      },
      tieBreakerAnswers: {
        create: tieBreakerAnswers
          .filter((answer) => String(answer.answer ?? "").trim())
          .map((answer) => ({
            questionId: String(answer.questionId),
            answer: String(answer.answer),
          })),
      },
    },
    include: {
      entries: true,
      groupStandings: true,
      thirdPlaceRankings: true,
      tieBreakerAnswers: true,
    },
  });

  if (!body.skipBracketPopulation) {
    populatePredictionR32Bracket(prediction.id).catch(() => {});
  }

  return new Response(JSON.stringify({ prediction }), { status: 201 });
}
