import 'server-only';
/**
 * Database side of the Learning page. Server-only, NOT a server action: the
 * page guards first and passes its fence (organisation + reach) in.
 */
import { prisma } from '@ejo/database';
import { lagosWeekStart, promotionProgress, summarise } from './learning-core';

export type LearningFence = { organisationId?: string; branchId?: string | { in: string[] } };

const WEEKS = 12;

export async function learningData(fence: LearningFence, now = new Date()) {
  const where = { ...fence };
  const since = new Date(lagosWeekStart(now).getTime() - (WEEKS - 1) * 7 * 86_400_000);
  const [byStatus, accuracy, resolvedAll, recent, byKind] = await Promise.all([
    prisma.enyoPrediction.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.enyoPrediction.aggregate({ where: { ...where, status: 'RESOLVED', precision: { not: null } }, _avg: { precision: true, recall: true }, _count: { _all: true } }),
    prisma.enyoPrediction.count({ where: { ...where, status: 'RESOLVED' } }),
    prisma.enyoPrediction.findMany({
      where: { ...where, status: 'RESOLVED', resolvedAt: { gte: since } },
      select: { resolvedAt: true, precision: true, recall: true, outcome: true },
      orderBy: { resolvedAt: 'desc' },
      take: 5000,
    }),
    prisma.enyoPrediction.groupBy({ by: ['kind'], where, _count: { _all: true } }),
  ]);
  const counts: Record<'SHADOW' | 'SHOWN' | 'DISMISSED' | 'RESOLVED', number> = { SHADOW: 0, SHOWN: 0, DISMISSED: 0, RESOLVED: 0 };
  for (const s of byStatus as { status: keyof typeof counts; _count: { _all: number } }[]) counts[s.status] = s._count._all;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const withLines = accuracy._count._all;
  const summary = summarise(
    recent.filter((r: { resolvedAt: Date | null }) => r.resolvedAt).map((r: { resolvedAt: Date | null; precision: number | null; recall: number | null; outcome: unknown }) => ({ resolvedAt: r.resolvedAt!, precision: r.precision, recall: r.recall, outcome: r.outcome })),
    now,
    WEEKS,
  );
  return {
    total,
    counts,
    byKind: Object.fromEntries((byKind as { kind: string; _count: { _all: number } }[]).map((k) => [k.kind, k._count._all])) as Record<string, number>,
    resolved: resolvedAll,
    resolvedWithLines: withLines,
    averagePrecision: accuracy._avg.precision,
    averageRecall: accuracy._avg.recall,
    summary,
    promotion: promotionProgress(withLines, accuracy._avg.precision),
  };
}
