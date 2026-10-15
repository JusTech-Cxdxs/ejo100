import 'server-only';
/**
 * The trainer's door into the portal (/api/ml/*): it reads an organisation's
 * de-identified history and hands back trained models — and nothing else.
 * The trainer (ml/, run by the owner or the "Train Enyo models" workflow)
 * never holds database credentials: only ML_SERVICE_TOKEN.
 *
 *   - Off unless ML_SERVICE_TOKEN is set (at least 32 characters): every
 *     /api/ml route then answers 404.
 *   - Authorization: Bearer <token> only (never in the address), compared in
 *     constant time on hashes.
 *   - The organisation is named by its slug and must be active.
 *   - At most 30 requests a minute per server instance.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { prisma } from '@ejo/database';
import { withinLimit } from '@/lib/mail/account';
import { buildTrainingRows } from '@/lib/enyo/predict/dataset';
import { learningSince } from '@/lib/enyo/predict/learn-from';
import { weeklySeries, type ConsumptionEvent, type PartsRow } from './datasets-core';

export const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };

export function mlServiceToken(): string | null {
  const t = (process.env.ML_SERVICE_TOKEN ?? '').trim();
  return t.length >= 32 ? t : null;
}

/** 'off' (not set up), 'denied' (no or wrong token, or too many requests), or 'ok'. */
export function checkServiceRequest(request: Request): 'off' | 'denied' | 'limited' | 'ok' {
  const token = mlServiceToken();
  if (!token) return 'off';
  const given = request.headers.get('authorization') ?? '';
  const want = createHash('sha256').update(`Bearer ${token}`).digest();
  const got = createHash('sha256').update(given).digest();
  if (!timingSafeEqual(want, got)) return 'denied';
  if (!withinLimit('ml-service', 30, 60_000)) return 'limited';
  return 'ok';
}

export async function organisationBySlug(slug: string | null): Promise<{ id: string; name: string } | null> {
  if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return prisma.organisation.findFirst({ where: { slug, isActive: true }, select: { id: true, name: true } });
}

/** Every finished job of the organisation (all branches), as the training rows. */
export async function jobsDataset(organisationId: string) {
  return buildTrainingRows({ organisationId, branchIds: null });
}

export const PARTS_WEEKS = 104;

/** Weekly consumption of every active part of the organisation over the last two years (or since the learn-from day). */
export async function partsDataset(organisationId: string, now = new Date()): Promise<PartsRow[]> {
  const inOrg = { branch: { businessUnit: { organisationId } } };
  const WEEK = 7 * 86_400_000;
  const floor = new Date(now.getTime() - (PARTS_WEEKS + 2) * WEEK);
  // After a "learn from" day, only whole weeks since then: the weeks before it
  // are not "no use", they are unknown, and zeros would drag forecasts down.
  const since = await learningSince(organisationId, floor);
  const weeks = since > floor ? Math.max(1, Math.min(PARTS_WEEKS, Math.floor((now.getTime() - since.getTime()) / WEEK))) : PARTS_WEEKS;
  const [parts, quantity, batch] = await Promise.all([
    prisma.part.findMany({ where: { ...inOrg, isActive: true }, select: { id: true }, orderBy: { id: 'asc' }, take: 20_000 }),
    prisma.partQuantityConsumption.findMany({ where: { part: inOrg, consumedAt: { gte: since } }, select: { partId: true, consumedAt: true, quantityTaken: true } }),
    prisma.partBatchConsumption.findMany({ where: { batch: { part: inOrg }, consumedAt: { gte: since } }, select: { batch: { select: { partId: true } }, consumedAt: true, quantityTaken: true } }),
  ]);
  const events: ConsumptionEvent[] = [
    ...quantity.map((q: { partId: string; consumedAt: Date; quantityTaken: unknown }) => ({ partId: q.partId, at: q.consumedAt, quantity: Number(q.quantityTaken) })),
    ...batch.map((b: { batch: { partId: string }; consumedAt: Date; quantityTaken: unknown }) => ({ partId: b.batch.partId, at: b.consumedAt, quantity: Number(b.quantityTaken) })),
  ];
  return weeklySeries(parts.map((p: { id: string }) => p.id), events, weeks, now);
}
