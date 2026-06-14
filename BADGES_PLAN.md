# Gamification: Badges (staged tournament)

Plan for per-group achievement badges in the **staged** tournament variant. Badges are
awarded **per group** (a user can earn the same badge in each group they're in) and all
user-facing text goes through the existing next-intl (en/es) pipeline — the DB stores
**slugs and numeric params only**, never display strings.

## 1. Data model

Slugs are the single source of truth: a slug is both the i18n key and the criteria id.

```prisma
enum BadgeCategory {
  SKILL
  CONSISTENCY
  UNLOCK
  SOCIAL
}

model Badge {
  id        String        @id @default(cuid())
  slug      String        @unique          // "clean_sweep" — i18n key + criteria id
  category  BadgeCategory
  icon      String?                         // icon name / emoji ref, NOT display text
  active    Boolean       @default(true)
  createdAt DateTime      @default(now())

  userBadges UserBadge[]
}

model UserBadge {
  id      String @id @default(cuid())
  userId  String
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  badgeId String
  badge   Badge  @relation(fields: [badgeId], references: [id], onDelete: Cascade)

  // Context — badges are per-group, and either per-stage or per-tournament.
  groupId      String
  group        GroupRoom        @relation(fields: [groupId], references: [id], onDelete: Cascade)
  tournamentId String
  tournament   Tournament       @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  stageId      String?
  stage        TournamentStage? @relation(fields: [stageId], references: [id], onDelete: SetNull)

  // Idempotency discriminator: stageId for stage badges, "tournament" for tournament-level.
  // Avoids Postgres "NULLs are distinct" defeating a nullable-stageId unique constraint.
  contextKey String

  // Only dynamic numeric values that can't be re-derived from relations (e.g. streak length).
  // Group/stage/tournament NAMES are resolved from relations at render time, never stored.
  params Json?

  awardedAt DateTime @default(now())

  @@unique([userId, badgeId, groupId, contextKey])
  @@index([userId])
  @@index([groupId, tournamentId])
}
```

Add back-relations: `userBadges UserBadge[]` on `User`, `GroupRoom`, `Tournament`, `TournamentStage`.

`groupId` already determines `tournamentId` (a GroupRoom belongs to one tournament);
`tournamentId` is denormalized only for cheap indexing/queries.

## 2. v1 badge catalog (6)

| slug | category | scope | criteria (grounded in `lib/stage-scoring.ts`) |
|------|----------|-------|-----------|
| `clean_sweep`  | SKILL       | stage      | GROUP_QUALIFICATION: `breakdown.incorrect === 0 && breakdown.correct === qualifierCount`. KNOCKOUT: `correctPicks === matchCount` for the stage. Requires a submitted prediction with ≥1 pick. |
| `stage_mvp`    | SKILL       | stage      | Highest `StageScore.points` in the group for that stage, `points > 0`. Ties → all top-scorers. |
| `hot_streak`   | CONSISTENCY | stage      | `points > 0` in this stage and the previous N−1 stages by `order` (N=3). `params: { count }`. |
| `ever_present` | CONSISTENCY | tournament | Submitted (`submittedAt != null`) in **every** stage of the tournament for that group. |
| `locked_in`    | UNLOCK      | tournament | Σ `StagePrediction.unlockCount` across the group's stages `=== 0`, and the user submitted ≥1 stage (excludes inactive members). |
| `top_of_table` | SOCIAL      | tournament | Final group rank `=== 1` (rank already computed in finalize route). Ties → all rank-1. |

**Deferred (v2):** `climber` (needs prior-stage rank snapshot), `podium` (rank ≤ 3),
`founder`/`recruiter` (growth-oriented), `clutch_revision` (needs per-pick unlock history we
don't currently store).

## 3. Award hooks (idempotent, reuse existing loops)

Both evaluators upsert on `@@unique([userId, badgeId, groupId, contextKey])`, so re-scoring or
re-finalizing is safe.

**`evaluateStageBadges(stageId)`** — call in
`app/api/admin/staged/stages/[stageId]/score/route.ts`, right after `scoreStage(stageId)` and
the `status: "SCORED"` update. Awards `clean_sweep`, `stage_mvp`, `hot_streak`. The route
already loads each group's active members + `stageScores` + cumulative — feed that straight in.

**`evaluateTournamentBadges(tournamentId)`** — call in
`app/api/admin/staged/tournaments/[id]/finalize/route.ts`, right after setting `finalizedAt`.
Awards `ever_present`, `locked_in`, `top_of_table`. The route already computes per-group
`rankMap` and cumulative points — reuse them.

`contextKey` = `stageId` for stage badges, the literal `"tournament"` for tournament-level.

Newly-awarded badges can ride the **existing localized email loops** in both routes (each
member already has `user.locale`), plus an in-app toast.

## 4. i18n keys

New `badges` namespace in `messages/en.json` and `messages/es.json`. Dynamic names
(`{stageName}`, `{groupName}`, `{tournamentName}`) are interpolation params resolved from
relations **at render time** in the viewer's locale — reuse the existing round-label
localization for `{stageName}` rather than the raw `stage.name`.

```jsonc
// messages/en.json
"badges": {
  "earnedTitle": "New badge unlocked!",
  "category": {
    "skill": "Skill",
    "consistency": "Consistency",
    "unlock": "Discipline",
    "social": "Social"
  },
  "clean_sweep":  { "name": "Clean Sweep",      "desc": "Every pick correct in {stageName}." },
  "stage_mvp":    { "name": "Stage MVP",         "desc": "Top scorer in {groupName} for {stageName}." },
  "hot_streak":   { "name": "Hot Streak",        "desc": "Scored in {count} stages running." },
  "ever_present": { "name": "Ever-Present",      "desc": "Submitted predictions in every stage of {tournamentName}." },
  "locked_in":    { "name": "Locked In",         "desc": "Finished {tournamentName} without using a single unlock." },
  "top_of_table": { "name": "Top of the Table",  "desc": "Finished #1 in {groupName}." }
}
```

```jsonc
// messages/es.json
"badges": {
  "earnedTitle": "¡Nueva insignia desbloqueada!",
  "category": {
    "skill": "Habilidad",
    "consistency": "Constancia",
    "unlock": "Disciplina",
    "social": "Social"
  },
  "clean_sweep":  { "name": "Pleno",             "desc": "Todas tus predicciones acertadas en {stageName}." },
  "stage_mvp":    { "name": "MVP de la fase",    "desc": "Máxima puntuación en {groupName} en {stageName}." },
  "hot_streak":   { "name": "Racha",             "desc": "Puntuaste en {count} fases seguidas." },
  "ever_present": { "name": "Siempre presente",  "desc": "Enviaste predicciones en todas las fases de {tournamentName}." },
  "locked_in":    { "name": "Sin cambios",       "desc": "Terminaste {tournamentName} sin usar ni un solo desbloqueo." },
  "top_of_table": { "name": "Líder del grupo",   "desc": "Terminaste en el puesto #1 de {groupName}." }
}
```

## 5. Display

- **Profile** — badge shelf grouped by `Badge.category`.
- **Group page leaderboard** — badge icons next to each member (social proof).
- **Earn moment** — append earned badges to the existing stage-scored / tournament-finalized
  email, plus an in-app toast using `badges.earnedTitle`.

## 6. Rollout

1. Migration: add `Badge`, `UserBadge`, `BadgeCategory` enum + back-relations.
2. Seed the `Badge` catalog rows (slugs only) in `prisma/seed.ts`.
3. Build `lib/badges.ts` with `evaluateStageBadges` / `evaluateTournamentBadges`; wire the two routes.
4. Add the `badges` i18n namespace + render helpers.
5. **Backfill** once after deploy: run `evaluateStageBadges` for every SCORED stage and
   `evaluateTournamentBadges` for every finalized tournament — all criteria are derivable from
   existing data, so existing users light up immediately.

**Deploy note:** migrations now run via `vercel-build`; ensure the catalog seed runs on deploy
too (either in the migrate step or a one-off), since `prisma migrate deploy` does not seed.
