/**
 * @ejo/database
 *
 * Single shared Prisma client instance used by apps/api (and, where needed,
 * server-side code in apps/portal / apps/website). Never instantiate
 * PrismaClient anywhere else in the codebase.
 */
import { PrismaClient } from '@prisma/client';
import { installAuditJournal } from './audit-journal';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// Every create / update / delete through this one shared client is
// written to audit_logs (see audit-journal.ts) — installed once, here,
// so no feature anywhere can bypass it.
installAuditJournal(prisma);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { setAuditActor, getAuditActor } from './audit-journal';
export * from '@prisma/client';
