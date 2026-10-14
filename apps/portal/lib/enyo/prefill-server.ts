/**
 * Checks an Enyo pre-fill against the person's rights and organisation before
 * the Open Job Card form shows it (server-only; never a 'use server' file).
 * A customer outside the organisation, or a vehicle that is not theirs, is
 * simply left out — the form is never filled with something the person could
 * not have picked themselves.
 */
import { prisma } from '@ejo/database';
import { allows, orgWhere } from '@/lib/authz/server';
import type { JobCardPrefill } from './prefill';

export type CheckedJobCardPrefill = {
  customer: { id: string; label: string } | null;
  vehicleId: string | null;
  complaints: string[];
  mileage: number | null;
};

export async function checkJobCardPrefill(p: JobCardPrefill | null): Promise<CheckedJobCardPrefill | null> {
  if (!p) return null;
  if (!(await allows('workshop.job_card.create'))) return null;
  const customer = p.customerId
    ? await prisma.customer.findFirst({ where: { id: p.customerId, ...(await orgWhere()) }, select: { id: true, fullName: true } })
    : null;
  const vehicle = customer && p.vehicleId ? await prisma.customerVehicle.findFirst({ where: { id: p.vehicleId, customerId: customer.id }, select: { id: true } }) : null;
  return {
    customer: customer ? { id: customer.id, label: customer.fullName } : null,
    vehicleId: vehicle?.id ?? null,
    complaints: p.complaints,
    mileage: p.mileage ?? null,
  };
}
