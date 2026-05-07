import { defineConfig } from "prisma/config";
import { loadEnvFile } from "node:process";

try { loadEnvFile(); } catch { /* no .env file present */ }

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
