import { MatchStatus, PredictionScoreType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const EXACT_SCORE_POINTS = 5;
const CORRECT_RESULT_POINTS = 3;
const GROUP_POSITION_POINTS = 2;
const KNOCKOUT_SLOT_POINTS = 1;
const TIEBREAKER_EXACT_POINTS = 3;

function resultFromScore(home: number, away: number) {
  if (home > away) return "HOME";
  if (home < away) return "AWAY";
  return "DRAW";
}

type TournamentSnapshot = Prisma.TournamentGetPayload<{
  include: {
    groups: {
      include: {
        teams: {
          include: {
            team: true;
          };
        };
        matches: true;
      };
    };
    phases: true;
    tieBreakers: true;
    matches: {
      include: {
        phase: true;
        group: true;
        homeTeam: true;
        awayTeam: true;
      };
      orderBy: [{ phase: { sortOrder: "asc" } }, { sortOrder: "asc" }, { scheduledAt: "asc" }];
    };
  };
}>;

type SubmissionWithPrediction = Prisma.PredictionSubmissionGetPayload<{
  include: {
    prediction: {
      include: {
        entries: true;
        groupStandings: true;
        tieBreakerAnswers: true;
      };
    };
  };
}>;

function computeActualGroupStandings(tournament: TournamentSnapshot) {
  const byGroup = new Map<
    string,
    {
      complete: boolean;
      orderedTeamIds: string[];
    }
  >();

  for (const group of tournament.groups) {
    const table = new Map<string, { points: number; goalDiff: number; goalsFor: number; teamName: string }>();

    for (const membership of group.teams) {
      table.set(membership.team.id, {
        points: 0,
        goalDiff: 0,
        goalsFor: 0,
        teamName: membership.team.name,
      });
    }

    const finishedMatches = group.matches.filter(
      (match) =>
        match.status === MatchStatus.FINISHED &&
        match.homeTeamId &&
        match.awayTeamId &&
        match.homeScore != null &&
        match.awayScore != null
    );

    for (const match of finishedMatches) {
      const home = table.get(match.homeTeamId!);
      const away = table.get(match.awayTeamId!);
      if (!home || !away) continue;

      home.goalsFor += match.homeScore!;
      away.goalsFor += match.awayScore!;
      home.goalDiff += match.homeScore! - match.awayScore!;
      away.goalDiff += match.awayScore! - match.homeScore!;

      if (match.homeScore! > match.awayScore!) {
        home.points += 3;
      } else if (match.homeScore! < match.awayScore!) {
        away.points += 3;
      } else {
        home.points += 1;
        away.points += 1;
      }
    }

    const orderedTeamIds = [...table.entries()]
      .sort((a, b) => {
        const [teamIdA, statsA] = a;
        const [teamIdB, statsB] = b;
        return (
          statsB.points - statsA.points ||
          statsB.goalDiff - statsA.goalDiff ||
          statsB.goalsFor - statsA.goalsFor ||
          statsA.teamName.localeCompare(statsB.teamName) ||
          teamIdA.localeCompare(teamIdB)
        );
      })
      .map(([teamId]) => teamId);

    byGroup.set(group.id, {
      complete: group.matches.length > 0 && group.matches.every((match) => match.status === MatchStatus.FINISHED),
      orderedTeamIds,
    });
  }

  return byGroup;
}

async function upsertScore(
  submissionId: string,
  scoreKey: string,
  scoreType: PredictionScoreType,
  points: number,
  options: {
    matchId?: string | null;
    groupId?: string | null;
    questionId?: string | null;
    label?: string | null;
  } = {}
) {
  return prisma.predictionScore.upsert({
    where: {
      submissionId_scoreKey: {
        submissionId,
        scoreKey,
      },
    },
    create: {
      submissionId,
      scoreKey,
      scoreType,
      points,
      matchId: options.matchId ?? null,
      groupId: options.groupId ?? null,
      questionId: options.questionId ?? null,
      label: options.label ?? null,
    },
    update: {
      scoreType,
      points,
      matchId: options.matchId ?? null,
      groupId: options.groupId ?? null,
      questionId: options.questionId ?? null,
      label: options.label ?? null,
    },
  });
}

async function recalculateSubmissionScores(
  submission: SubmissionWithPrediction,
  tournament: TournamentSnapshot,
  actualStandings: ReturnType<typeof computeActualGroupStandings>
) {
  const scoreOps: Promise<unknown>[] = [];
  const predictionEntries = new Map(submission.prediction.entries.map((entry) => [entry.matchId, entry]));

  for (const match of tournament.matches) {
    const entry = predictionEntries.get(match.id);
    if (!entry) continue;

    const matchLabel = match.label ?? `${match.homeTeam?.name ?? match.homePlaceholder ?? "TBD"} vs ${match.awayTeam?.name ?? match.awayPlaceholder ?? "TBD"}`;

    if (entry.predictedHomeScore != null && entry.predictedAwayScore != null) {
      const finished =
        match.status === MatchStatus.FINISHED &&
        match.homeScore != null &&
        match.awayScore != null;

      let points = 0;
      if (finished) {
        const predictedResult = resultFromScore(entry.predictedHomeScore, entry.predictedAwayScore);
        const actualResult = resultFromScore(match.homeScore!, match.awayScore!);
        points =
          entry.predictedHomeScore === match.homeScore && entry.predictedAwayScore === match.awayScore
            ? EXACT_SCORE_POINTS
            : predictedResult === actualResult
              ? CORRECT_RESULT_POINTS
              : 0;
      }

      scoreOps.push(
        upsertScore(submission.id, `match:${match.id}`, PredictionScoreType.MATCH, points, {
          matchId: match.id,
          label: matchLabel,
        })
      );
    }

    if (match.phase.isKnockout) {
      let points = 0;
      if (match.homeTeamId && match.awayTeamId) {
        if (entry.predictedHomeTeamId && entry.predictedHomeTeamId === match.homeTeamId) {
          points += KNOCKOUT_SLOT_POINTS;
        }
        if (entry.predictedAwayTeamId && entry.predictedAwayTeamId === match.awayTeamId) {
          points += KNOCKOUT_SLOT_POINTS;
        }
      }

      scoreOps.push(
        upsertScore(submission.id, `knockout:${match.id}`, PredictionScoreType.KNOCKOUT, points, {
          matchId: match.id,
          label: match.phase.name,
        })
      );
    }
  }

  for (const standing of submission.prediction.groupStandings) {
    const actual = actualStandings.get(standing.groupId);
    const complete = actual?.complete ?? false;
    const actualTeamId = complete ? actual!.orderedTeamIds[standing.position - 1] : null;
    const points = complete && actualTeamId === standing.teamId ? GROUP_POSITION_POINTS : 0;

    scoreOps.push(
      upsertScore(
        submission.id,
        `standing:${standing.groupId}:${standing.position}`,
        PredictionScoreType.GROUP_STANDING,
        points,
        {
          groupId: standing.groupId,
          label: `Position ${standing.position}`,
        }
      )
    );
  }

  for (const answer of submission.prediction.tieBreakerAnswers) {
    const question = tournament.tieBreakers.find((item) => item.id === answer.questionId);
    if (!question?.correctAnswer?.trim()) continue;

    const points =
      question.correctAnswer.trim().toLowerCase() === answer.answer.trim().toLowerCase()
        ? TIEBREAKER_EXACT_POINTS
        : 0;

    scoreOps.push(
      upsertScore(submission.id, `tiebreaker:${question.id}`, PredictionScoreType.TIEBREAKER, points, {
        questionId: question.id,
        label: question.prompt,
      })
    );
  }

  await Promise.all(scoreOps);
}

export async function recalculateTournamentScores(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      groups: {
        include: {
          teams: {
            include: {
              team: true,
            },
          },
          matches: true,
        },
        orderBy: { sortOrder: "asc" },
      },
      phases: true,
      tieBreakers: true,
      matches: {
        include: {
          phase: true,
          group: true,
          homeTeam: true,
          awayTeam: true,
        },
        orderBy: [{ phase: { sortOrder: "asc" } }, { sortOrder: "asc" }, { scheduledAt: "asc" }],
      },
    },
  });

  if (!tournament) return;

  const submissions = await prisma.predictionSubmission.findMany({
    where: {
      prediction: {
        tournamentId,
      },
    },
    include: {
      prediction: {
        include: {
          entries: true,
          groupStandings: true,
          tieBreakerAnswers: true,
        },
      },
    },
  });

  const actualStandings = computeActualGroupStandings(tournament);

  await Promise.all(
    submissions.map((submission) => recalculateSubmissionScores(submission, tournament, actualStandings))
  );
}

export async function recalculateSubmissionByPrediction(predictionId: string) {
  const submission = await prisma.predictionSubmission.findFirst({
    where: { predictionId },
    include: {
      prediction: {
        include: {
          entries: true,
          groupStandings: true,
          tieBreakerAnswers: true,
        },
      },
    },
  });

  if (!submission) return;

  await recalculateTournamentScores(submission.prediction.tournamentId);
}
