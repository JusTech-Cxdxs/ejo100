import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Scheduled-job routes accept ONLY `Authorization: Bearer <CRON_SECRET>`
 * (Vercel Cron and the Supabase scheduler both send it). Never a ?key= in the
 * address — addresses end up in logs and browser history. Compared in
 * constant time (on hashes, so length differences do not leak either).
 */
export function isCronRequest(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorization) return false;
  const want = createHash('sha256').update(`Bearer ${secret}`).digest();
  const got = createHash('sha256').update(authorization).digest();
  return timingSafeEqual(want, got);
}
