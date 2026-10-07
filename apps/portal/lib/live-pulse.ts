import { prisma } from '@ejo/database';

/**
 * The cheap "has anything changed?" signal behind live pages and the bell.
 *
 * Scoped to ONE organisation: another company's activity never makes this
 * organisation's pages refresh. Rows with no organisation (system work) still
 * count, so nothing that concerns everyone is missed.
 *
 * Many people in the same organisation ask the same question every few
 * seconds, so the answer is shared for a moment per server instance —
 * at most one pair of tiny indexed queries per organisation per PULSE_MEMO_MS.
 */
const PULSE_MEMO_MS = 2000;
const memo = new Map<string, { at: number; value: Promise<string> }>();

async function compute(organisationId: string | null): Promise<string> {
  const orgFence = organisationId ? { OR: [{ organisationId }, { organisationId: null }] } : {};
  const [a, b] = await Promise.all([
    prisma.auditLog.findFirst({
      where: { ...orgFence, NOT: [{ entityType: { startsWith: 'db:' } }, { action: { endsWith: '.failed' } }, { action: 'system.job_run' }] },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
    prisma.broadcast.findFirst({
      where: organisationId ? { organisationId } : {},
      orderBy: { updatedAt: 'desc' },
      select: { id: true, updatedAt: true },
    }),
  ]);
  return `${a?.id ?? ''}|${b?.id ?? ''}:${b ? +new Date(b.updatedAt) : 0}`;
}

export function livePulse(organisationId: string | null): Promise<string> {
  const key = organisationId ?? '*';
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && now - hit.at < PULSE_MEMO_MS) return hit.value;
  const value = compute(organisationId);
  // A failed lookup is never shared — the next caller tries again.
  value.catch(() => { if (memo.get(key)?.value === value) memo.delete(key); });
  if (memo.size > 5000) memo.clear();
  memo.set(key, { at: now, value });
  return value;
}
