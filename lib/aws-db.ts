import { Signer } from "@aws-sdk/rds-signer";
import { awsCredentialsProvider } from "@vercel/functions/oidc";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { PoolConfig } from "pg";

/**
 * Database connection configuration.
 *
 * Two modes:
 *  1. DATABASE_URL is set (local dev, Railway) -> use the connection string as-is.
 *  2. AWS Aurora with IAM authentication (Vercel) -> read the PG and AWS env
 *     vars injected by the Vercel/AWS integration and mint a short-lived IAM
 *     auth token for every new connection.
 *
 * Aurora IAM tokens expire after ~15 minutes, so the token is generated lazily by
 * node-postgres on each new connection via the function-valued `password`.
 */

function getAwsCredentials(): AwsCredentialIdentityProvider | undefined {
  // On Vercel, exchange the OIDC token for AWS credentials via STS AssumeRole.
  // Locally / in CI, fall back to the default AWS credential chain (env vars,
  // shared config/credentials files, etc.) by returning undefined.
  if (process.env.VERCEL_OIDC_TOKEN && process.env.AWS_ROLE_ARN) {
    return awsCredentialsProvider({ roleArn: process.env.AWS_ROLE_ARN });
  }
  return undefined;
}

function createSigner(): Signer {
  const host = requireEnv("PGHOST");
  const port = Number(process.env.PGPORT ?? 5432);
  const user = requireEnv("PGUSER");
  const region = requireEnv("AWS_REGION");

  return new Signer({
    region,
    hostname: host,
    port,
    username: user,
    credentials: getAwsCredentials(),
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var "${name}". Set DATABASE_URL for a direct ` +
        `connection, or provide the PG*/AWS_* vars for Aurora IAM auth.`,
    );
  }
  return value;
}

function sslOption(): PoolConfig["ssl"] {
  // Aurora IAM auth requires SSL. `rejectUnauthorized: false` encrypts the
  // connection without verifying the server certificate chain. To upgrade to
  // full verification, supply the RDS CA bundle via `ca` and set this to true.
  return process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false };
}

/** node-postgres pool config used by the Prisma adapter at runtime. */
export function getPoolConfig(): PoolConfig {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }

  const signer = createSigner();
  return {
    host: requireEnv("PGHOST"),
    port: Number(process.env.PGPORT ?? 5432),
    user: requireEnv("PGUSER"),
    database: requireEnv("PGDATABASE"),
    ssl: sslOption(),
    // Called by node-postgres on every new connection.
    password: () => signer.getAuthToken(),
  };
}

/**
 * A full `postgresql://` connection string with a freshly minted IAM token,
 * for tools that cannot use a function-valued password (e.g. the Prisma CLI).
 * The token is valid for ~15 minutes.
 */
export async function getDatabaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = requireEnv("PGHOST");
  const port = Number(process.env.PGPORT ?? 5432);
  const user = requireEnv("PGUSER");
  const database = requireEnv("PGDATABASE");
  const token = await createSigner().getAuthToken();
  const sslmode = process.env.PGSSLMODE ?? "require";

  return (
    `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(token)}` +
    `@${host}:${port}/${encodeURIComponent(database)}?sslmode=${sslmode}`
  );
}
