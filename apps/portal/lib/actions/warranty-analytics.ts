'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { listWarrantyIdsWithReminderDue } from './warranty';
import { computeWarrantyAnalytics } from '@/lib/warranty-analytics';

const label = (v: { make: string | null; model: string | null } | null) => (v ? [v.make, v.model].filter(Boolean).join(' ') || null : null);

/** Gathers plain rows and hands them to the pure analytics engine. */
export async function getWarrantyAnalytics() {
  await requireUser();
  const since = new Date(Date.now() - 180 * 86400000);
  const [warranties, claims, jobCards, reminderDue] = await Promise.all([
    prisma.warranty.findMany({
      select: {
        id: true, warrantyNumber: true, kind: true, status: true, startsAt: true, endsAt: true, startReading: true, distanceLimit: true, statusReason: true, issuedAt: true, vehicleId: true,
        vehicle: { select: { make: true, model: true, mileage: true } },
        provider: { select: { name: true } },
      },
    }),
    prisma.warrantyClaim.findMany({
      select: {
        id: true, claimNumber: true, status: true, remedy: true, providerId: true, causalPart: true, causalPartNumber: true, claimedAmount: true, approvedAmount: true, settledAmount: true,
        decisionNotes: true, deadlineAt: true, createdAt: true, reviewRequestedAt: true, submittedAt: true, decidedAt: true, settledAt: true, failureDate: true, resubmissionCount: true,
        partReturnRequired: true, partReturnStatus: true, jobCardId: true,
        provider: { select: { name: true } },
        vehicle: { select: { make: true, model: true } },
      },
    }),
    prisma.jobCard.findMany({
      where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
      select: { id: true, jobNumber: true, createdAt: true, vehicleId: true, vehicle: { select: { make: true, model: true } } },
    }),
    listWarrantyIdsWithReminderDue(),
  ]);
  return computeWarrantyAnalytics({
    warranties: warranties.map((w: (typeof warranties)[number]) => ({
      id: w.id, warrantyNumber: w.warrantyNumber, kind: w.kind, status: w.status, startsAt: w.startsAt, endsAt: w.endsAt, startReading: w.startReading, distanceLimit: w.distanceLimit,
      statusReason: w.statusReason, issuedAt: w.issuedAt, vehicleId: w.vehicleId, vehicleMileage: w.vehicle?.mileage ?? null, vehicleLabel: label(w.vehicle), providerName: w.provider.name,
    })),
    claims: claims.map((c: (typeof claims)[number]) => ({
      id: c.id, claimNumber: c.claimNumber, status: c.status, remedy: c.remedy, providerId: c.providerId, providerName: c.provider.name, causalPart: c.causalPart, causalPartNumber: c.causalPartNumber,
      claimedAmount: Number(c.claimedAmount), approvedAmount: c.approvedAmount === null ? null : Number(c.approvedAmount), settledAmount: c.settledAmount === null ? null : Number(c.settledAmount),
      decisionNotes: c.decisionNotes, deadlineAt: c.deadlineAt, createdAt: c.createdAt, reviewRequestedAt: c.reviewRequestedAt, submittedAt: c.submittedAt, decidedAt: c.decidedAt, settledAt: c.settledAt,
      failureDate: c.failureDate, resubmissionCount: c.resubmissionCount, partReturnRequired: c.partReturnRequired, partReturnStatus: c.partReturnStatus, vehicleLabel: label(c.vehicle), jobCardId: c.jobCardId,
    })),
    recentJobCards: jobCards.map((j: (typeof jobCards)[number]) => ({ id: j.id, jobNumber: j.jobNumber, createdAt: j.createdAt, vehicleId: j.vehicleId, vehicleLabel: label(j.vehicle) })),
    reminderDueCount: reminderDue.length,
  });
}
