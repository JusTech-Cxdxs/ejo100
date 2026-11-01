'use server';

import { seeVehicle } from '@/lib/authz/server';
import { prisma } from '@ejo/database';
import { requireUser } from './workshop';

/** Every part ever released to one vehicle — on any Job Card or Vehicle
 * Service — with its Parts Request, serials and warranty numbers. */
export async function listPartsFittedToVehicle(vehicleId: string) {
  await requireUser();
  await seeVehicle(vehicleId, 'listPartsFittedToVehicle');
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
  await seeVehicle(vehicleId, 'getVehicleCoveredValue');
  const lines = await prisma.estimateLineItem.findMany({
    where: { billTo: { not: 'CUSTOMER' }, estimate: { jobCard: { vehicleId, status: { not: 'CANCELLED' } } } },
    select: { amount: true },
  });
  return Math.round(lines.reduce((s: number, l: { amount: unknown }) => s + Number(l.amount ?? 0), 0) * 100) / 100;
}

/**
 * This vehicle's history from before EJO 100 (v-A3), read-only: its SAP
 * invoices (linked when imported, or found by its chassis number) and the
 * plant's production, QC and PDI register entries for its VIN. Staff only:
 * inspectors' names never reach the customer portal.
 */
export async function getVehicleHistoryBeforeEjo(vehicleId: string): Promise<{
  invoices: { id: string; number: string; date: string; amount: number; documentType: string | null; description: string | null; customerName: string | null; fiscalYear: number | null }[];
  checks: { id: string; kind: string; date: string; stage: string | null; result: string | null; inspector: string | null; reference: string | null; notes: string | null; model: string | null }[];
}> {
  await requireUser();
  await seeVehicle(vehicleId, 'getVehicleHistoryBeforeEjo');
  const v = await prisma.customerVehicle.findUnique({ where: { id: vehicleId }, select: { chassisNumber: true, customer: { select: { organisationId: true } } } });
  if (!v) return { invoices: [], checks: [] };
  const organisationId = v.customer.organisationId;
  const vinKey = v.chassisNumber ? v.chassisNumber.toUpperCase().replace(/[\s-]/g, '') : null;
  const [invoices, checks] = await Promise.all([
    prisma.historicalInvoice.findMany({
      where: { organisationId, voidedAt: null, OR: [{ vehicleId }, ...(vinKey ? [{ vinKey }] : [])] },
      orderBy: { invoiceDate: 'desc' }, take: 300,
      select: { id: true, invoiceNumber: true, invoiceDate: true, amount: true, documentType: true, description: true, customerId: true, fiscalYear: true },
    }),
    vinKey
      ? prisma.vehicleHistoryRecord.findMany({
          where: { organisationId, voidedAt: null, vinKey },
          orderBy: [{ eventDate: 'asc' }, { createdAt: 'asc' }], take: 300,
          select: { id: true, kind: true, eventDate: true, stage: true, result: true, inspector: true, reference: true, notes: true, model: true },
        })
      : [],
  ]);
  const names = new Map((await prisma.customer.findMany({ where: { organisationId, id: { in: [...new Set(invoices.map((i) => i.customerId))] } }, select: { id: true, fullName: true } })).map((c) => [c.id, c.fullName]));
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  return {
    invoices: invoices.map((i) => ({ id: i.id, number: i.invoiceNumber, date: ymd(i.invoiceDate), amount: Number(i.amount), documentType: i.documentType, description: i.description, customerName: names.get(i.customerId) ?? null, fiscalYear: i.fiscalYear })),
    checks: checks.map((c) => ({ id: c.id, kind: c.kind, date: ymd(c.eventDate), stage: c.stage, result: c.result, inspector: c.inspector, reference: c.reference, notes: c.notes, model: c.model })),
  };
}
