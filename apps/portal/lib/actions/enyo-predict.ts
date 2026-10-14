'use server';
/**
 * The one thing a person does to an Enyo prediction from a page: hide the
 * "Likely lines from similar jobs" card on an estimate. Predictions are
 * written by the system (lib/enyo/predict/lines.ts), never by a browser.
 */
import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { authorizeOnJobCard, authorizeOnService, inMyOrganisation, NOT_AVAILABLE } from '@/lib/authz/server';
import { writeAuditLog } from '@/lib/workshop-core';

/** Only the people who may work on the estimate (its supervisor and technician) can hide its suggestions. */
export async function dismissLikelyLines(predictionId: string): Promise<void> {
  const user = await requireUser();
  const id = typeof predictionId === 'string' ? predictionId.trim().slice(0, 64) : '';
  const p = id ? await prisma.enyoPrediction.findUnique({ where: { id }, select: { id: true, organisationId: true, subjectType: true, subjectId: true } }) : null;
  if (!p || !(await inMyOrganisation(p.organisationId))) throw new Error(NOT_AVAILABLE);
  if (p.subjectType === 'JobCard') await authorizeOnJobCard('workshop.estimate.edit', p.subjectId, 'dismissLikelyLines');
  else if (p.subjectType === 'VehicleService') await authorizeOnService('workshop.estimate.edit', p.subjectId, 'dismissLikelyLines');
  else throw new Error(NOT_AVAILABLE);
  // Only a prediction still on show; a resolved one keeps its record.
  const res = await prisma.enyoPrediction.updateMany({ where: { id: p.id, status: { in: ['SHADOW', 'SHOWN'] } }, data: { status: 'DISMISSED' } });
  if (res.count === 1) {
    await writeAuditLog({ userId: user.id, action: 'enyo.suggestions_dismissed', entityType: p.subjectType, entityId: p.subjectId, metadata: { predictionId: p.id } });
  }
}
