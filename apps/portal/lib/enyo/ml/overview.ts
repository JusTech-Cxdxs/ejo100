import 'server-only';
/**
 * The data behind the Enyo models page. Server-only, NOT a server action: the
 * page guards first and passes the organisation in.
 */
import { prisma } from '@ejo/database';
import { DURATION_KIND } from './models';

export type ModelRow = {
  id: string;
  task: string;
  version: string;
  algorithm: string;
  status: 'CANDIDATE' | 'ACTIVE' | 'RETIRED' | 'REJECTED';
  metrics: Record<string, unknown>;
  baseline: Record<string, unknown> | null;
  gate: { passed: boolean; reasons: string[] };
  rows: number;
  dataFrom: Date | null;
  dataTo: Date | null;
  trainer: string;
  trainedAt: Date;
  promotedAt: Date | null;
};

export async function listModels(organisationId: string): Promise<ModelRow[]> {
  const rows = await prisma.enyoModel.findMany({
    where: { organisationId },
    orderBy: [{ trainedAt: 'desc' }],
    take: 80,
    select: { id: true, task: true, version: true, algorithm: true, status: true, metrics: true, baseline: true, gate: true, rows: true, dataFrom: true, dataTo: true, trainer: true, trainedAt: true, promotedAt: true },
  });
  return rows.map((r: (typeof rows)[number]) => ({
    ...r,
    metrics: (r.metrics ?? {}) as Record<string, unknown>,
    baseline: (r.baseline ?? null) as Record<string, unknown> | null,
    gate: { passed: Boolean((r.gate as { passed?: unknown })?.passed), reasons: Array.isArray((r.gate as { reasons?: unknown })?.reasons) ? ((r.gate as { reasons: unknown[] }).reasons.filter((x) => typeof x === 'string') as string[]) : [] },
  }));
}

/** How the job time estimates did against reality (last 500 checked). */
export async function durationStats(organisationId: string) {
  const [made, shownCount, resolved] = await Promise.all([
    prisma.enyoPrediction.count({ where: { organisationId, kind: DURATION_KIND } }),
    prisma.enyoPrediction.count({ where: { organisationId, kind: DURATION_KIND, status: 'SHOWN' } }),
    prisma.enyoPrediction.findMany({ where: { organisationId, kind: DURATION_KIND, status: 'RESOLVED' }, orderBy: { resolvedAt: 'desc' }, take: 500, select: { outcome: true } }),
  ]);
  const outs = resolved.map((r: { outcome: unknown }) => (r.outcome ?? {}) as { absErrorHours?: number; inRange?: boolean }).filter((o) => typeof o.absErrorHours === 'number');
  const mae = outs.length ? outs.reduce((s, o) => s + (o.absErrorHours ?? 0), 0) / outs.length : null;
  const inRange = outs.length ? outs.filter((o) => o.inRange).length / outs.length : null;
  return { made, shown: shownCount, checked: outs.length, maeHours: mae, inRange };
}
