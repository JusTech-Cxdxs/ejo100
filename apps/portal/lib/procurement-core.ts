/**
 * Procurement rules without the database: the requisition, purchase order,
 * shipment and supplier-claim status machines, purchase order totals and
 * received-against-ordered. Relative imports only — the unit tests compile
 * this file on its own (tests/procurement.test.ts).
 */

export type ChipTone = 'brand' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

// ── Requisitions ──────────────────────────────────────────────────────────

export type RequisitionStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'ORDERED' | 'CANCELLED';

export const REQUISITION_TRANSITIONS: Record<RequisitionStatus, RequisitionStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['ORDERED', 'CANCELLED'],
  REJECTED: ['DRAFT'],
  ORDERED: [],
  CANCELLED: [],
};

export function canMoveRequisition(from: RequisitionStatus, to: RequisitionStatus): boolean {
  return (REQUISITION_TRANSITIONS[from] ?? []).includes(to);
}

export const REQUISITION_STATUS_LABEL: Record<RequisitionStatus, string> = {
  DRAFT: 'Draft', SUBMITTED: 'Awaiting approval', APPROVED: 'Approved', REJECTED: 'Rejected', ORDERED: 'Ordered', CANCELLED: 'Cancelled',
};

export type RequisitionLineInput = { partId?: string | null; productId?: string | null; description: string; quantity: number; estimatedUnitCost?: number | null };

/** Why a requisition cannot be saved (null = fine). */
export function requisitionProblem(input: { reason: string; lines: RequisitionLineInput[] }): string | null {
  if (!input.reason.trim()) return 'Say why these items are needed.';
  if (input.lines.length === 0) return 'Add at least one line.';
  for (const [i, l] of input.lines.entries()) {
    if (!l.description.trim() && !l.partId && !l.productId) return `Line ${i + 1}: choose a part or product, or describe the item.`;
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) return `Line ${i + 1}: the quantity must be more than zero.`;
    if (l.estimatedUnitCost !== null && l.estimatedUnitCost !== undefined && l.estimatedUnitCost < 0) return `Line ${i + 1}: the estimated cost cannot be negative.`;
  }
  return null;
}

/** Estimated value of a requisition (lines with no estimate count as zero). */
export function requisitionEstimate(lines: { quantity: number; estimatedUnitCost?: number | null }[]): number {
  return round2(lines.reduce((s, l) => s + l.quantity * (l.estimatedUnitCost ?? 0), 0));
}

// ── Purchase orders ───────────────────────────────────────────────────────

export type PurchaseOrderStatus = 'DRAFT' | 'APPROVED' | 'SENT' | 'PARTLY_RECEIVED' | 'RECEIVED' | 'CLOSED' | 'CANCELLED';

export const PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: ['APPROVED', 'CANCELLED'],
  APPROVED: ['SENT', 'PARTLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  SENT: ['PARTLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'],
  PARTLY_RECEIVED: ['PARTLY_RECEIVED', 'RECEIVED', 'CLOSED'],
  RECEIVED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export function canMovePurchaseOrder(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return (PO_TRANSITIONS[from] ?? []).includes(to);
}

/** Statuses in which goods may still arrive against the order. */
export const RECEIVABLE_PO_STATUSES: PurchaseOrderStatus[] = ['APPROVED', 'SENT', 'PARTLY_RECEIVED'];

/** Open = still being worked: anything not closed or cancelled. */
export const OPEN_PO_STATUSES: PurchaseOrderStatus[] = ['DRAFT', 'APPROVED', 'SENT', 'PARTLY_RECEIVED', 'RECEIVED'];

export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  DRAFT: 'Awaiting approval', APPROVED: 'Approved', SENT: 'Sent to supplier', PARTLY_RECEIVED: 'Partly received', RECEIVED: 'Received', CLOSED: 'Closed', CANCELLED: 'Cancelled',
};

export const PO_STATUS_TONE: Record<PurchaseOrderStatus, ChipTone> = {
  DRAFT: 'warning', APPROVED: 'success', SENT: 'info', PARTLY_RECEIVED: 'warning', RECEIVED: 'success', CLOSED: 'neutral', CANCELLED: 'error',
};

export type PurchaseOrderLineInput = { partId?: string | null; productId?: string | null; description: string; quantity: number; unitCost: number };

/** The order total in the order's currency: Σ quantity × unit cost, to the cent. */
export function poTotal(lines: { quantity: number; unitCost: number }[]): number {
  return round2(lines.reduce((s, l) => s + round2(l.quantity * l.unitCost), 0));
}

/** The same total in naira, when the order is in another currency. */
export function poTotalInNaira(total: number, currency: string, exchangeRate: number | null | undefined): number | null {
  if (currency === 'NGN') return round2(total);
  if (!exchangeRate || exchangeRate <= 0) return null;
  return round2(total * exchangeRate);
}

export function purchaseOrderProblem(input: { supplierId: string; currency: string; exchangeRate?: number | null; lines: PurchaseOrderLineInput[] }): string | null {
  if (!input.supplierId) return 'Choose the supplier.';
  if (!/^[A-Z]{3}$/.test(input.currency)) return 'The currency must be a three-letter code, like USD or NGN.';
  if (input.currency !== 'NGN' && input.exchangeRate !== null && input.exchangeRate !== undefined && input.exchangeRate <= 0) return 'The exchange rate must be more than zero.';
  if (input.lines.length === 0) return 'Add at least one line.';
  for (const [i, l] of input.lines.entries()) {
    if (!l.description.trim() && !l.partId && !l.productId) return `Line ${i + 1}: choose a part or product, or describe the item.`;
    if (!Number.isFinite(l.quantity) || l.quantity <= 0) return `Line ${i + 1}: the quantity must be more than zero.`;
    if (!Number.isFinite(l.unitCost) || l.unitCost < 0) return `Line ${i + 1}: the unit cost cannot be negative.`;
  }
  return null;
}

/** Received against ordered, over every line. */
export function receivedVsOrdered(lines: { quantity: number; receivedQuantity: number }[]): { ordered: number; received: number; outstanding: number; state: 'NONE' | 'PARTLY_RECEIVED' | 'RECEIVED' } {
  const ordered = round3(lines.reduce((s, l) => s + l.quantity, 0));
  const received = round3(lines.reduce((s, l) => s + Math.min(l.receivedQuantity, l.quantity), 0));
  const outstanding = round3(Math.max(0, ordered - received));
  const state = ordered > 0 && outstanding === 0 ? 'RECEIVED' : received > 0 ? 'PARTLY_RECEIVED' : 'NONE';
  return { ordered, received, outstanding, state };
}

/** The order's status once a receipt lands: fully received, partly, or unchanged (nothing landed). */
export function statusAfterReceipt(current: PurchaseOrderStatus, lines: { quantity: number; receivedQuantity: number }[]): PurchaseOrderStatus {
  const { state } = receivedVsOrdered(lines);
  if (state === 'RECEIVED') return 'RECEIVED';
  if (state === 'PARTLY_RECEIVED') return 'PARTLY_RECEIVED';
  return current;
}

/** A receipt may never exceed what is still outstanding on the line. */
export function receiptQuantityProblem(line: { quantity: number; receivedQuantity: number }, quantity: number): string | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return 'Receive at least one.';
  const left = round3(line.quantity - line.receivedQuantity);
  if (quantity > left) return left <= 0 ? 'This line has been fully received.' : `Only ${left} ${left === 1 ? 'is' : 'are'} still outstanding on this line.`;
  return null;
}

// ── Shipments ─────────────────────────────────────────────────────────────

export type ShipmentStatus = 'BOOKED' | 'IN_TRANSIT' | 'ARRIVED_PORT' | 'CUSTOMS' | 'CLEARED' | 'DELIVERED';

export const SHIPMENT_STEPS: ShipmentStatus[] = ['BOOKED', 'IN_TRANSIT', 'ARRIVED_PORT', 'CUSTOMS', 'CLEARED', 'DELIVERED'];

export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  BOOKED: 'Booked', IN_TRANSIT: 'In transit', ARRIVED_PORT: 'Arrived at port', CUSTOMS: 'At customs', CLEARED: 'Cleared', DELIVERED: 'Delivered to the warehouse',
};

export const SHIPMENT_STATUS_TONE: Record<ShipmentStatus, ChipTone> = {
  BOOKED: 'neutral', IN_TRANSIT: 'info', ARRIVED_PORT: 'info', CUSTOMS: 'warning', CLEARED: 'success', DELIVERED: 'success',
};

/** The next step, or null at the end. */
export function nextShipmentStatus(current: ShipmentStatus): ShipmentStatus | null {
  const i = SHIPMENT_STEPS.indexOf(current);
  return i >= 0 && i < SHIPMENT_STEPS.length - 1 ? SHIPMENT_STEPS[i + 1]! : null;
}

export function canAdvanceShipment(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return nextShipmentStatus(from) === to;
}

/** Shipments still on their way (not yet at the warehouse). */
export const SHIPMENT_IN_FLIGHT: ShipmentStatus[] = ['BOOKED', 'IN_TRANSIT', 'ARRIVED_PORT', 'CUSTOMS', 'CLEARED'];

/** ETA passed and still on the way. */
export function shipmentOverdue(s: { status: ShipmentStatus; eta: Date | null }, now: Date = new Date()): boolean {
  return s.status !== 'DELIVERED' && s.eta !== null && s.eta.getTime() < now.getTime();
}

// ── Supplier claims ───────────────────────────────────────────────────────

export type SupplierClaimStatus = 'OPEN' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'SETTLED' | 'CLOSED';

export const CLAIM_TRANSITIONS: Record<SupplierClaimStatus, SupplierClaimStatus[]> = {
  OPEN: ['SENT', 'CLOSED'],
  SENT: ['ACCEPTED', 'REJECTED', 'CLOSED'],
  ACCEPTED: ['SETTLED', 'CLOSED'],
  REJECTED: ['CLOSED', 'SENT'],
  SETTLED: ['CLOSED'],
  CLOSED: [],
};

export function canMoveClaim(from: SupplierClaimStatus, to: SupplierClaimStatus): boolean {
  return (CLAIM_TRANSITIONS[from] ?? []).includes(to);
}

export const CLAIM_STATUS_LABEL: Record<SupplierClaimStatus, string> = {
  OPEN: 'Being prepared', SENT: 'With the supplier', ACCEPTED: 'Accepted by the supplier', REJECTED: 'Rejected by the supplier', SETTLED: 'Settled', CLOSED: 'Closed',
};

export function claimProblem(input: { supplierId: string; description: string; amount: number }): string | null {
  if (!input.supplierId) return 'Choose the supplier the claim is against.';
  if (input.description.trim().length < 5) return 'Describe what went wrong (shortage, damage, failure).';
  if (!Number.isFinite(input.amount) || input.amount < 0) return 'The amount cannot be negative.';
  return null;
}

// ── Shared ────────────────────────────────────────────────────────────────

export const CURRENCIES = ['NGN', 'USD', 'EUR', 'GBP', 'CNY'] as const;

export const INCOTERMS = ['EXW', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP'] as const;
