import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, getCurrentTournament, getCurrentUser, unauthorized } from "@/app/api/helpers";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") throw forbidden("Admin only");
  return user;
}

type GroupInput = { name: string; sortOrder?: number };
type PhaseInput = { name: string; slug: string; sortOrder?: number; isKnockout?: boolean; teamCount?: number | null };
type TieBreakerInput = { prompt: Record<string, string>; sortOrder?: number; type?: "NUMBER" | "TEXT" };
type TagInput = { name: string };

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  const tournament = await getCurrentTournament(request.nextUrl.searchParams.get("tournamentId"), { allowArchived: true });
  return new Response(JSON.stringify({ tournament }), { status: 200 });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return unauthorized();

  try {
    const body = await request.json();
    const tournamentId = String(body.id ?? "").trim() || null;
    const name = String(body.name ?? "").trim();
    const description = String(body.description ?? "").trim() || null;
    const slug = String(body.slug ?? "").trim().toLowerCase();
    const teamsPerGroup = body.teamsPerGroup == null || body.teamsPerGroup === "" ? null : Number(body.teamsPerGroup);
    const submissionDeadline = body.submissionDeadline ? new Date(body.submissionDeadline) : null;
    const groups = Array.isArray(body.groups) ? (body.groups as Array<GroupInput & { id?: string }>) : [];
    const phases = Array.isArray(body.phases) ? (body.phases as Array<PhaseInput & { id?: string }>) : [];
    const tieBreakers = Array.isArray(body.tieBreakers) ? (body.tieBreakers as Array<TieBreakerInput & { id?: string; correctAnswer?: string | null }>) : [];
    const tags = Array.isArray(body.tags) ? (body.tags as TagInput[]) : [];

    const tournamentType = String(body.type ?? "CLASSIC").trim();
    if (!name || !slug) return badRequest("Tournament name and slug are required");
    if (tournamentType !== "STAGED") {
      if (groups.length === 0) return badRequest("At least one group is required");
      if (phases.length === 0) return badRequest("At least one phase is required");
    }

    await prisma.tournament.updateMany({
      where: { isActive: true, ...(tournamentId ? { id: { not: tournamentId } } : {}) },
      data: { isActive: false },
    });

    const targetTournament = tournamentId
      ? await prisma.tournament.update({
          where: { id: tournamentId },
          data: {
            name,
            slug,
            description,
            teamsPerGroup,
            submissionDeadline,
            isActive: true,
          },
        })
      : await prisma.tournament.upsert({
          where: { slug },
          update: {
            name,
            description,
            teamsPerGroup,
            submissionDeadline,
            isActive: true,
          },
          create: {
            name,
            slug,
            description,
            teamsPerGroup,
            submissionDeadline,
            isActive: true,
          },
        });

    const normalizedGroups = groups
      .map((group, index) => ({
        id: group.id ? String(group.id) : undefined,
        name: String(group.name ?? "").trim(),
        sortOrder: Number(group.sortOrder ?? index),
      }))
      .filter((group) => group.name);

    const normalizedPhases = phases
      .map((phase, index) => ({
        id: phase.id ? String(phase.id) : undefined,
        name: String(phase.name ?? "").trim(),
        slug: String(phase.slug ?? "").trim().toLowerCase(),
        sortOrder: Number(phase.sortOrder ?? index),
        isKnockout: Boolean(phase.isKnockout),
        teamCount: phase.teamCount == null ? null : Number(phase.teamCount),
      }))
      .filter((phase) => phase.name && phase.slug);

    const normalizedTieBreakers = tieBreakers
      .map((question, index) => {
        const prompt: Record<string, string> =
          question.prompt && typeof question.prompt === "object"
            ? Object.fromEntries(
                Object.entries(question.prompt).map(([k, v]) => [k, String(v ?? "").trim()])
              )
            : { en: "" };
        return {
          id: question.id ? String(question.id) : undefined,
          prompt,
          sortOrder: Number(question.sortOrder ?? index),
          type: (question.type === "TEXT" ? "TEXT" : "NUMBER") as "TEXT" | "NUMBER",
          correctAnswer: question.correctAnswer == null ? null : String(question.correctAnswer),
        };
      })
      .filter((question) => Object.values(question.prompt).some((v) => v));

    const normalizedTags = Array.from(
      new Map(
        tags
          .map((tag) => String(tag.name ?? "").trim())
          .filter(Boolean)
          .map((name) => [slugify(name), { name, slug: slugify(name) }]),
      ).values(),
    ).filter((tag) => tag.slug);

    const keptGroupIds = normalizedGroups.flatMap((group) => (group.id ? [group.id] : []));
    const keptPhaseIds = normalizedPhases.flatMap((phase) => (phase.id ? [phase.id] : []));
    const keptTieBreakerIds = normalizedTieBreakers.flatMap((question) => (question.id ? [question.id] : []));

    for (const group of normalizedGroups) {
      if (group.id) {
        await prisma.tournamentGroup.update({
          where: { id: group.id },
          data: {
            name: `__tmp_group__${group.id}`,
            sortOrder: group.sortOrder,
          },
        });
      }
    }

    for (const phase of normalizedPhases) {
      if (phase.id) {
        await prisma.tournamentPhase.update({
          where: { id: phase.id },
          data: {
            name: `__tmp_phase__${phase.id}`,
            slug: `tmp-${phase.id}`,
            sortOrder: phase.sortOrder,
            isKnockout: phase.isKnockout,
            teamCount: phase.teamCount,
          },
        });
      }
    }

    await prisma.tournamentGroup.deleteMany({
      where: {
        tournamentId: targetTournament.id,
        id: { notIn: keptGroupIds },
      },
    });

    await prisma.tournamentPhase.deleteMany({
      where: {
        tournamentId: targetTournament.id,
        id: { notIn: keptPhaseIds },
      },
    });

    await prisma.tieBreakerQuestion.deleteMany({
      where: {
        tournamentId: targetTournament.id,
        id: { notIn: keptTieBreakerIds },
      },
    });

    await prisma.tournamentTag.deleteMany({
      where: { tournamentId: targetTournament.id },
    });

    for (const group of normalizedGroups) {
      if (group.id) {
        await prisma.tournamentGroup.update({
          where: { id: group.id },
          data: { name: group.name, sortOrder: group.sortOrder },
        });
      } else {
        await prisma.tournamentGroup.create({
          data: {
            tournamentId: targetTournament.id,
            name: group.name,
            sortOrder: group.sortOrder,
          },
        });
      }
    }

    for (const phase of normalizedPhases) {
      if (phase.id) {
        await prisma.tournamentPhase.update({
          where: { id: phase.id },
          data: {
            name: phase.name,
            slug: phase.slug,
            sortOrder: phase.sortOrder,
            isKnockout: phase.isKnockout,
            teamCount: phase.teamCount,
          },
        });
      } else {
        await prisma.tournamentPhase.create({
          data: {
            tournamentId: targetTournament.id,
            name: phase.name,
            slug: phase.slug,
            sortOrder: phase.sortOrder,
            isKnockout: phase.isKnockout,
            teamCount: phase.teamCount,
          },
        });
      }
    }

    for (const question of normalizedTieBreakers) {
      if (question.id) {
        await prisma.tieBreakerQuestion.update({
          where: { id: question.id },
          data: {
            prompt: question.prompt as Record<string, string>,
            sortOrder: question.sortOrder,
            type: question.type,
            correctAnswer: question.correctAnswer,
          },
        });
      } else {
        await prisma.tieBreakerQuestion.create({
          data: {
            tournamentId: targetTournament.id,
            prompt: question.prompt as Record<string, string>,
            sortOrder: question.sortOrder,
            type: question.type,
            correctAnswer: question.correctAnswer,
          },
        });
      }
    }

    if (normalizedTags.length > 0) {
      await prisma.tournamentTag.createMany({
        data: normalizedTags.map((tag) => ({
          tournamentId: targetTournament.id,
          name: tag.name,
          slug: tag.slug,
        })),
      });
    }

    const tournament = await prisma.tournament.findUniqueOrThrow({
      where: { id: targetTournament.id },
      include: {
        groups: { orderBy: { sortOrder: "asc" } },
        phases: { orderBy: { sortOrder: "asc" } },
        tieBreakers: { orderBy: { sortOrder: "asc" } },
        tags: { orderBy: { name: "asc" } },
      },
    });

    return new Response(JSON.stringify({ tournament }), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save tournament.";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
