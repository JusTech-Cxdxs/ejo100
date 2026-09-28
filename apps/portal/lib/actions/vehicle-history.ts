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
