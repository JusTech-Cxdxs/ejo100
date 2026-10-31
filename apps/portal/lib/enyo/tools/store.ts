/**
 * The Store: selling price and stock for any staff with the Store open
 * (store.view), and purchase cost and margin only for people who already
 * see costs on the Store pages (STORE_COST_PERMISSIONS). Parts are read
 * through listParts / getPricingAlertSummary, fenced to the person's Store.
 */
import { allows } from '@/lib/authz/server';
import { STORE_COST_PERMISSIONS } from '@/lib/authz/catalogue';
import { getLastKnownUnitCostForPart, getPricingAlertSummary, getStoreBranchId, listParts, listLowStockParts } from '@/lib/actions/store';
import { money, nothing, ok, r2, refused, text } from '../tool-helpers';
import type { StaffTool } from '../types';

type PartRow = Awaited<ReturnType<typeof listParts>>[number];

const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function stockOf(p: PartRow) {
  const onHand = Number(p.stock?.quantityOnHand ?? 0);
  const reserved = Number(p.stock?.quantityReserved ?? 0);
  const available = Math.max(0, Math.round((onHand - reserved) * 1000) / 1000);
  const reorderPoint = n(p.reorderPoint);
  const level = onHand <= 0 ? 'Out of stock' : reorderPoint !== null && onHand <= reorderPoint ? 'At or below reorder point' : 'In stock';
  return { onHand, reserved, available, reorderPoint, level };
}

async function seesCosts(branchId: string): Promise<boolean> {
  for (const k of STORE_COST_PERMISSIONS) if (await allows(k, { branchId })) return true;
  return false;
}

const STORE_WHO = 'the Store is open to the workshop, the Store, Finance, Warranty and management.';

export const storeTools: StaffTool[] = [
  {
    name: 'part_lookup',
    kind: 'read',
    status: 'Checking the parts list…',
    description:
      'Look up parts in this person\'s Store by name, part number or category: selling price (₦, per unit), stock on hand, reserved and available, and stock level, with links. Purchase cost and margin are included only for people allowed to see costs.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Part name, part number or category, e.g. "oil filter" or "E2ES-002".', minLength: 2, maxLength: 80 } },
      required: ['query'],
      additionalProperties: false,
    },
    run: async (args) => {
      if (!(await allows('store.view'))) return refused(STORE_WHO);
      const branchId = await getStoreBranchId();
      const parts = await listParts(branchId, text(args.query, 80), 8);
      if (!parts.length) return nothing('No active part in this Store matches that.');
      const costs = await seesCosts(branchId);
      const rows = await Promise.all(parts.map(async (p) => {
        const price = n(p.sellingPrice);
        const base = { name: p.name, partNumber: p.partNumber, unit: p.baseUnitOfMeasure, sellingPrice: price === null ? null : money(price), ...stockOf(p), href: `/inventory/parts/${p.id}` };
        if (!costs) return base;
        const cost = await getLastKnownUnitCostForPart(p.id).catch(() => null);
        const marginPercent = cost !== null && price ? Math.round(((price - cost) / price) * 1000) / 10 : null;
        return { ...base, lastUnitCost: cost === null ? null : money(cost), marginPercent, targetMarginPercent: n(p.targetMarginPercent) };
      }));
      return ok({ parts: rows, costsShown: costs, ...(rows.some((r) => r.sellingPrice === null) ? { note: 'A part with no selling price has not been priced by the Store yet.' } : {}) }, rows.slice(0, 3).map((r) => ({ label: r.partNumber ?? r.name, href: r.href })));
    },
  },
  {
    name: 'stock_alerts',
    kind: 'read',
    status: 'Checking stock levels…',
    description:
      'Parts in this person\'s Store that are out of stock or at or below their reorder point (worst first), with links; for people who see costs, also the open pricing alerts (sold below cost, below target margin).',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => {
      if (!(await allows('store.view'))) return refused(STORE_WHO);
      const branchId = await getStoreBranchId();
      // Only the parts at or below their reorder point, found by the database (a catalogue may hold hundreds of thousands).
      const parts = await listLowStockParts(branchId);
      const low = parts
        .map((p) => ({ p, s: stockOf(p) }))
        .filter(({ s }) => s.level !== 'In stock')
        .sort((a, b) => (a.s.onHand - (a.s.reorderPoint ?? 0)) - (b.s.onHand - (b.s.reorderPoint ?? 0)));
      const out = low.filter((x) => x.s.level === 'Out of stock').length;
      const costs = await seesCosts(branchId);
      const pricing = costs ? await getPricingAlertSummary(branchId).catch(() => null) : null;
      return ok({
        outOfStock: out,
        atOrBelowReorderPoint: low.length - out,
        parts: low.slice(0, 20).map(({ p, s }) => ({ name: p.name, partNumber: p.partNumber, unit: p.baseUnitOfMeasure, onHand: s.onHand, reserved: s.reserved, reorderPoint: s.reorderPoint, level: s.level, href: `/inventory/parts/${p.id}` })),
        ...(pricing ? { pricingAlerts: { soldBelowCost: pricing.openBySeverity.CRITICAL_LOSS, belowTargetMargin: pricing.openBySeverity.DEFICIT, aboveTarget: pricing.openBySeverity.BOOST, lossIfStockSoldAtTodaysPrice: r2(pricing.criticalLossExposure), href: '/inventory/pricing' } } : {}),
      }, [{ label: 'Parts', href: '/inventory/parts' }, ...(pricing ? [{ label: 'Pricing Command Center', href: '/inventory/pricing' }] : [])]);
    },
  },
];
