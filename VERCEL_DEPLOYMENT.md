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

**Migrations do NOT run during the Vercel build.** The Vercel build container
cannot reach Aurora over the network (only runtime functions get VPC access
through the integration), so a build-time `prisma migrate deploy` fails with
`P1001: Can't reach database server`. For that reason `vercel-build` is just
`next build`.

Apply migrations **out-of-band**, from an environment that can reach Aurora:

```bash
# Provide the same PG*/AWS_* env vars (e.g. `vercel env pull`) plus AWS
# credentials with rds-db:connect, then:
npm run migrate:deploy
```

The script falls back to the default AWS credential chain (env vars or `~/.aws`)
when there is no Vercel OIDC token. Reachability options, depending on your
Aurora networking:

- **Publicly accessible Aurora** → run `npm run migrate:deploy` from your laptop,
  with your public IP allowed in the cluster's security group on port 5432.
- **Private VPC Aurora** → run it from inside the VPC (a bastion host / EC2 /
  one-off ECS task), since neither your laptop nor the Vercel build can reach it.

Run this once before the first deploy (so the schema exists) and again after any
schema change.

## Seeding

`prisma/seed.ts` uses the same config helper, so `npx prisma db seed` works in
both modes.

## Railway (unchanged)

Railway still sets `DATABASE_URL`, so it takes the direct-connection path and the
existing `start` script (`prisma migrate deploy && next start`) continues to work.
