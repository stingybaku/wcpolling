# Deploying to Vercel with AWS Aurora (IAM auth)

This app connects to AWS Aurora PostgreSQL using **IAM database authentication**
(no static password). Auth tokens are minted per connection from the Vercel
OIDC token via AWS STS + the RDS Signer.

## How the connection works

`lib/aws-db.ts` builds the database config:

1. **If `DATABASE_URL` is set** (local dev, Railway) → it is used as-is.
2. **Otherwise** → connect to Aurora with IAM auth using the env vars injected by
   the Vercel ⇄ AWS integration:
   - `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGSSLMODE`
   - `AWS_REGION`, `AWS_ROLE_ARN` (used with the OIDC token to assume the role)

node-postgres calls a function-valued `password` on every new connection, which
mints a fresh ~15-minute IAM auth token, so expiry is handled automatically.

## Required Vercel settings

- **OIDC must be enabled** for the project so `VERCEL_OIDC_TOKEN` is injected
  (Project → Settings → Security → Secure Backend Access / OIDC). Without it,
  `awsCredentialsProvider` has no token to exchange.
- The AWS role (`AWS_ROLE_ARN`) trust policy must trust Vercel's OIDC issuer for
  this project. The Vercel AWS Storage integration configures this when you link
  the database.
- The Aurora user (`PGUSER`) must be granted `rds_iam` so IAM auth is allowed.

Do **not** set `DATABASE_URL` in Vercel — leaving it unset is what activates the
IAM path.

## Migrations

**Migrations do NOT run during the Vercel build.** The Vercel build container
cannot reach Aurora over the network (only runtime functions get VPC access
through the integration), so a build-time `prisma migrate deploy` fails with
`P1001: Can't reach database server`. For that reason `vercel-build` is just
`next build`.

Instead, migrations run from a **protected runtime route**, which executes inside
a Vercel function where the IAM-authenticated DB connection works.

### Applying migrations on Vercel (recommended)

1. Set a `MIGRATE_SECRET` env var in Vercel (any long random string), for
   Production and Preview, then redeploy so the function picks it up.
2. Call the endpoint once (and again after any future schema change):

   ```bash
   curl -X POST https://<your-deployment>/api/admin/migrate \
     -H "x-migrate-secret: $MIGRATE_SECRET"
   ```

   It returns the migrations it `applied` (and which were `alreadyApplied`). The
   route (`app/api/admin/migrate/route.ts` → `lib/run-migrations.ts`) runs each
   `prisma/migrations/*/migration.sql` in a transaction and records it in
   `_prisma_migrations` exactly like `prisma migrate deploy`.

### Alternative: run the Prisma CLI out-of-band

If you have an environment that can reach Aurora **and** AWS credentials with
`rds-db:connect`, you can instead run:

```bash
# With PG*/AWS_* env vars present (e.g. `vercel env pull`):
npm run migrate:deploy
```

`scripts/migrate.ts` mints an IAM token into a temporary `DATABASE_URL` and runs
`prisma migrate deploy`, falling back to the default AWS credential chain locally.
This needs the Aurora cluster to be reachable from where you run it (publicly
accessible + your IP allowed, or from inside the VPC).

## Seeding

The same Aurora network constraint applies to seeding, so there is a matching
runtime route. After migrating, load the World Cup 2026 data (tournament, teams,
groups, bracket, tie-breakers, staged tournament) by calling:

```bash
curl -X POST https://<your-deployment>/api/admin/seed \
  -H "x-migrate-secret: $MIGRATE_SECRET"
```

The seed is idempotent (upserts + existence guards), so it is safe to re-run.
`app/api/admin/seed/route.ts` invokes `seedDatabase()` from `prisma/seed.ts`,
which still runs as a CLI seed (`npx prisma db seed`) wherever `DATABASE_URL` is
set (local dev, Railway).

## Railway (unchanged)

Railway still sets `DATABASE_URL`, so it takes the direct-connection path and the
existing `start` script (`prisma migrate deploy && next start`) continues to work.
