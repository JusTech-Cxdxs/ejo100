'use server';

import { prisma } from '@ejo/database';
import { requireUser, writeAuditLog } from './workshop';
import { getWarrantyRoles } from './warranty';
import { warrantyCoverage } from '@/lib/warranty-state';
import { BILL_TO_LABEL, billingSplit, type BillTo } from '@/lib/estimate-billing';

class BillingError extends Error {}

const BILL_TOS: BillTo[] = ['CUSTOMER', 'WARRANTY', 'GOODWILL', 'INTERNAL'];
const CLOSED = ['CHECKED_OUT', 'CANCELLED'];

/** Warranties that can cover work on this Job Card's vehicle right now:
 * active and still covering (by date and odometer). */
async function eligibleWarranties(vehicleId: string, mileage: number | null) {
  const rows = await prisma.warranty.findMany({
    where: { vehicleId, status: 'ACTIVE' },
    orderBy: { issuedAt: 'desc' },
    select: { id: true, warrantyNumber: true, kind: true, status: true, subjectDescription: true, startsAt: true, endsAt: true, startReading: true, distanceLimit: true, statusReason: true, provider: { select: { name: true } } },
  });
  return rows.filter((w: (typeof rows)[number]) => {
    const cov = warrantyCoverage(w, mileage);
    return cov.state === 'COVERED' || cov.state === 'EXPIRING_SOON';
  });
}

/** Everything the Job Card's "Who pays" panel needs. */
export async function getJobCardBilling(jobCardId: string) {
  await requireUser();
  const jc = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: {
      id: true, status: true, vehicleId: true, mileageAtCheckIn: true,
      payments: { select: { amount: true } },
      refunds: { select: { amount: true } },
      estimate: {
        select: {
          lineItems: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, type: true, description: true, amount: true, billTo: true, billToNote: true, coveringWarranty: { select: { id: true, warrantyNumber: true } } },
          },
        },
      },
    },
  });
  if (!jc) return null;
  const [warranties, roles] = await Promise.all([eligibleWarranties(jc.vehicleId, jc.mileageAtCheckIn), getWarrantyRoles()]);
  const lines = jc.estimate?.lineItems ?? [];
  const split = billingSplit(lines);
  const paid = jc.payments.reduce((s: number, p: { amount: unknown }) => s + Number(p.amount), 0) - jc.refunds.reduce((s: number, r: { amount: unknown }) => s + Number(r.amount), 0);
  return {
    lines: lines.map((l: (typeof lines)[number]) => ({ ...l, amount: l.amount === null ? null : Number(l.amount) })),
    split,
    netPaid: Math.round(paid * 100) / 100,
    overpaid: Math.max(0, Math.round((paid - split.customer) * 100) / 100),
    warranties: warranties.map((w: (typeof warranties)[number]) => ({ id: w.id, warrantyNumber: w.warrantyNumber, kind: w.kind, subject: w.subjectDescription, provider: w.provider.name })),
    canEdit: roles.canApprove && !CLOSED.includes(jc.status),
    isClosed: CLOSED.includes(jc.status),
  };
}

/**
 * Decide who pays for one estimate line. WARRANTY needs an active warranty
 * that covers THIS vehicle right now; GOODWILL / INTERNAL need a reason.
 * Warranty HOD / Branch Manager only; not once the Job Card is checked out
 * or cancelled. Audited on the Job Card (and the warranty).
 */
export async function setEstimateLineBillTo(lineId: string, billTo: BillTo, warrantyId: string | null, note: string): Promise<void> {
  const user = await requireUser();
  const roles = await getWarrantyRoles();
  if (!roles.canApprove) throw new BillingError('Only the Warranty HOD or a Branch Manager can decide who pays for a line.');
  if (!BILL_TOS.includes(billTo)) throw new BillingError('Choose who pays for this line.');
  const why = note.trim();
  const line = await prisma.estimateLineItem.findUnique({
    where: { id: lineId },
    select: { id: true, description: true, amount: true, billTo: true, coveringWarrantyId: true, estimate: { select: { jobCard: { select: { id: true, jobNumber: true, status: true, vehicleId: true, mileageAtCheckIn: true } } } } },
  });
  if (!line) throw new BillingError('Estimate line not found.');
  const jc = line.estimate.jobCard;
  if (CLOSED.includes(jc.status)) throw new BillingError('This Job Card is closed — who pays can no longer change.');
  let coveringWarrantyId: string | null = null;
  let warrantyNumber: string | null = null;
  if (billTo === 'WARRANTY') {
    if (!warrantyId) throw new BillingError('Choose the warranty that covers this line.');
    const eligible = await eligibleWarranties(jc.vehicleId, jc.mileageAtCheckIn);
    const w = eligible.find((x: { id: string }) => x.id === warrantyId);
    if (!w) throw new BillingError('That warranty does not cover this vehicle right now (it must be active and within its dates and km).');
    coveringWarrantyId = w.id;
    warrantyNumber = w.warrantyNumber;
  } else if ((billTo === 'GOODWILL' || billTo === 'INTERNAL') && !why) {
    throw new BillingError(`Give the reason this line is ${billTo === 'GOODWILL' ? 'goodwill' : 'an internal cost'}.`);
  }
  if (line.billTo === billTo && (line.coveringWarrantyId ?? null) === coveringWarrantyId) throw new BillingError('That is already who pays for this line.');
  // Capture the previous value before saving, so the audit's "from" is
  // always the real prior state.
  const previous = BILL_TO_LABEL[(line.billTo ?? 'CUSTOMER') as BillTo];
  await prisma.estimateLineItem.update({ where: { id: lineId }, data: { billTo, coveringWarrantyId, billToNote: why || null } });
  const metadata = {
    line: line.description,
    amount: line.amount === null ? null : Number(line.amount),
    from: previous,
    to: `${BILL_TO_LABEL[billTo]}${warrantyNumber ? ` (${warrantyNumber})` : ''}`,
    note: why || undefined,
  };
  await writeAuditLog({ userId: user.id, action: 'job_card.line_bill_to_set', entityType: 'JobCard', entityId: jc.id, metadata: { jobNumber: jc.jobNumber, ...metadata } });
  if (coveringWarrantyId) {
    await writeAuditLog({ userId: user.id, action: 'warranty.covers_job_card_line', entityType: 'Warranty', entityId: coveringWarrantyId, metadata: { jobNumber: jc.jobNumber, ...metadata } });
  }
}

/** For "Start a claim" from a Job Card: the lines billed to one warranty,
 * split into parts / labour / other for the claim form. */
export async function getCoveredAmountsForClaim(jobCardId: string, warrantyId: string): Promise<{ parts: number; labour: number; other: number; lines: string[] } | null> {
  await requireUser();
  const lines = await prisma.estimateLineItem.findMany({
    where: { estimate: { jobCardId }, billTo: 'WARRANTY', coveringWarrantyId: warrantyId },
    select: { type: true, description: true, amount: true },
  });
  if (lines.length === 0) return null;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const sumOf = (types: string[]) => r2(lines.filter((l: { type: string }) => types.includes(l.type)).reduce((s: number, l: { amount: unknown }) => s + Number(l.amount ?? 0), 0));
  return {
    parts: sumOf(['STORE_PART', 'EXTERNAL_PART']),
    labour: sumOf(['LABOUR']),
    other: sumOf(['EXTERNAL_JOB', 'INTERNAL_JOB', 'SUNDRY']),
    lines: lines.map((l: { description: string }) => l.description),
  };
}
