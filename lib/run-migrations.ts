import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { getPoolConfig } from "./aws-db";

/**
 * Applies pending Prisma migrations using a direct node-postgres connection.
 *
 * Migrations can't run during the Vercel build (the build container can't reach
 * Aurora) and we have no local DB credentials, so they run from a runtime route
 * where the IAM-authenticated connection works. Rather than bundle the Prisma
 * CLI + schema engine into the lambda, we execute each `migration.sql` directly
 * and record it in `_prisma_migrations` the same way `prisma migrate deploy`
 * does (name + SHA-256 checksum of the file), keeping the history consistent.
 *
 * All current migrations are transaction-safe; each is applied in its own
 * transaction and recorded only on success, so the operation is re-runnable.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

// Matches the table Prisma's migration engine creates.
const CREATE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);`;

export type MigrationResult = { applied: string[]; alreadyApplied: string[] };

export async function runMigrations(): Promise<MigrationResult> {
  const pool = new Pool(getPoolConfig());
  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  try {
    const client = await pool.connect();
    try {
      await client.query(CREATE_MIGRATIONS_TABLE);

      const { rows } = await client.query<{ migration_name: string }>(
        `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
      );
      const done = new Set(rows.map((r) => r.migration_name));

      const dirs = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort(); // timestamp-prefixed names sort chronologically

      for (const name of dirs) {
        if (done.has(name)) {
          alreadyApplied.push(name);
          continue;
        }

        const sqlBuffer = await readFile(path.join(MIGRATIONS_DIR, name, "migration.sql"));
        const checksum = createHash("sha256").update(sqlBuffer).digest("hex");

        await client.query("BEGIN");
        try {
          await client.query(sqlBuffer.toString("utf8"));
          await client.query(
            `INSERT INTO "_prisma_migrations"
               (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
             VALUES ($1, $2, now(), $3, now(), 1)`,
            [randomUUID(), checksum, name],
          );
          await client.query("COMMIT");
          applied.push(name);
        } catch (err) {
          await client.query("ROLLBACK");
          throw new Error(`Migration "${name}" failed: ${(err as Error).message}`);
        }
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  return { applied, alreadyApplied };
}
