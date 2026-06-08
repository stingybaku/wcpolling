/**
 * Runs `prisma migrate deploy` against the database.
 *
 * The Prisma CLI / migration engine connects with a plain connection string and
 * cannot use a function-valued password, so for Aurora IAM auth we mint a
 * short-lived auth token here and inject it as DATABASE_URL. When DATABASE_URL
 * is already set (local dev, Railway) this is a no-op passthrough.
 *
 * Usage: npm run migrate:deploy
 */
import { execSync } from "node:child_process";
import { getDatabaseUrl } from "../lib/aws-db";

async function main() {
  const databaseUrl = await getDatabaseUrl();
  execSync("prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
