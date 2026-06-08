import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getPoolConfig } from "./aws-db";

declare global {
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  const adapter = new PrismaPg(getPoolConfig());
  return new PrismaClient({ adapter });
}

export const prisma = global.prisma ?? createPrismaClient();
if (process.env.NODE_ENV !== "production") global.prisma = prisma;
