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

The Prisma CLI can't use a function-valued password, so `scripts/migrate.ts`
mints a token into a temporary `DATABASE_URL` and runs `prisma migrate deploy`.

- **Build-time (default):** `package.json` defines `vercel-build` as
  `tsx scripts/migrate.ts && next build`. Vercel runs this automatically, so
  migrations apply on every deploy.
- **Caveat:** this requires the Vercel **build** container to (a) receive the
  OIDC token and (b) reach Aurora over the network. If a deploy fails at the
  migrate step, remove `tsx scripts/migrate.ts &&` from `vercel-build` and run
  migrations yourself instead:

  ```bash
  # With local AWS credentials that can assume the role / have rds_iam:
  npm run migrate:deploy
  ```

  Locally the script falls back to the default AWS credential chain (env vars or
  `~/.aws`) since there is no Vercel OIDC token.

## Seeding

`prisma/seed.ts` uses the same config helper, so `npx prisma db seed` works in
both modes.

## Railway (unchanged)

Railway still sets `DATABASE_URL`, so it takes the direct-connection path and the
existing `start` script (`prisma migrate deploy && next start`) continues to work.
