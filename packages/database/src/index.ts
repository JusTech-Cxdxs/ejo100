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

/**
 * The runtime connection, tuned for serverless pages that ask several things
 * at once: unless the address already says otherwise, each server instance
 * keeps up to 10 connections (Prisma's default on a 2-CPU function is 5) and
 * waits up to 20 s for a free one (default 10 s). Override with
 * PRISMA_CONNECTION_LIMIT / PRISMA_POOL_TIMEOUT, or in DATABASE_URL itself.
 */
export function tunedDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    const limit = Number(process.env.PRISMA_CONNECTION_LIMIT) || 10;
    const timeout = Number(process.env.PRISMA_POOL_TIMEOUT) || 20;
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', String(Math.max(1, Math.min(50, limit))));
    if (!u.searchParams.has('pool_timeout')) u.searchParams.set('pool_timeout', String(Math.max(5, Math.min(60, timeout))));
    return u.toString();
  } catch {
    return raw;
  }
}

const url = tunedDatabaseUrl(process.env.DATABASE_URL);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    ...(url ? { datasources: { db: { url } } } : {}),
  });

// Every create / update / delete through this shared client is written to
// audit_logs (audit-journal.ts). Installed once, here, so nothing bypasses it.
installAuditJournal(prisma);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { setAuditActor, getAuditActor, currentAuditActor, setAuditActorResolver, redactForJournal } from './audit-journal';
export * from '@prisma/client';
