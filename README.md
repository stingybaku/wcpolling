# World Cup 2026 Prediction Platform

A fullstack Next.js platform for group-based football prediction games with
admin-run tournaments, automatic scoring, and per-group leaderboards. Built for
the FIFA World Cup 2026 but tournament-agnostic.

## Tech Stack

- **Next.js 16** (App Router) + **React 19**
- **PostgreSQL** via **Prisma 7** using the `@prisma/adapter-pg` driver adapter
- **NextAuth 4** (Google, Facebook, email/password)
- **next-intl 4** — English + Spanish, locale-prefixed routing (`/[locale]/…`)
- **Tailwind CSS 4**
- **Resend** for transactional email
- **Zod 4** for validation

## Features

### Tournament modes

The platform supports two prediction formats per tournament (`TournamentType`):

- **Classic** — players predict the *entire* tournament up front (every
  scoreline, group standings, knockout slots, tiebreaker questions), submit one
  selected prediction per group, and are scored as results come in.
- **Staged** — the admin opens the tournament one **stage** at a time
  (group-qualification and knockout rounds). Each stage has an open/close window;
  players predict just that stage, the admin locks and scores it, and per-stage
  plus cumulative leaderboards update. Stages move through
  `UPCOMING → OPEN → CLOSED → SCORED`.

### Core capabilities

- Social login (Google, Facebook) plus email/password with token-based password
  reset (emails sent via Resend)
- Role-based access control (`USER` / `ADMIN`); group-level roles
  (`MEMBER` / `GROUP_ADMIN`)
- Profile editing and avatar upload
- Private group rooms with auto-generated invite codes; join by code
- Multiple prediction drafts per tournament; select one to submit per group
- Admin console: tournaments, teams, matches, results, users, newsroom, and
  staged-tournament stage management
- Match participants by direct team assignment **or** dynamic resolution
  (group winners/losers, best third-place) via iterative bracket resolution
- Tiebreaker questions, group-standing predictions, and knockout-slot predictions
- Automatic scoring on result entry; per-group leaderboards with score breakdown
- **Newsroom**: NewsAPI / GNews integrations, tag-based article matching per
  tournament, admin-triggered sync with URL dedup, and sponsored placements
  (priority ranking + active date ranges)
- Transactional emails for deadlines, submissions, stage open/scored, group
  membership changes, admin promotion, reactivation, and more
- Cron-driven deadline reminders (`/api/cron/deadline-reminder`)
- Internationalization (English/Spanish) with domain-based locale defaults
- Dark/light mode, adjustable text size (accessibility), responsive layout

### Scoring

**Classic** (`lib/scoring.ts`): exact score **5**, correct result **3**, group
standing position **2**, knockout slot **1**, exact tiebreaker **3**.

**Staged** (`lib/stage-scoring.ts`): group-qualification stages award
`2 × correct picks`; knockout stages award `correct picks × round value` (later
rounds worth more).

## Local Setup

Requires Node `>=20.19` and a local PostgreSQL database.

1. Clone and install:

   ```bash
   git clone <your-repo-url>
   cd wcpolling
   npm install
   ```

2. Configure `.env` (see `.env.example`):

   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/wcpolling"
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your-secret"        # openssl rand -base64 32
   GOOGLE_CLIENT_ID=""
   GOOGLE_CLIENT_SECRET=""
   FACEBOOK_CLIENT_ID=""
   FACEBOOK_CLIENT_SECRET=""
   RESEND_API_KEY=""                    # required for password reset / emails
   RESEND_FROM="noreply@yourdomain.com"
   NEWS_PROVIDER=""                     # "newsapi" or "gnews" (optional)
   NEWSAPI_KEY=""
   GNEWS_API_KEY=""
   ```

3. Apply migrations and (optionally) seed the WC2026 tournament + teams:

   ```bash
   npx prisma migrate deploy   # or: npx prisma migrate dev
   npx prisma db seed          # seeds FIFA World Cup 2026 tournament and teams
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) (redirects to `/en` or
   `/es`).

### Creating an admin (local)

The seed does not create users. Register a normal account through the UI, then
promote it to `ADMIN`. Easiest options:

- **Prisma Studio:** `npx prisma studio`, open the `User` table, set `role` to
  `ADMIN`.
- **One-off script** (consistent with the app's pg adapter):

  ```bash
  cat <<'TS' | npx tsx -
  import { PrismaClient } from "@prisma/client";
  import { PrismaPg } from "@prisma/adapter-pg";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  await prisma.user.update({ where: { email: "you@example.com" }, data: { role: "ADMIN" } });
  console.log("Promoted to ADMIN");
  await prisma.$disconnect();
  TS
  ```

Once signed in as admin, open `/dashboard/admin`.

## Key API Endpoints

Auth & profile
- `POST /api/auth/[...nextauth]` — authentication
- `POST /api/auth/register` — account registration
- `POST /api/auth/reset-password/request|confirm` — password reset

Predictions & groups (classic)
- `GET/POST /api/predictions`, `PUT /api/predictions/[id]`,
  `POST /api/predictions/[id]/select`
- `GET/POST /api/groups`, `POST /api/groups/join`,
  `GET /api/groups/[groupId]`, `POST /api/groups/[groupId]/submit`
- `/api/groups/[groupId]/members` — membership management

Staged tournaments
- `/api/staged/tournaments`, `/api/staged/stages/[stageId]`,
  `/api/staged/groups/[groupId]/…` — player-facing staged play and leaderboards
- `/api/admin/staged/…` — admin stage open/close/lock/score/reset and results

Admin
- `/api/admin/tournaments`, `/api/admin/teams`, `/api/admin/matches/[matchId]/result`
- `/api/admin/tournament/resolve-bracket`, `…/tiebreakers`, `…/standings`
- `/api/admin/users`, `/api/admin/news/sync`, `/api/admin/sponsored`

Other
- `GET /api/news` — newsroom feed for the active tournament
- `GET /api/cron/deadline-reminder` — cron-triggered reminders (requires
  `x-cron-secret: $CRON_SECRET` header)
- `GET /api/health` — health check (returns `ok`)

## Deployment

The app reads `DATABASE_URL` and connects with the `pg` driver adapter, so it
runs on any host with a PostgreSQL connection.

### Railway

1. Connect the GitHub repo to a Railway project.
2. Set env vars (same as `.env`, plus OAuth/Resend secrets).
3. Build with `npm run build`; `npm run start` runs `prisma migrate deploy`
   then starts the server. `railway.toml` configures the build and
   `/api/health` healthcheck.

### Vercel

1. Import the repo; set the same env vars (omit `DATABASE_URL` only if using the
   IAM-auth setup that lives on the `vercel-deployment` branch).
2. **Postgres TLS:** the JS `pg` driver verifies the server certificate chain by
   default. For most managed Postgres providers append `?sslmode=no-verify` to
   `DATABASE_URL` (encrypts without CA verification), or supply a CA bundle to
   `PrismaPg({ ssl: { ca } })` for full verification. Without this, runtime DB
   queries fail with `P1011: unable to get local issuer certificate` (it first
   surfaces during OAuth login).
3. Run migrations against the production database (`prisma migrate deploy`).

For cron reminders, schedule a request to `/api/cron/deadline-reminder` with the
`x-cron-secret` header set to `CRON_SECRET`.

## Notes

- Keep `NEXTAUTH_SECRET` and `CRON_SECRET` secret in production.
- No payment integrations — predictions only.
- For the newsroom, set `NEWS_PROVIDER` to `newsapi` or `gnews` and provide the
  matching API key.
- Scoring rules live in `lib/scoring.ts` (classic) and `lib/stage-scoring.ts`
  (staged).
- Internationalization messages are in `messages/en.json` and `messages/es.json`.
- After schema changes, create a migration with `npx prisma migrate dev` and
  keep `prisma/migrations` in sync.
