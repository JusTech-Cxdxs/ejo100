import { prisma } from '@ejo/database';
import { recordUrl } from '@/lib/notification-rules';

/**
 * Turns (record type, id) pairs into a readable name and the EXACT page —
 * "JC-2026-000013", "Toyota Hilux — KJA453GX", "Part BP-102 Brake pads" —
 * and sends child records to their parent's page (an estimate line → its Job
 * Card, a payment → its Vehicle Service, a GRN line → its goods receipt).
 * One batched query per record type, never one per row. Server-only.
 */
export type ResolvedRecord = { label: string; url: string };
type Pair = { type: string; id: string };

const words = (t: string) => t.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/ ([A-Z])/g, (_, c: string) => ` ${c.toLowerCase()}`);
const jcUrl = (id: string) => `/workshop/job-cards/${id}`;
const svUrl = (id: string) => `/workshop/vehicle-service/${id}`;

export async function resolveRecords(pairs: Pair[]): Promise<Map<string, ResolvedRecord>> {
  const out = new Map<string, ResolvedRecord>();
  const byType = new Map<string, Set<string>>();
  for (const p of pairs) {
    if (!p.id) continue;
    const t = p.type.replace(/^db:/, '');
    if (!byType.has(t)) byType.set(t, new Set());
    byType.get(t)!.add(p.id);
  }
  const set = (type: string, id: string, label: string, url: string) => {
    out.set(`${type}:${id}`, { label, url });
    out.set(`db:${type}:${id}`, { label, url });
  };
  const ids = (t: string) => [...(byType.get(t) ?? [])];
  const jobs: Promise<unknown>[] = [];
  const run = (t: string, f: (list: string[]) => Promise<void>) => { const list = ids(t); if (list.length) jobs.push(f(list).catch(() => undefined)); };

  run('JobCard', async (l) => { for (const r of await prisma.jobCard.findMany({ where: { id: { in: l } }, select: { id: true, jobNumber: true } })) set('JobCard', r.id, r.jobNumber, jcUrl(r.id)); });
  run('VehicleService', async (l) => { for (const r of await prisma.vehicleService.findMany({ where: { id: { in: l } }, select: { id: true, serviceNumber: true } })) set('VehicleService', r.id, r.serviceNumber, svUrl(r.id)); });
  run('CustomerVehicle', async (l) => { for (const r of await prisma.customerVehicle.findMany({ where: { id: { in: l } }, select: { id: true, make: true, model: true, plateNumber: true } })) set('CustomerVehicle', r.id, `${[r.make, r.model].filter(Boolean).join(' ') || 'Vehicle'}${r.plateNumber ? ` — ${r.plateNumber}` : ''}`, `/workshop/vehicles/${r.id}/edit`); });
  run('Customer', async (l) => { for (const r of await prisma.customer.findMany({ where: { id: { in: l } }, select: { id: true, fullName: true } })) set('Customer', r.id, r.fullName, `/workshop/customers?q=${encodeURIComponent(r.fullName)}`); });
  run('Part', async (l) => { for (const r of await prisma.part.findMany({ where: { id: { in: l } }, select: { id: true, partNumber: true, name: true } })) set('Part', r.id, `${r.partNumber} ${r.name}`, `/inventory/parts/${r.id}`); });
  run('PricingAlert', async (l) => { for (const r of await prisma.pricingAlert.findMany({ where: { id: { in: l } }, select: { id: true, part: { select: { id: true, partNumber: true, name: true } } } })) set('PricingAlert', r.id, `Pricing alert — ${r.part.partNumber} ${r.part.name}`, `/inventory/parts/${r.part.id}`); });
  run('GoodsReceipt', async (l) => { for (const r of await prisma.goodsReceipt.findMany({ where: { id: { in: l } }, select: { id: true, referenceNumber: true } })) set('GoodsReceipt', r.id, r.referenceNumber, `/inventory/goods-receipts/${r.id}`); });
  run('GoodsReceiptLine', async (l) => { for (const r of await prisma.goodsReceiptLine.findMany({ where: { id: { in: l } }, select: { id: true, goodsReceipt: { select: { id: true, referenceNumber: true } }, part: { select: { partNumber: true } } } })) set('GoodsReceiptLine', r.id, `${r.goodsReceipt.referenceNumber} · ${r.part.partNumber}`, `/inventory/goods-receipts/${r.goodsReceipt.id}`); });
  run('PartRequestSlip', async (l) => { for (const r of await prisma.partRequestSlip.findMany({ where: { id: { in: l } }, select: { id: true, referenceNumber: true } })) set('PartRequestSlip', r.id, r.referenceNumber, `/workshop/parts-requests/${r.id}`); });
  run('PartRequestSlipLine', async (l) => { for (const r of await prisma.partRequestSlipLine.findMany({ where: { id: { in: l } }, select: { id: true, slip: { select: { id: true, referenceNumber: true } } } })) set('PartRequestSlipLine', r.id, r.slip.referenceNumber, `/workshop/parts-requests/${r.slip.id}`); });
  run('ExternalProcurementRequest', async (l) => { for (const r of await prisma.externalProcurementRequest.findMany({ where: { id: { in: l } }, select: { id: true, referenceNumber: true } })) set('ExternalProcurementRequest', r.id, r.referenceNumber, `/workshop/external-procurement/${r.id}`); });
  run('Warranty', async (l) => { for (const r of await prisma.warranty.findMany({ where: { id: { in: l } }, select: { id: true, warrantyNumber: true } })) set('Warranty', r.id, r.warrantyNumber, `/warranty/${r.id}`); });
  run('WarrantyClaim', async (l) => { for (const r of await prisma.warrantyClaim.findMany({ where: { id: { in: l } }, select: { id: true, claimNumber: true } })) set('WarrantyClaim', r.id, r.claimNumber, `/warranty/claims/${r.id}`); });
  run('WarrantyPolicy', async (l) => { for (const r of await prisma.warrantyPolicy.findMany({ where: { id: { in: l } }, select: { id: true, name: true } })) set('WarrantyPolicy', r.id, `Policy — ${r.name}`, `/warranty/policies/${r.id}`); });
  run('WarrantyProvider', async (l) => { for (const r of await prisma.warrantyProvider.findMany({ where: { id: { in: l } }, select: { id: true, name: true } })) set('WarrantyProvider', r.id, `Provider — ${r.name}`, `/warranty/providers/${r.id}`); });
  const parentOf = (r: { jobCard: { id: string; jobNumber: string } | null; vehicleService: { id: string; serviceNumber: string } | null }) => (r.jobCard ? { label: r.jobCard.jobNumber, url: jcUrl(r.jobCard.id) } : r.vehicleService ? { label: r.vehicleService.serviceNumber, url: svUrl(r.vehicleService.id) } : null);
  const PARENT = { jobCard: { select: { id: true, jobNumber: true } }, vehicleService: { select: { id: true, serviceNumber: true } } } as const;
  run('Payment', async (l) => { for (const r of await prisma.payment.findMany({ where: { id: { in: l } }, select: { id: true, ...PARENT } })) { const p = parentOf(r); if (p) set('Payment', r.id, `Payment on ${p.label}`, p.url); } });
  run('Refund', async (l) => { for (const r of await prisma.refund.findMany({ where: { id: { in: l } }, select: { id: true, referenceNumber: true, ...PARENT } })) { const p = parentOf(r); if (p) set('Refund', r.id, `${r.referenceNumber} on ${p.label}`, p.url); } });
  run('Estimate', async (l) => { for (const r of await prisma.estimate.findMany({ where: { id: { in: l } }, select: { id: true, jobCard: { select: { id: true, jobNumber: true } } } })) set('Estimate', r.id, `Estimate on ${r.jobCard.jobNumber}`, jcUrl(r.jobCard.id)); });
  run('EstimateLineItem', async (l) => { for (const r of await prisma.estimateLineItem.findMany({ where: { id: { in: l } }, select: { id: true, estimate: { select: { jobCard: { select: { id: true, jobNumber: true } } } } } })) set('EstimateLineItem', r.id, `Estimate line on ${r.estimate.jobCard.jobNumber}`, jcUrl(r.estimate.jobCard.id)); });
  run('ServiceEstimate', async (l) => { for (const r of await prisma.serviceEstimate.findMany({ where: { id: { in: l } }, select: { id: true, vehicleService: { select: { id: true, serviceNumber: true } } } })) set('ServiceEstimate', r.id, `Estimate on ${r.vehicleService.serviceNumber}`, svUrl(r.vehicleService.id)); });
  run('ServiceEstimateLineItem', async (l) => { for (const r of await prisma.serviceEstimateLineItem.findMany({ where: { id: { in: l } }, select: { id: true, estimate: { select: { vehicleService: { select: { id: true, serviceNumber: true } } } } } })) set('ServiceEstimateLineItem', r.id, `Estimate line on ${r.estimate.vehicleService.serviceNumber}`, svUrl(r.estimate.vehicleService.id)); });
  run('VehicleInspection', async (l) => { for (const r of await prisma.vehicleInspection.findMany({ where: { id: { in: l } }, select: { id: true, vehicleService: { select: { id: true, serviceNumber: true } } } })) if (r.vehicleService) set('VehicleInspection', r.id, `Inspection on ${r.vehicleService.serviceNumber}`, svUrl(r.vehicleService.id)); });
  run('Visit', async (l) => { for (const r of await prisma.visit.findMany({ where: { id: { in: l } }, select: { id: true, visitNumber: true, visitorName: true } })) set('Visit', r.id, `${r.visitNumber} — ${r.visitorName}`, `/security/visitors/${r.id}`); });
  run('ExitPass', async (l) => { for (const r of await prisma.exitPass.findMany({ where: { id: { in: l } }, select: { id: true, passNumber: true } })) set('ExitPass', r.id, r.passNumber, `/security/exit-passes/${r.id}`); });
  run('VehicleGateExit', async (l) => { for (const r of await prisma.vehicleGateExit.findMany({ where: { id: { in: l } }, select: { id: true, exitNumber: true } })) set('VehicleGateExit', r.id, r.exitNumber, `/security/vehicles/exits/${r.id}`); });
  run('RoadTestPermit', async (l) => { for (const r of await prisma.roadTestPermit.findMany({ where: { id: { in: l } }, select: { id: true, permitNumber: true } })) set('RoadTestPermit', r.id, r.permitNumber, `/security/road-tests/${r.id}`); });
  run('SecurityIncident', async (l) => { for (const r of await prisma.securityIncident.findMany({ where: { id: { in: l } }, select: { id: true, incidentNumber: true } })) set('SecurityIncident', r.id, r.incidentNumber, `/security/incidents/${r.id}`); });
  run('GateDelivery', async (l) => { for (const r of await prisma.gateDelivery.findMany({ where: { id: { in: l } }, select: { id: true, deliveryNumber: true } })) set('GateDelivery', r.id, r.deliveryNumber, `/security/deliveries/${r.id}`); });
  run('ContractorPass', async (l) => { for (const r of await prisma.contractorPass.findMany({ where: { id: { in: l } }, select: { id: true, passNumber: true } })) set('ContractorPass', r.id, r.passNumber, `/security/contractors/${r.id}`); });
  run('Appointment', async (l) => { for (const r of await prisma.appointment.findMany({ where: { id: { in: l } }, select: { id: true, appointmentNumber: true, title: true } })) set('Appointment', r.id, `${r.appointmentNumber} — ${r.title}`, `/schedule/${r.id}`); });
  run('Broadcast', async (l) => { for (const r of await prisma.broadcast.findMany({ where: { id: { in: l } }, select: { id: true, broadcastNumber: true } })) set('Broadcast', r.id, r.broadcastNumber, `/notifications/broadcasts/${r.id}`); });
  run('User', async (l) => { for (const r of await prisma.user.findMany({ where: { id: { in: l } }, select: { id: true, fullName: true } })) set('User', r.id, r.fullName, '/users'); });
  await Promise.all(jobs);
  // Anything not resolved (deleted since, or a type without its own page):
  // a readable type name and the best page we know — never a raw id.
  for (const p of pairs) {
    const k = `${p.type}:${p.id}`;
    if (!out.has(k)) {
      const t = p.type.replace(/^db:/, '');
      out.set(k, { label: words(t).replace(/^./, (c) => c.toUpperCase()), url: recordUrl(t, p.id) });
    }
  }
  return out;
}
