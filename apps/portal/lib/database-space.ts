import { prisma } from '@ejo/database';
import { spaceLimitBytes, spaceOf, type Space } from '@/lib/database-space-core';

/**
 * The database's size now, against the plan's limit (rules: database-space-core.ts).
 * Read at most every 20 seconds per server instance: an upload sends a block
 * every second, and the size only moves by a block at a time.
 */
let cached: { at: number; used: number } | null = null;
const FRESH_MS = 20_000;

export async function readDatabaseSpace(opts: { fresh?: boolean } = {}): Promise<Space> {
  const limit = spaceLimitBytes();
  if (!limit) return spaceOf(0, null);
  if (!opts.fresh && cached && Date.now() - cached.at < FRESH_MS) return spaceOf(cached.used, limit);
  try {
    const [r] = await prisma.$queryRaw<{ bytes: bigint | number }[]>`SELECT pg_database_size(current_database())::bigint AS bytes`;
    const used = Number(r?.bytes ?? 0);
    cached = { at: Date.now(), used };
    return spaceOf(used, limit);
  } catch {
    // The size could not be read (a restricted role): never block work on a reading we do not have.
    return spaceOf(0, null);
  }
}
