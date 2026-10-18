"use strict";
/**
 * Sales (order to cash) — the pure rules, with no database or framework:
 * quotation totals with VAT, the discount approval thresholds, the quotation
 * and sales order status machines, and the dealer credit check. The server
 * actions in lib/actions/sales.ts apply these; tests/sales.test.ts proves them.
 * Relative imports only (the unit tests compile this file directly).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYMENT_TERMS_LABEL = exports.PAYMENT_METHOD_LABEL = exports.TIER_LABEL = exports.CHANNEL_LABEL = exports.RETURN_RESOLUTION_LABEL = exports.RETURN_STATUS_LABEL = exports.RETURN_NEXT = exports.toKobo = exports.RETURNABLE_ORDER_STATUSES = exports.PAYABLE_ORDER_STATUSES = exports.PRO_FORMA_STATUSES = exports.CANCELLABLE_ORDER_STATUSES = exports.ORDER_STATUS_LABEL = exports.ORDER_NEXT = exports.QUOTATION_VALID_DAYS = exports.QUOTATION_STATUS_LABEL = exports.QUOTATION_NEXT = exports.round2 = exports.MANAGER_DISCOUNT_LIMIT_PERCENT = exports.OFFICER_DISCOUNT_LIMIT_PERCENT = exports.VAT_RATE_PERCENT = void 0;
exports.lineTotal = lineTotal;
exports.quotationTotals = quotationTotals;
exports.discountApproval = discountApproval;
exports.canApproveDiscount = canApproveDiscount;
exports.discountLevelLabel = discountLevelLabel;
exports.canMoveQuotation = canMoveQuotation;
exports.quotationExpired = quotationExpired;
exports.canMoveOrder = canMoveOrder;
exports.paidInFull = paidInFull;
exports.clearanceAllowed = clearanceAllowed;
exports.statusAfterClearance = statusAfterClearance;
exports.creditCheck = creditCheck;
exports.outstandingOn = outstandingOn;
exports.canMoveReturn = canMoveReturn;
exports.naira = naira;
exports.csvCell = csvCell;
exports.csvLine = csvLine;
exports.VAT_RATE_PERCENT = 7.5;
/** A sales officer may give up to this without anyone else's say. */
exports.OFFICER_DISCOUNT_LIMIT_PERCENT = 5;
/** The Sales Manager (sales.discount.approve) approves up to this. */
exports.MANAGER_DISCOUNT_LIMIT_PERCENT = 15;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
exports.round2 = round2;
/** What a line comes to after its own discount (before VAT). */
function lineTotal(line) {
    const gross = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
    return (0, exports.round2)(gross * (1 - (Number(line.discountPercent) || 0) / 100));
}
/**
 * subtotal = goods before any discount; discountTotal = what the discounts
 * took off; VAT is charged on what is actually payable; total = net + VAT.
 */
function quotationTotals(lines, taxRatePercent = exports.VAT_RATE_PERCENT) {
    const subtotal = (0, exports.round2)(lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0));
    const net = (0, exports.round2)(lines.reduce((s, l) => s + lineTotal(l), 0));
    const discountTotal = (0, exports.round2)(subtotal - net);
    const taxTotal = (0, exports.round2)(net * (Number(taxRatePercent) || 0) / 100);
    return { subtotal, discountTotal, taxTotal, total: (0, exports.round2)(net + taxTotal) };
}
/**
 * Who must approve the discounts on a quotation: nobody while every line and
 * the whole stay within the officer's 5%; the Sales Manager up to 15%; the
 * Commercial Director beyond that. The overall percentage is what the
 * discounts take off the undiscounted goods.
 */
function discountApproval(lines) {
    const maxLinePercent = (0, exports.round2)(Math.max(0, ...lines.map((l) => Number(l.discountPercent) || 0)));
    const t = quotationTotals(lines);
    const overallPercent = t.subtotal > 0 ? (0, exports.round2)((t.discountTotal / t.subtotal) * 100) : 0;
    const worst = Math.max(maxLinePercent, overallPercent);
    const level = worst <= exports.OFFICER_DISCOUNT_LIMIT_PERCENT ? 'NONE' : worst <= exports.MANAGER_DISCOUNT_LIMIT_PERCENT ? 'MANAGER' : 'DIRECTOR';
    return { level, needsApproval: level !== 'NONE', maxLinePercent, overallPercent };
}
/** Whether a person with these rights may approve a discount of this level (never the preparer — checked by the caller). */
function canApproveDiscount(level, rights) {
    if (level === 'NONE')
        return false;
    if (level === 'MANAGER')
        return rights.approve || rights.approveLarge;
    return rights.approveLarge;
}
function discountLevelLabel(level) {
    return level === 'DIRECTOR' ? 'Commercial Director' : level === 'MANAGER' ? 'Sales Manager' : 'No approval needed';
}
exports.QUOTATION_NEXT = {
    DRAFT: ['PENDING_DISCOUNT_APPROVAL', 'SENT', 'CANCELLED'],
    PENDING_DISCOUNT_APPROVAL: ['SENT', 'DRAFT', 'CANCELLED'],
    SENT: ['ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED'],
    ACCEPTED: ['CONVERTED', 'CANCELLED'],
    DECLINED: [],
    EXPIRED: [],
    CONVERTED: [],
    CANCELLED: [],
};
function canMoveQuotation(from, to) {
    return (exports.QUOTATION_NEXT[from] ?? []).includes(to);
}
exports.QUOTATION_STATUS_LABEL = {
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
function quotationExpired(validUntil, now = new Date()) {
    return Boolean(validUntil) && new Date(validUntil).getTime() < now.getTime();
}
exports.QUOTATION_VALID_DAYS = 14;
exports.ORDER_NEXT = {
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
function canMoveOrder(from, to) {
    return (exports.ORDER_NEXT[from] ?? []).includes(to);
}
exports.ORDER_STATUS_LABEL = {
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
exports.CANCELLABLE_ORDER_STATUSES = ['CONFIRMED', 'AWAITING_PAYMENT', 'PAID'];
/** A pro-forma invoice can be issued while the customer still has to pay. */
exports.PRO_FORMA_STATUSES = ['CONFIRMED', 'AWAITING_PAYMENT'];
/** Payments are recorded until the goods are invoiced. */
exports.PAYABLE_ORDER_STATUSES = ['CONFIRMED', 'AWAITING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'READY', 'RELEASED', 'DISPATCHED', 'DELIVERED'];
/** Goods have left (or are leaving) the store: a return can be requested. */
exports.RETURNABLE_ORDER_STATUSES = ['RELEASED', 'DISPATCHED', 'DELIVERED', 'INVOICED', 'CLOSED'];
/** Money is compared in whole kobo so float drift never decides "paid in full". */
const toKobo = (amount) => Math.round((Number(amount) || 0) * 100);
exports.toKobo = toKobo;
/** Paid in full, or on approved credit — the order may move to PAID. */
function paidInFull(amountPaid, total) {
    return (0, exports.toKobo)(amountPaid) >= (0, exports.toKobo)(total);
}
/** Whether Finance may clear the order for release now. */
function clearanceAllowed(o) {
    if (!['CONFIRMED', 'AWAITING_PAYMENT', 'PAID'].includes(o.status))
        return { ok: false, why: 'This order has already been cleared, or it is cancelled.' };
    if (paidInFull(o.amountPaid, o.total))
        return { ok: true, why: null };
    if (o.paymentTerms === 'CREDIT') {
        if (o.creditNeedsApproval && !o.creditApproved)
            return { ok: false, why: 'This credit sale exceeds the dealer\'s remaining credit and is waiting for Finance to approve it.' };
        return { ok: true, why: null };
    }
    return { ok: false, why: 'The customer has not paid in full yet. Confirm the payments first.' };
}
/** Where a cleared order goes: the line if anything must be assembled, otherwise ready for the store to pick. */
function statusAfterClearance(lines) {
    return lines.some((l) => l.source === 'ASSEMBLED') ? 'IN_PRODUCTION' : 'READY';
}
/**
 * A customer with a dealer account whose credit limit is above zero and that
 * is not on hold buys on credit; otherwise the order is prepaid. A credit
 * order above what remains of the limit (limit less what is still owed on
 * other open credit orders) needs Finance (finance.credit.manage) to approve it.
 */
function creditCheck(dealer, exposure, orderTotal) {
    const limit = (0, exports.round2)(dealer?.creditLimit ?? 0);
    const used = (0, exports.round2)(Math.max(0, exposure));
    if (!dealer || limit <= 0 || dealer.onHold)
        return { terms: 'PREPAID', needsApproval: false, remaining: Math.max(0, (0, exports.round2)(limit - used)), exposure: used };
    const remaining = (0, exports.round2)(limit - used);
    return { terms: 'CREDIT', needsApproval: (0, exports.toKobo)(orderTotal) > (0, exports.toKobo)(remaining), remaining, exposure: used };
}
/** What a dealer still owes on an order bought on credit. */
function outstandingOn(o) {
    if (o.paymentTerms !== 'CREDIT' || o.status === 'CANCELLED')
        return 0;
    return Math.max(0, (0, exports.round2)(o.total - o.amountPaid));
}
exports.RETURN_NEXT = {
    REQUESTED: ['APPROVED', 'REJECTED'],
    APPROVED: ['RECEIVED', 'RESOLVED'],
    REJECTED: [],
    RECEIVED: ['RESOLVED'],
    RESOLVED: [],
};
function canMoveReturn(from, to) {
    return (exports.RETURN_NEXT[from] ?? []).includes(to);
}
exports.RETURN_STATUS_LABEL = {
    REQUESTED: 'Requested',
    APPROVED: 'Approved — awaiting the unit',
    REJECTED: 'Rejected',
    RECEIVED: 'Received into quarantine',
    RESOLVED: 'Resolved',
};
exports.RETURN_RESOLUTION_LABEL = {
    REPLACE: 'Replaced',
    REFUND: 'Refunded',
    CREDIT_NOTE: 'Credit note issued',
    REPAIR: 'Repaired and returned',
};
// ── Labels shared by pages, prints and emails ────────────────────────────
exports.CHANNEL_LABEL = {
    RETAIL: 'Walk-in / showroom',
    DEALER: 'Dealer (wholesale)',
    CORPORATE: 'Corporate',
    GOVERNMENT: 'Government / tender',
    DISTRIBUTOR: 'Distributor',
    ONLINE: 'Online (Konga)',
    PROJECT: 'Project',
};
exports.TIER_LABEL = { TIER_1: 'Tier 1', TIER_2: 'Tier 2', TIER_3: 'Tier 3' };
exports.PAYMENT_METHOD_LABEL = {
    BANK_TRANSFER: 'Bank transfer',
    CASH: 'Cash',
    POS: 'POS',
    CHEQUE: 'Cheque',
    ONLINE: 'Online',
};
exports.PAYMENT_TERMS_LABEL = { PREPAID: 'Prepaid', CREDIT: 'Credit' };
/** ₦ with two decimals, for pages and prints. */
function naira(n) {
    const v = n === null || n === undefined ? 0 : Number(typeof n === 'object' ? n.toString() : n);
    return `₦${(Number.isFinite(v) ? v : 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
/** A CSV cell: quoted when it carries a comma, quote or line break. */
function csvCell(v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvLine(cells) {
    return cells.map(csvCell).join(',');
}
