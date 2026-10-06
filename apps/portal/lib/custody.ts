import type { Prisma } from '@ejo/database';

/**
 * ONE definition of "the vehicle is still physically with us", shared by the
 * main dashboard, the custody pages and the Security dashboard — so the
 * numbers on different screens can never quietly disagree.
 *
 *  • Job Card: anything not yet checked out at the gate — a cancelled Job
 *    Card whose vehicle has not been collected is still inside.
 *  • Vehicle Service: checked in through to closed, plus a cancelled one
 *    whose vehicle has not been handed back yet.
 */
export function jobCardInside(): Prisma.JobCardWhereInput {
  return { status: { not: 'CHECKED_OUT' } };
}

export function serviceInside(): Prisma.VehicleServiceWhereInput {
  return {
    OR: [
      { status: { in: ['CHECKED_IN', 'IN_SERVICE', 'COMPLETED', 'READY_FOR_COLLECTION', 'CLOSED'] } },
      { status: 'CANCELLED', collectedAt: null },
    ],
  };
}

/** Active work (being worked on — not cancelled, not yet out). */
export function jobCardActive(): Prisma.JobCardWhereInput {
  return { status: { notIn: ['CHECKED_OUT', 'CANCELLED'] } };
}
