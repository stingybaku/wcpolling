/**
 * Runs `prisma migrate deploy` against the database.
 *
 * The Prisma CLI / migration engine connects with a plain connection string and
 * cannot use a function-valued password, so for Aurora IAM auth we mint a
 * short-lived auth token here and inject it as DATABASE_URL. When DATABASE_URL
 * is already set (local dev, Railway) this is a no-op passthrough.
 *
 * Aurora (especially Serverless) can be paused or cold when a deploy starts, so
 * the connection is retried with backoff to give the cluster time to resume —
 * otherwise the build fails on Prisma's ~5s connect timeout with P1001
 * ("Can't reach database server"). The IAM token is re-minted on each attempt
 * since it is short-lived.
 *
 * Usage: npm run migrate:deploy
 */
import { execSync } from "node:child_process";
import { getDatabaseUrl } from "../lib/aws-db";

const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 15_000;
const CONNECT_TIMEOUT_S = 30;

/** Give Prisma longer than its 5s default to reach a cold/resuming cluster. */
function withConnectTimeout(url: string): string {
  if (/[?&]connect_timeout=/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + `connect_timeout=${CONNECT_TIMEOUT_S}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Re-mint the URL each attempt: IAM tokens are short-lived, re-minting is cheap.
    const databaseUrl = withConnectTimeout(await getDatabaseUrl());
    try {
      execSync("prisma migrate deploy", {
        stdio: "inherit",
        env: { ...process.env, DATABASE_URL: databaseUrl },
      });
      return; // success
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      console.warn(
        `migrate deploy attempt ${attempt}/${MAX_ATTEMPTS} failed; retrying in ` +
          `${RETRY_DELAY_MS / 1000}s (database may be paused/resuming)...`,
      );
      await sleep(RETRY_DELAY_MS);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
