/**
 * Sales (order to cash) — the pure rules, with no database or framework:
 * quotation totals with VAT, the discount approval thresholds, the quotation
 * and sales order status machines, and the dealer credit check. The server
 * actions in lib/actions/sales.ts apply these; tests/sales.test.ts proves them.
 * Relative imports only (the unit tests compile this file directly).
 */

export const VAT_RATE_PERCENT = 7.5;

/** A sales officer may give up to this without anyone else's say. */
export const OFFICER_DISCOUNT_LIMIT_PERCENT = 5;
/** The Sales Manager (sales.discount.approve) approves up to this. */
export const MANAGER_DISCOUNT_LIMIT_PERCENT = 15;

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export type LineInput = { quantity: number; unitPrice: number; discountPercent: number };

/** What a line comes to after its own discount (before VAT). */
export function lineTotal(line: LineInput): number {
  const gross = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
  return round2(gross * (1 - (Number(line.discountPercent) || 0) / 100));
}

export type Totals = { subtotal: number; discountTotal: number; taxTotal: number; total: number };

/**
 * subtotal = goods before any discount; discountTotal = what the discounts
 * took off; VAT is charged on what is actually payable; total = net + VAT.
 */
export function quotationTotals(lines: LineInput[], taxRatePercent: number = VAT_RATE_PERCENT): Totals {
  const subtotal = round2(lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0));
  const net = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
  const discountTotal = round2(subtotal - net);
  const taxTotal = round2(net * (Number(taxRatePercent) || 0) / 100);
  return { subtotal, discountTotal, taxTotal, total: round2(net + taxTotal) };
}

export type DiscountLevel = 'NONE' | 'MANAGER' | 'DIRECTOR';

/**
 * Who must approve the discounts on a quotation: nobody while every line and
 * the whole stay within the officer's 5%; the Sales Manager up to 15%; the
 * Commercial Director beyond that. The overall percentage is what the
 * discounts take off the undiscounted goods.
 */
export function discountApproval(lines: LineInput[]): { level: DiscountLevel; needsApproval: boolean; maxLinePercent: number; overallPercent: number } {
  const maxLinePercent = round2(Math.max(0, ...lines.map((l) => Number(l.discountPercent) || 0)));
  const t = quotationTotals(lines);
  const overallPercent = t.subtotal > 0 ? round2((t.discountTotal / t.subtotal) * 100) : 0;
  const worst = Math.max(maxLinePercent, overallPercent);
  const level: DiscountLevel = worst <= OFFICER_DISCOUNT_LIMIT_PERCENT ? 'NONE' : worst <= MANAGER_DISCOUNT_LIMIT_PERCENT ? 'MANAGER' : 'DIRECTOR';
  return { level, needsApproval: level !== 'NONE', maxLinePercent, overallPercent };
}

/** Whether a person with these rights may approve a discount of this level (never the preparer — checked by the caller). */
export function canApproveDiscount(level: DiscountLevel, rights: { approve: boolean; approveLarge: boolean }): boolean {
  if (level === 'NONE') return false;
  if (level === 'MANAGER') return rights.approve || rights.approveLarge;
  return rights.approveLarge;
}

export function discountLevelLabel(level: DiscountLevel): string {
  return level === 'DIRECTOR' ? 'Commercial Director' : level === 'MANAGER' ? 'Sales Manager' : 'No approval needed';
}

// ── Quotation status machine ─────────────────────────────────────────────

export type QuotationStatus = 'DRAFT' | 'PENDING_DISCOUNT_APPROVAL' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CONVERTED' | 'CANCELLED';

export const QUOTATION_NEXT: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT: ['PENDING_DISCOUNT_APPROVAL', 'SENT', 'CANCELLED'],
  PENDING_DISCOUNT_APPROVAL: ['SENT', 'DRAFT', 'CANCELLED'],
  SENT: ['ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'],
  ACCEPTED: ['CONVERTED', 'CANCELLED'],
  DECLINED: [],
  EXPIRED: [],
  CONVERTED: [],
  CANCELLED: [],
};

export function canMoveQuotation(from: QuotationStatus, to: QuotationStatus): boolean {
  return (QUOTATION_NEXT[from] ?? []).includes(to);
}

export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  DRAFT: 'Draft',
  PENDING_DISCOUNT_APPROVAL: 'Discount awaiting approval',
  SENT: 'Sent to customer',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  CONVERTED: 'Converted to order',
  CANCELLED: 'Cancelled',
};

/** A quotation past its valid-until date is no longer open to accept. */
export function quotationExpired(validUntil: Date | null | undefined, now: Date = new Date()): boolean {
  return Boolean(validUntil) && new Date(validUntil as Date).getTime() < now.getTime();
}

export const QUOTATION_VALID_DAYS = 14;

// ── Sales order status machine ───────────────────────────────────────────

export type OrderStatus = 'CONFIRMED' | 'AWAITING_PAYMENT' | 'PAID' | 'IN_PRODUCTION' | 'READY' | 'RELEASED' | 'DISPATCHED' | 'DELIVERED' | 'INVOICED' | 'CLOSED' | 'CANCELLED';
export type PaymentTerms = 'PREPAID' | 'CREDIT';

export const ORDER_NEXT: Record<OrderStatus, OrderStatus[]> = {
  CONFIRMED: ['AWAITING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'READY', 'CANCELLED'],
  AWAITING_PAYMENT: ['PAID', 'IN_PRODUCTION', 'READY', 'CANCELLED'],
  PAID: ['IN_PRODUCTION', 'READY', 'CANCELLED'],
  IN_PRODUCTION: ['READY', 'RELEASED'],
  READY: ['RELEASED'],
  RELEASED: ['DISPATCHED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: ['INVOICED'],
  INVOICED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export function canMoveOrder(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_NEXT[from] ?? []).includes(to);
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  CONFIRMED: 'Confirmed',
  AWAITING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  IN_PRODUCTION: 'In production',
  READY: 'Ready for release',
  RELEASED: 'Released',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  INVOICED: 'Invoiced',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

/** Statuses before anything has left the store: an order can still be cancelled. */
export const CANCELLABLE_ORDER_STATUSES: OrderStatus[] = ['CONFIRMED', 'AWAITING_PAYMENT', 'PAID'];
/** A pro-forma invoice can be issued while the customer still has to pay. */
export const PRO_FORMA_STATUSES: OrderStatus[] = ['CONFIRMED', 'AWAITING_PAYMENT'];
/** Payments are recorded until the goods are invoiced. */
export const PAYABLE_ORDER_STATUSES: OrderStatus[] = ['CONFIRMED', 'AWAITING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'READY', 'RELEASED', 'DISPATCHED', 'DELIVERED'];
/** Goods have left (or are leaving) the store: a return can be requested. */
export const RETURNABLE_ORDER_STATUSES: OrderStatus[] = ['RELEASED', 'DISPATCHED', 'DELIVERED', 'INVOICED', 'CLOSED'];

/** Money is compared in whole kobo so float drift never decides "paid in full". */
export const toKobo = (amount: number): number => Math.round((Number(amount) || 0) * 100);

/** Paid in full, or on approved credit — the order may move to PAID. */
export function paidInFull(amountPaid: number, total: number): boolean {
  return toKobo(amountPaid) >= toKobo(total);
}

/** Whether Finance may clear the order for release now. */
export function clearanceAllowed(o: { status: OrderStatus; paymentTerms: PaymentTerms; amountPaid: number; total: number; creditApproved: boolean; creditNeedsApproval: boolean }): { ok: boolean; why: string | null } {
  if (!['CONFIRMED', 'AWAITING_PAYMENT', 'PAID'].includes(o.status)) return { ok: false, why: 'This order has already been cleared, or it is cancelled.' };
  if (paidInFull(o.amountPaid, o.total)) return { ok: true, why: null };
  if (o.paymentTerms === 'CREDIT') {
    if (o.creditNeedsApproval && !o.creditApproved) return { ok: false, why: 'This credit sale exceeds the dealer\'s remaining credit and is waiting for Finance to approve it.' };
    return { ok: true, why: null };
  }
  return { ok: false, why: 'The customer has not paid in full yet. Confirm the payments first.' };
}

/** Where a cleared order goes: the line if anything must be assembled, otherwise ready for the store to pick. */
export function statusAfterClearance(lines: { source: 'ASSEMBLED' | 'FINISHED_IMPORT' | 'KIT' }[]): 'IN_PRODUCTION' | 'READY' {
  return lines.some((l) => l.source === 'ASSEMBLED') ? 'IN_PRODUCTION' : 'READY';
}

// ── Credit ───────────────────────────────────────────────────────────────

export type CreditCheck = { terms: PaymentTerms; needsApproval: boolean; remaining: number; exposure: number };

/**
 * A customer with a dealer account whose credit limit is above zero and that
 * is not on hold buys on credit; otherwise the order is prepaid. A credit
 * order above what remains of the limit (limit less what is still owed on
 * other open credit orders) needs Finance (finance.credit.manage) to approve it.
 */
export function creditCheck(dealer: { creditLimit: number; onHold: boolean } | null | undefined, exposure: number, orderTotal: number): CreditCheck {
  const limit = round2(dealer?.creditLimit ?? 0);
  const used = round2(Math.max(0, exposure));
  if (!dealer || limit <= 0 || dealer.onHold) return { terms: 'PREPAID', needsApproval: false, remaining: Math.max(0, round2(limit - used)), exposure: used };
  const remaining = round2(limit - used);
  return { terms: 'CREDIT', needsApproval: toKobo(orderTotal) > toKobo(remaining), remaining, exposure: used };
}

/** What a dealer still owes on an order bought on credit. */
export function outstandingOn(o: { paymentTerms: PaymentTerms; status: OrderStatus; total: number; amountPaid: number }): number {
  if (o.paymentTerms !== 'CREDIT' || o.status === 'CANCELLED') return 0;
  return Math.max(0, round2(o.total - o.amountPaid));
}

// ── Returns ──────────────────────────────────────────────────────────────

export type ReturnStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'RESOLVED';

export const RETURN_NEXT: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['RECEIVED', 'RESOLVED'],
  REJECTED: [],
  RECEIVED: ['RESOLVED'],
  RESOLVED: [],
};

export function canMoveReturn(from: ReturnStatus, to: ReturnStatus): boolean {
  return (RETURN_NEXT[from] ?? []).includes(to);
}

export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved — awaiting the unit',
  REJECTED: 'Rejected',
  RECEIVED: 'Received into quarantine',
  RESOLVED: 'Resolved',
};

export const RETURN_RESOLUTION_LABEL: Record<string, string> = {
  REPLACE: 'Replaced',
  REFUND: 'Refunded',
  CREDIT_NOTE: 'Credit note issued',
  REPAIR: 'Repaired and returned',
};

// ── Labels shared by pages, prints and emails ────────────────────────────

export const CHANNEL_LABEL: Record<string, string> = {
  RETAIL: 'Walk-in / showroom',
  DEALER: 'Dealer (wholesale)',
  CORPORATE: 'Corporate',
  GOVERNMENT: 'Government / tender',
  DISTRIBUTOR: 'Distributor',
  ONLINE: 'Online (Konga)',
  PROJECT: 'Project',
};

export const TIER_LABEL: Record<string, string> = { TIER_1: 'Tier 1', TIER_2: 'Tier 2', TIER_3: 'Tier 3' };

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: 'Bank transfer',
  CASH: 'Cash',
  POS: 'POS',
  CHEQUE: 'Cheque',
  ONLINE: 'Online',
};

export const PAYMENT_TERMS_LABEL: Record<PaymentTerms, string> = { PREPAID: 'Prepaid', CREDIT: 'Credit' };

/** ₦ with two decimals, for pages and prints. */
export function naira(n: number | string | { toString(): string } | null | undefined): string {
  const v = n === null || n === undefined ? 0 : Number(typeof n === 'object' ? n.toString() : n);
  return `₦${(Number.isFinite(v) ? v : 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A CSV cell: quoted when it carries a comma, quote or line break. */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}
