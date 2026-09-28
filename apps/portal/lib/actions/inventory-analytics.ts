'use server';

import { prisma } from '@ejo/database';
import { requireUser } from './workshop';
import { computeInventoryAnalytics, type Settings, type IIssue } from '@/lib/inventory-analytics';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** The price charged for one issued unit: the Job Card / Vehicle Service
 * estimate line it was released against. */
function priceOf(slipLine: { estimateLineItem: { unitPrice: unknown } | null; serviceEstimateLineItem: { unitPrice: unknown } | null } | null): number | null {
  return num(slipLine?.estimateLineItem?.unitPrice) ?? num(slipLine?.serviceEstimateLineItem?.unitPrice);
}

const SLIP_PRICE = { select: { estimateLineItem: { select: { unitPrice: true } }, serviceEstimateLineItem: { select: { unitPrice: true } } } } as const;

/** Gathers the branch's real stock movements (true costs from goods-receipt
 * lines; prices actually charged) and hands them to the pure engine. */
export async function getInventoryAnalytics(branchId: string, settings?: Partial<Settings>) {
  await requireUser();
  const [parts, receipts, qtyUses, batchUses, serials, openPricingAlerts] = await Promise.all([
    prisma.part.findMany({
      where: { branchId },
      select: { id: true, name: true, partNumber: true, category: true, baseUnitOfMeasure: true, isActive: true, reorderPoint: true, safetyStock: true, sellingPrice: true, targetMarginPercent: true, createdAt: true, stock: { select: { quantityOnHand: true, quantityReserved: true } } },
    }),
    prisma.goodsReceiptLine.findMany({
      where: { part: { branchId } },
      select: { partId: true, quantityInBaseUnit: true, unitCost: true, goodsReceipt: { select: { receivedAt: true, supplierName: true } } },
    }),
    prisma.partQuantityConsumption.findMany({
      where: { part: { branchId } },
      select: { partId: true, quantityTaken: true, consumedAt: true, goodsReceiptLine: { select: { unitCost: true } }, slipLine: SLIP_PRICE },
    }),
    prisma.partBatchConsumption.findMany({
      where: { batch: { part: { branchId } } },
      select: { quantityTaken: true, consumedAt: true, batch: { select: { partId: true, goodsReceiptLine: { select: { unitCost: true } } } }, slipLine: SLIP_PRICE },
    }),
    prisma.partSerial.findMany({
      where: { part: { branchId }, issuedToSlipLineId: { not: null } },
      select: { partId: true, goodsReceiptLine: { select: { unitCost: true } }, issuedToSlipLine: { select: { estimateLineItem: { select: { unitPrice: true } }, serviceEstimateLineItem: { select: { unitPrice: true } }, slip: { select: { releasedAt: true } } } } },
    }),
    prisma.pricingAlert.count({ where: { status: 'OPEN', part: { branchId } } }),
  ]);

  const issues: IIssue[] = [
    ...qtyUses.map((q: (typeof qtyUses)[number]) => {
      const price = priceOf(q.slipLine);
      return { partId: q.partId, qty: Number(q.quantityTaken), date: q.consumedAt, unitCost: num(q.goodsReceiptLine?.unitCost), unitPrice: price, priceIsEstimated: price === null };
    }),
    ...batchUses.map((b: (typeof batchUses)[number]) => {
      const price = priceOf(b.slipLine);
      return { partId: b.batch.partId, qty: Number(b.quantityTaken), date: b.consumedAt, unitCost: num(b.batch.goodsReceiptLine?.unitCost), unitPrice: price, priceIsEstimated: price === null };
    }),
    ...serials
      .filter((x: (typeof serials)[number]) => x.issuedToSlipLine?.slip.releasedAt)
      .map((x: (typeof serials)[number]) => {
        const price = priceOf(x.issuedToSlipLine);
        return { partId: x.partId, qty: 1, date: x.issuedToSlipLine!.slip.releasedAt as Date, unitCost: num(x.goodsReceiptLine?.unitCost), unitPrice: price, priceIsEstimated: price === null };
      }),
  ];

  return computeInventoryAnalytics({
    parts: parts.map((p: (typeof parts)[number]) => ({
      id: p.id, name: p.name, partNumber: p.partNumber, category: p.category, unit: p.baseUnitOfMeasure, isActive: p.isActive,
      onHand: Number(p.stock?.quantityOnHand ?? 0), reserved: Number(p.stock?.quantityReserved ?? 0),
      reorderPoint: num(p.reorderPoint), safetyStock: num(p.safetyStock), sellingPrice: num(p.sellingPrice), targetMarginPercent: num(p.targetMarginPercent), createdAt: p.createdAt,
    })),
    receipts: receipts.map((r: (typeof receipts)[number]) => ({ partId: r.partId, qty: Number(r.quantityInBaseUnit), unitCost: num(r.unitCost), date: r.goodsReceipt.receivedAt, supplier: r.goodsReceipt.supplierName })),
    issues,
    openPricingAlerts,
    settings,
  });
}
