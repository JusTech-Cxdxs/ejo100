'use server';

import { authorize, myOrganisationId, reachWhere } from '@/lib/authz/server';
import { decisionLog } from '@/lib/insights/decisions';
import { stepPictures, type StepPicture } from '@/lib/insights/decisions-core';
import { prisma } from '@ejo/database';

/**
 * How work flows — every approval step of every workflow over a period:
 * volume, how often things are sent back and why, how long they wait, which
 * roles decide, and where Enyo could help (suggest first; a person always
 * decides). Needs analytics.business.view; the person's branch reach and
 * organisation.
 */
export type WorkflowInsights = { days: number; steps: StepPicture[]; total: number; model: { version: string; status: string; metrics: Record<string, unknown> } | null };

export async function getWorkflowInsights(input: { days?: number } = {}): Promise<WorkflowInsights> {
  await authorize('analytics.business.view', undefined, 'getWorkflowInsights');
  const organisationId = await myOrganisationId();
  const days = [30, 90, 180, 365].includes(Number(input.days)) ? Number(input.days) : 90;
  if (!organisationId) return { days, steps: [], total: 0, model: null };
  const reach = await reachWhere('analytics.business.view');
  const branchIds = reach.branchId === undefined ? null : typeof reach.branchId === 'string' ? [reach.branchId] : reach.branchId.in;
  const rows = await decisionLog({ organisationId, since: new Date(Date.now() - days * 86_400_000), branchIds });
  const model = await prisma.enyoModel.findFirst({ where: { organisationId, task: 'DECISION_RISK', status: { in: ['ACTIVE', 'CANDIDATE'] } }, orderBy: { trainedAt: 'desc' }, select: { version: true, status: true, metrics: true } });
  return {
    days, steps: stepPictures(rows), total: rows.length,
    model: model ? { version: model.version, status: model.status, metrics: (model.metrics && typeof model.metrics === 'object' ? model.metrics : {}) as Record<string, unknown> } : null,
  };
}
