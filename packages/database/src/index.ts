/**
 * @ejo/database
 *
 * Single shared Prisma client instance used by apps/api (and, where needed,
 * server-side code in apps/portal / apps/website). Never instantiate
 * PrismaClient anywhere else in the codebase.
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
