'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { jobCardOutcome, vehicleServiceOutcome, refundState, type VisitOutcome, type RefundState } from '@/lib/visit-outcome';

export type OutcomeInfo = { outcome: VisitOutcome; refund: RefundState; paid: number; refunded: number };

const total = (rows: { amount: unknown }[]) => rows.reduce((s, r) => s + Number(r.amount), 0);

/** How each Job Card ended (completed / cancelled, and refund state). */
export async function getJobCardOutcomes(ids: string[]): Promise<Record<string, OutcomeInfo>> {
  await requireUser();
  if (ids.length === 0) return {};
  const rows = await prisma.jobCard.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, status: true, checkedOutAt: true,
      cancellationRequests: { where: { status: 'APPROVED' }, select: { id: true } },
      payments: { select: { amount: true } },
      refunds: { select: { amount: true } },
    },
  });
  const out: Record<string, OutcomeInfo> = {};
  for (const r of rows) {
    const paid = total(r.payments);
    const refunded = total(r.refunds);
    out[r.id] = { outcome: jobCardOutcome({ status: r.status, checkedOutAt: r.checkedOutAt, hasApprovedCancellation: r.cancellationRequests.length > 0 }), refund: refundState(paid, refunded), paid, refunded };
  }
  return out;
}

/** How each Vehicle Service ended (completed / cancelled / escalated). */
export async function getVehicleServiceOutcomes(ids: string[]): Promise<Record<string, OutcomeInfo>> {
  await requireUser();
  if (ids.length === 0) return {};
  const rows = await prisma.vehicleService.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, collectedAt: true, escalatedToJobCardId: true, payments: { select: { amount: true } }, refunds: { select: { amount: true } } },
  });
  const out: Record<string, OutcomeInfo> = {};
  for (const r of rows) {
    const paid = total(r.payments);
    const refunded = total(r.refunds);
    out[r.id] = { outcome: vehicleServiceOutcome({ status: r.status, collectedAt: r.collectedAt, escalated: Boolean(r.escalatedToJobCardId) }), refund: refundState(paid, refunded), paid, refunded };
  }
  return out;
}
