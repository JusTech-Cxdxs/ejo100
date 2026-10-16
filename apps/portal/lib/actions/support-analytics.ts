'use server';

import { prisma, type Prisma } from '@ejo/database';
import { allows, authorize, myOrganisationId, reachWhere } from '@/lib/authz/server';
import { ticketReachWhere } from '@/lib/support-rules';
import { lagosParts, measures, type MeasureRow, type Measures } from '@/lib/support/core';
import { TOPIC_LABEL, asTopic } from '@/lib/support/ai-core';

/**
 * The Support centre's numbers for a period, within the person's reach
 * (support.tickets.manage: their branch plus organisation-wide requests;
 * administrators: the whole organisation). Counts and times only — no
 * message text — so it is safe to show to team leads.
 */
export type SupportAnalytics = {
  days: number; queueId: string | null;
  m: Measures;
  queues: { id: string; name: string; total: number; open: number; slaAttainment: number | null; csat: number | null }[];
  agents: { userId: string; name: string; handled: number; resolved: number; firstResponseMedianMin: number | null; csat: number | null; reopened: number }[];
  trend: { day: string; opened: number; resolved: number }[];
  topics: { label: string; count: number }[];
};

export async function getSupportAnalytics(input: { days?: number; queueId?: string } = {}): Promise<SupportAnalytics> {
  await authorize('support.tickets.manage', undefined, 'getSupportAnalytics');
  const days = [7, 30, 90, 365].includes(Number(input.days)) ? Number(input.days) : 30;
  const queueId = typeof input.queueId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(input.queueId) ? input.queueId : null;
  const organisationId = await myOrganisationId();
  const reach = ticketReachWhere(await reachWhere('support.tickets.manage'), organisationId) as Prisma.SupportTicketWhereInput;
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.supportTicket.findMany({
    where: { AND: [reach, { createdAt: { gte: since } }, queueId ? { queueId } : {}] },
    take: 20_000,
    select: { createdAt: true, firstResponseAt: true, resolvedAt: true, dueFirstResponseAt: true, status: true, channel: true, queueId: true, priority: true, aiOutcome: true, handoverReason: true, reopenCount: true, csatScore: true, assignedToId: true, topic: true },
  });
  const all: MeasureRow[] = rows.map((r) => ({ ...r, status: String(r.status), channel: String(r.channel) }));
  const m = measures(all);
  const [queues, users] = await Promise.all([
    organisationId ? prisma.supportQueue.findMany({ where: { organisationId }, select: { id: true, name: true } }) : [],
    prisma.user.findMany({ where: { id: { in: [...new Set(all.map((r) => r.assignedToId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, fullName: true } }),
  ]);
  const group = (key: (r: MeasureRow) => string | null) => {
    const m = new Map<string, MeasureRow[]>();
    for (const r of all) {
      const k = key(r);
      if (k === null) continue;
      const list = m.get(k);
      if (list) list.push(r); else m.set(k, [r]);
    }
    return m;
  };
  const byQueue = group((r) => r.queueId ?? '');
  const byAgent = group((r) => r.assignedToId);
  const name = new Map(users.map((u) => [u.id, u.fullName]));
  const trendMap = new Map<string, { opened: number; resolved: number }>();
  for (let i = Math.min(days, 90) - 1; i >= 0; i -= 1) trendMap.set(lagosParts(new Date(Date.now() - i * 86_400_000)).day, { opened: 0, resolved: 0 });
  for (const r of all) {
    const d = trendMap.get(lagosParts(r.createdAt).day);
    if (d) d.opened += 1;
    if (r.resolvedAt) { const e = trendMap.get(lagosParts(r.resolvedAt).day); if (e) e.resolved += 1; }
  }
  return {
    days, queueId, m,
    queues: queues.map((q) => {
      const qm = measures(byQueue.get(q.id) ?? []);
      return { id: q.id, name: q.name, total: qm.total, open: qm.open + qm.onHold, slaAttainment: qm.slaAttainment, csat: qm.csat };
    }).filter((q) => q.total > 0 || !queueId).sort((a, b) => b.total - a.total),
    // Individual numbers are for people who run the centre; colleagues see the team view.
    agents: (await allows('support.manage')) ? [...byAgent.entries()].map(([userId, list]) => {
      const am = measures(list);
      return { userId, name: name.get(userId) ?? 'A colleague', handled: am.total, resolved: am.resolved, firstResponseMedianMin: am.firstResponseMedianMin, csat: am.csatResponses >= 3 ? am.csat : null, reopened: list.filter((r) => r.reopenCount > 0).length };
    }).sort((a, b) => b.handled - a.handled).slice(0, 50) : [],
    trend: [...trendMap.entries()].map(([day, v]) => ({ day, ...v })),
    topics: m.byTopic.map((t) => ({ label: t.topic === 'other' ? 'Other / not read yet' : TOPIC_LABEL[asTopic(t.topic)], count: t.count })),
  };
}
