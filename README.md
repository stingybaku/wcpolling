# World Cup 2026 Prediction Platform

A fullstack Next.js platform for group-based match predictions with admin scoring.

## Features

- Social login via Google and Facebook (plus credentials fallback)
- Users can create and join groups with invite codes
- Users create multiple prediction drafts and select one per group
- Admin can create teams, create matches, and update match results
- Automatic scoring for predictions when results are set
- Group-only submission visibility and per-group leaderboard
- No payment collection (prediction-only)

## Local Setup

1. Clone and install:

```bash
git clone <your-repo-url>
cd wcpolling
npm install
```

2. Configure `.env`:

```env
# Local Postgres connection. The app uses the node-postgres (`pg`) Prisma adapter.
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/wcpolling?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
FACEBOOK_CLIENT_ID=""
FACEBOOK_CLIENT_SECRET=""
NEWS_PROVIDER=""
NEWSAPI_KEY=""
GNEWS_API_KEY=""
```

3. Generate the Prisma client and apply migrations (optionally seed):

```bash
npx prisma generate
npx prisma migrate dev
npx prisma db seed   # optional: loads the World Cup 2026 teams, groups, and bracket
```

4. Start dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Admin login (local)

To login as admin locally, run this script once after database setup:

```bash
node - <<'NODE'
const { randomBytes, scryptSync } = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

(function seed() {
  const password = 'Admin123!';
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  const passwordHash = `${salt}:${hash}`;

(async () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  await prisma.user.upsert({
    where: { email: 'admin@worldcup.com' },
    update: { name: 'Admin', role: 'ADMIN', passwordHash },
    create: { email: 'admin@worldcup.com', name: 'Admin', role: 'ADMIN', passwordHash },
  });
  console.log('Admin user ready: admin@worldcup.com / Admin123!');
  await prisma.$disconnect();
})();
})();
NODE
```

Then sign in at `/auth/signin`:

1. Choose "Sign in with Email".
2. Enter `admin@worldcup.com`.
3. Enter password `Admin123!`.
4. For OAuth, use a Google/Facebook account with the same email mapped to this user.

Once signed in as admin, open `/dashboard/admin`.

## API Endpoints

- `POST /api/auth/[...nextauth]` - authentication
- `GET/POST /api/groups` - list/create groups
- `POST /api/groups/join` - join group by code
- `GET /api/groups/[groupId]` - group details
- `POST /api/groups/[groupId]/submit` - submit selected prediction
- `GET/POST /api/predictions` - manage prediction drafts
- `POST /api/predictions/[id]/select` - set selected prediction
- Admin endpoints for teams and matches under `/api/admin`
- `GET /api/news` - newsroom feed for the selected tournament
- `POST /api/admin/news/sync` - admin-only newsroom sync for one or all tournaments
- `GET/POST /api/admin/sponsored` - admin sponsored newsroom placements
- `PUT/DELETE /api/admin/sponsored/[placementId]` - edit/remove sponsored placements

## Usage Flow

1. Sign in at `/auth/signin`.
2. Create groups at `/dashboard/groups` and invite members.
3. Add prediction drafts at `/dashboard/predictions`.
4. Select one prediction and submit for a group.
5. Admin updates match results at `/dashboard/admin` to recalc scores.

## Database

The app runs on **PostgreSQL** via the node-postgres (`pg`) Prisma driver adapter.
Connection setup lives in `lib/aws-db.ts`, which supports two modes:

- **`DATABASE_URL` set** (local dev, Railway) — connects with the provided
  connection string.
- **`DATABASE_URL` unset** (Vercel + AWS Aurora) — connects to Aurora using
  **IAM database authentication**, reading the `PG*` and `AWS_*` env vars injected
  by the Vercel ⇄ AWS integration and minting a short-lived IAM auth token per
  connection. See [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md) for details.

Schema changes are managed with Prisma Migrate (`prisma/migrations`). Apply them
with `npx prisma migrate deploy` (or `npm run migrate:deploy`, which mints an IAM
token first when running against Aurora).

## Production Deployment (Railway)

1. Push repo to GitHub.
2. Create Railway project and connect GitHub repo.
3. Set env vars in Railway (same as `.env`, plus OAuth secrets) — including
   `DATABASE_URL` for the Postgres instance.
4. Use `npm run build` and `npm run start` (`start` runs `prisma migrate deploy`
   before serving).

Optionally add `railway.json` with service definitions.

## Production Deployment (Vercel + AWS Aurora)

1. Push repo to GitHub and import the project into Vercel.
2. Create an Aurora PostgreSQL database from Vercel Storage and link it to the
   project — this injects the `PG*` and `AWS_*` env vars.
3. Enable **OIDC** for the project (Settings → Security) so a `VERCEL_OIDC_TOKEN`
   is available for the AWS STS role exchange.
4. Do **not** set `DATABASE_URL` in Vercel — leaving it unset activates the IAM
   auth path.
5. Vercel runs the `vercel-build` script (`tsx scripts/migrate.ts && next build`),
   applying migrations before the build.

Full setup notes and troubleshooting are in
[`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md).

## Notes

- Ensure `NEXTAUTH_SECRET` is secure in production.
- No payment integrations are included.
- For the newsroom, set `NEWS_PROVIDER` to `newsapi` or `gnews` and provide the matching API key.
- You can customize scoring in `app/api/groups/[groupId]/submit/route.ts` and `/api/admin/matches/[matchId]/result/route.ts`.

---

For maintenance: ensure your `prisma` schema and migrations stay in sync. Create a migration with `npx prisma migrate dev --name <change>` after schema updates, and apply it in production with `npx prisma migrate deploy`.

---

## Implementation Status

### Implemented

**Authentication & Users**
- Email/password login and registration
- Google and Facebook OAuth
- Password reset flow (token-based; currently console-only — no email provider wired)
- Role-based access control (`USER` / `ADMIN`)
- Profile editing and avatar upload

**Tournaments & Matches**
- Full tournament CRUD (create, archive, set active)
- Team management
- Match creation with direct team assignment or dynamic participant resolution (group winners/losers, best third-place)
- Admin match result entry with automatic scoring triggered on save
- Tiebreaker questions creation and scoring

**Predictions & Groups**
- Create and edit multiple prediction sets per tournament
- Predict scorelines per match; predict group standings
- Answer tiebreaker questions
- Mark one prediction as selected
- Create private group rooms with auto-generated invite codes
- Join groups by invite code
- Submit selected prediction to a group (one submission per user per group enforced)

**Scoring & Leaderboards**
- Exact score: 5 pts, correct result: 3 pts, group standings: 2 pts, knockout slot: 1 pt, tiebreaker: 3 pts
- Per-match `PredictionScore` records with live aggregation
- Group leaderboard with score breakdown

**Bracket Resolution**
- Iterative resolution of knockout-phase participants from group results, match results, and best third-place rules

**Newsroom**
- NewsAPI and GNews provider integrations (set via `NEWS_PROVIDER` env var)
- Tag-based article matching per tournament
- Admin-triggered sync; deduplication by source URL
- Sponsored placements with priority ranking and active date ranges

**Dashboard & UI**
- Landing page, sign-in, and password reset pages
- Dashboard with group performance summary, leaderboard, and news feed
- Predictions manager, group browser/detail, and profile pages
- Admin console for tournaments, teams, matches, users, news, and sponsored content
- Dark/light mode toggle; responsive Tailwind layout

---

### Known Gaps / Not Yet Implemented

- **Email delivery** — password reset tokens are printed to the console; no SMTP/transactional email provider is configured
- **Rate limiting** — no per-IP or per-user rate limits on API routes
- **Input validation UI** — admin bracket-resolution inputs (e.g. placeholder text format) have no client-side format guidance
- **Real-time updates** — scores and leaderboards require a page reload; no WebSocket/SSE layer
- **Bracket-style prediction UI** — the data model supports knockout predictions, but there is no visual bracket interface yet
- **Multi-language support** — UI is English-only
- **Admin audit log** — no history of admin actions
