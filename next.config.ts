import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Bundle the migration SQL files into the migrate route's serverless function
  // so runMigrations() can read them at runtime (they aren't imported statically).
  outputFileTracingIncludes: {
    "/api/admin/migrate": ["./prisma/migrations/**/*"],
  },
};

export default withNextIntl(nextConfig);
