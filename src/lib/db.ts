/**
 * Prisma client singleton.
 *
 * In development, Next.js hot-reloads create many Prisma Client instances.
 * This module ensures only one instance exists per process.
 */

import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
