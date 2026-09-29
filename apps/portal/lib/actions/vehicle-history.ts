'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';

/** Every part ever released to one vehicle — on any Job Card or Vehicle
 * Service — with its Parts Request, serials and warranty numbers. */
export async function listPartsFittedToVehicle(vehicleId: string) {
  await requireUser();
  return prisma.partRequestSlipLine.findMany({
    where: {
      quantityReleased: { gt: 0 },
      slip: { status: 'RELEASED', OR: [{ jobCard: { vehicleId } }, { vehicleService: { vehicleId } }] },
    },
    orderBy: { slip: { releasedAt: 'desc' } },
    take: 200,
    select: {
      id: true,
      quantityReleased: true,
      part: { select: { id: true, name: true, partNumber: true, baseUnitOfMeasure: true } },
      issuedSerials: { select: { serialNumber: true } },
      warranties: { select: { id: true, warrantyNumber: true } },
      slip: {
        select: {
          id: true, referenceNumber: true, releasedAt: true,
          jobCard: { select: { id: true, jobNumber: true, customer: { select: { fullName: true } } } },
          vehicleService: { select: { id: true, serviceNumber: true, customer: { select: { fullName: true } } } },
        },
      },
    },
  });
}

/** Value of work on this vehicle NOT charged to the customer — Job Card
 * lines covered by warranty, goodwill or internally (cancelled jobs excluded). */
export async function getVehicleCoveredValue(vehicleId: string): Promise<number> {
  await requireUser();
  const lines = await prisma.estimateLineItem.findMany({
    where: { billTo: { not: 'CUSTOMER' }, estimate: { jobCard: { vehicleId, status: { not: 'CANCELLED' } } } },
    select: { amount: true },
  });
  return Math.round(lines.reduce((s: number, l: { amount: unknown }) => s + Number(l.amount ?? 0), 0) * 100) / 100;
}
