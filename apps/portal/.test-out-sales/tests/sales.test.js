"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Sales rules (lib/sales-core.ts): totals with VAT, discount approval
 * thresholds, the quotation / order / return status machines, the credit
 * check and the clearance rule.
 */
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const sales_core_1 = require("../lib/sales-core");
(0, node_test_1.test)('line totals and VAT: 7.5% on what is payable after discounts', () => {
    strict_1.default.equal((0, sales_core_1.lineTotal)({ quantity: 2, unitPrice: 100000, discountPercent: 0 }), 200000);
    strict_1.default.equal((0, sales_core_1.lineTotal)({ quantity: 3, unitPrice: 1000, discountPercent: 10 }), 2700);
    const t = (0, sales_core_1.quotationTotals)([
        { quantity: 2, unitPrice: 100000, discountPercent: 0 },
        { quantity: 1, unitPrice: 50000, discountPercent: 10 },
    ]);
    strict_1.default.equal(t.subtotal, 250000);
    strict_1.default.equal(t.discountTotal, 5000);
    strict_1.default.equal(t.taxTotal, 18375); // 7.5% of 245,000
    strict_1.default.equal(t.total, 263375);
    // Rounding never drifts: 3 × ₦33.33 at 7.5%
    const r = (0, sales_core_1.quotationTotals)([{ quantity: 3, unitPrice: 33.33, discountPercent: 0 }]);
    strict_1.default.equal(r.subtotal, 99.99);
    strict_1.default.equal(r.taxTotal, 7.5);
    strict_1.default.equal(r.total, 107.49);
    strict_1.default.deepEqual((0, sales_core_1.quotationTotals)([]), { subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0 });
});
(0, node_test_1.test)('discounts: 5% is the officer\'s limit, 15% the Sales Manager\'s, beyond that the Commercial Director', () => {
    strict_1.default.equal((0, sales_core_1.discountApproval)([{ quantity: 1, unitPrice: 1000, discountPercent: 5 }]).level, 'NONE');
    strict_1.default.equal((0, sales_core_1.discountApproval)([{ quantity: 1, unitPrice: 1000, discountPercent: 5.01 }]).level, 'MANAGER');
    strict_1.default.equal((0, sales_core_1.discountApproval)([{ quantity: 1, unitPrice: 1000, discountPercent: 15 }]).level, 'MANAGER');
    strict_1.default.equal((0, sales_core_1.discountApproval)([{ quantity: 1, unitPrice: 1000, discountPercent: 15.5 }]).level, 'DIRECTOR');
    // One heavily discounted cheap line trips the line rule even when the overall discount is tiny.
    const mixed = (0, sales_core_1.discountApproval)([{ quantity: 10, unitPrice: 100000, discountPercent: 0 }, { quantity: 1, unitPrice: 1000, discountPercent: 20 }]);
    strict_1.default.equal(mixed.level, 'DIRECTOR');
    strict_1.default.ok(mixed.overallPercent < 1);
    strict_1.default.equal(mixed.maxLinePercent, 20);
    strict_1.default.equal((0, sales_core_1.discountApproval)([]).needsApproval, false);
});
(0, node_test_1.test)('who may approve which discount level', () => {
    strict_1.default.equal((0, sales_core_1.canApproveDiscount)('MANAGER', { approve: true, approveLarge: false }), true);
    strict_1.default.equal((0, sales_core_1.canApproveDiscount)('MANAGER', { approve: false, approveLarge: true }), true);
    strict_1.default.equal((0, sales_core_1.canApproveDiscount)('DIRECTOR', { approve: true, approveLarge: false }), false);
    strict_1.default.equal((0, sales_core_1.canApproveDiscount)('DIRECTOR', { approve: false, approveLarge: true }), true);
    strict_1.default.equal((0, sales_core_1.canApproveDiscount)('NONE', { approve: true, approveLarge: true }), false);
});
(0, node_test_1.test)('quotation status machine', () => {
    strict_1.default.ok((0, sales_core_1.canMoveQuotation)('DRAFT', 'SENT'));
    strict_1.default.ok((0, sales_core_1.canMoveQuotation)('DRAFT', 'PENDING_DISCOUNT_APPROVAL'));
    strict_1.default.ok((0, sales_core_1.canMoveQuotation)('PENDING_DISCOUNT_APPROVAL', 'SENT'));
    strict_1.default.ok((0, sales_core_1.canMoveQuotation)('PENDING_DISCOUNT_APPROVAL', 'DRAFT'));
    strict_1.default.ok((0, sales_core_1.canMoveQuotation)('SENT', 'ACCEPTED'));
    strict_1.default.ok((0, sales_core_1.canMoveQuotation)('ACCEPTED', 'CONVERTED'));
    strict_1.default.equal((0, sales_core_1.canMoveQuotation)('DRAFT', 'ACCEPTED'), false);
    strict_1.default.equal((0, sales_core_1.canMoveQuotation)('CONVERTED', 'CANCELLED'), false);
    strict_1.default.equal((0, sales_core_1.canMoveQuotation)('SENT', 'CONVERTED'), false);
    for (const s of Object.keys(sales_core_1.QUOTATION_NEXT))
        strict_1.default.ok(sales_core_1.QUOTATION_STATUS_LABEL[s], `label for ${s}`);
    strict_1.default.equal((0, sales_core_1.quotationExpired)(new Date(Date.now() - 1000)), true);
    strict_1.default.equal((0, sales_core_1.quotationExpired)(new Date(Date.now() + 86400000)), false);
    strict_1.default.equal((0, sales_core_1.quotationExpired)(null), false);
});
(0, node_test_1.test)('sales order status machine: confirmed → paid → cleared → released → dispatched → delivered → invoiced → closed', () => {
    const path = [['CONFIRMED', 'AWAITING_PAYMENT'], ['AWAITING_PAYMENT', 'PAID'], ['PAID', 'READY'], ['READY', 'RELEASED'], ['RELEASED', 'DISPATCHED'], ['DISPATCHED', 'DELIVERED'], ['DELIVERED', 'INVOICED'], ['INVOICED', 'CLOSED']];
    for (const [a, b] of path)
        strict_1.default.ok((0, sales_core_1.canMoveOrder)(a, b), `${a} → ${b}`);
    strict_1.default.ok((0, sales_core_1.canMoveOrder)('PAID', 'IN_PRODUCTION'));
    strict_1.default.ok((0, sales_core_1.canMoveOrder)('IN_PRODUCTION', 'READY'));
    strict_1.default.ok((0, sales_core_1.canMoveOrder)('CONFIRMED', 'CANCELLED'));
    strict_1.default.equal((0, sales_core_1.canMoveOrder)('RELEASED', 'CANCELLED'), false, 'nothing is cancelled once goods have left');
    strict_1.default.equal((0, sales_core_1.canMoveOrder)('CONFIRMED', 'RELEASED'), false, 'the warehouse never releases what Finance has not cleared');
    strict_1.default.equal((0, sales_core_1.canMoveOrder)('CLOSED', 'CONFIRMED'), false);
    for (const s of Object.keys(sales_core_1.ORDER_NEXT))
        strict_1.default.ok(sales_core_1.ORDER_STATUS_LABEL[s], `label for ${s}`);
});
(0, node_test_1.test)('paid in full is decided in kobo, never by float drift', () => {
    strict_1.default.equal((0, sales_core_1.paidInFull)(0.1 + 0.2, 0.3), true);
    strict_1.default.equal((0, sales_core_1.paidInFull)(99.99, 100), false);
    strict_1.default.equal((0, sales_core_1.paidInFull)(100, 100), true);
    strict_1.default.equal((0, sales_core_1.paidInFull)(150, 100), true);
});
(0, node_test_1.test)('clearance: paid in full, or approved credit; never a prepaid order still owing', () => {
    const base = { status: 'PAID', paymentTerms: 'PREPAID', amountPaid: 1000, total: 1000, creditApproved: false, creditNeedsApproval: false };
    strict_1.default.equal((0, sales_core_1.clearanceAllowed)(base).ok, true);
    strict_1.default.equal((0, sales_core_1.clearanceAllowed)({ ...base, status: 'AWAITING_PAYMENT', amountPaid: 500 }).ok, false);
    strict_1.default.equal((0, sales_core_1.clearanceAllowed)({ ...base, status: 'CONFIRMED', amountPaid: 0, paymentTerms: 'CREDIT' }).ok, true);
    strict_1.default.equal((0, sales_core_1.clearanceAllowed)({ ...base, status: 'CONFIRMED', amountPaid: 0, paymentTerms: 'CREDIT', creditNeedsApproval: true }).ok, false);
    strict_1.default.equal((0, sales_core_1.clearanceAllowed)({ ...base, status: 'CONFIRMED', amountPaid: 0, paymentTerms: 'CREDIT', creditNeedsApproval: true, creditApproved: true }).ok, true);
    strict_1.default.equal((0, sales_core_1.clearanceAllowed)({ ...base, status: 'READY' }).ok, false, 'already cleared');
    strict_1.default.equal((0, sales_core_1.clearanceAllowed)({ ...base, status: 'CANCELLED' }).ok, false);
});
(0, node_test_1.test)('a cleared order with anything assembled goes to the line; stock-only orders are ready to pick', () => {
    strict_1.default.equal((0, sales_core_1.statusAfterClearance)([{ source: 'FINISHED_IMPORT' }, { source: 'KIT' }]), 'READY');
    strict_1.default.equal((0, sales_core_1.statusAfterClearance)([{ source: 'FINISHED_IMPORT' }, { source: 'ASSEMBLED' }]), 'IN_PRODUCTION');
    strict_1.default.equal((0, sales_core_1.statusAfterClearance)([]), 'READY');
});
(0, node_test_1.test)('credit: a dealer with a limit buys on credit; over the remaining limit needs Finance; on hold means prepaid', () => {
    strict_1.default.deepEqual((0, sales_core_1.creditCheck)(null, 0, 500), { terms: 'PREPAID', needsApproval: false, remaining: 0, exposure: 0 });
    strict_1.default.equal((0, sales_core_1.creditCheck)({ creditLimit: 0, onHold: false }, 0, 500).terms, 'PREPAID');
    strict_1.default.equal((0, sales_core_1.creditCheck)({ creditLimit: 1000000, onHold: true }, 0, 500).terms, 'PREPAID');
    const ok = (0, sales_core_1.creditCheck)({ creditLimit: 1000000, onHold: false }, 250000, 500000);
    strict_1.default.equal(ok.terms, 'CREDIT');
    strict_1.default.equal(ok.needsApproval, false);
    strict_1.default.equal(ok.remaining, 750000);
    const over = (0, sales_core_1.creditCheck)({ creditLimit: 1000000, onHold: false }, 600000, 500000);
    strict_1.default.equal(over.terms, 'CREDIT');
    strict_1.default.equal(over.needsApproval, true);
    strict_1.default.equal(over.remaining, 400000);
    strict_1.default.equal((0, sales_core_1.outstandingOn)({ paymentTerms: 'CREDIT', status: 'RELEASED', total: 1000, amountPaid: 250 }), 750);
    strict_1.default.equal((0, sales_core_1.outstandingOn)({ paymentTerms: 'PREPAID', status: 'RELEASED', total: 1000, amountPaid: 250 }), 0);
    strict_1.default.equal((0, sales_core_1.outstandingOn)({ paymentTerms: 'CREDIT', status: 'CANCELLED', total: 1000, amountPaid: 0 }), 0);
});
(0, node_test_1.test)('returns: requested → approved → received → resolved; rejected is final', () => {
    strict_1.default.ok((0, sales_core_1.canMoveReturn)('REQUESTED', 'APPROVED'));
    strict_1.default.ok((0, sales_core_1.canMoveReturn)('REQUESTED', 'REJECTED'));
    strict_1.default.ok((0, sales_core_1.canMoveReturn)('APPROVED', 'RECEIVED'));
    strict_1.default.ok((0, sales_core_1.canMoveReturn)('RECEIVED', 'RESOLVED'));
    strict_1.default.equal((0, sales_core_1.canMoveReturn)('REJECTED', 'APPROVED'), false);
    strict_1.default.equal((0, sales_core_1.canMoveReturn)('REQUESTED', 'RECEIVED'), false);
    for (const s of Object.keys(sales_core_1.RETURN_NEXT))
        strict_1.default.ok(sales_core_1.RETURN_STATUS_LABEL[s], `label for ${s}`);
});
(0, node_test_1.test)('formatting: naira and CSV cells', () => {
    strict_1.default.equal((0, sales_core_1.naira)(1234.5), '₦1,234.50');
    strict_1.default.equal((0, sales_core_1.naira)(null), '₦0.00');
    strict_1.default.equal((0, sales_core_1.naira)({ toString: () => '99.999' }), '₦100.00');
    strict_1.default.equal((0, sales_core_1.csvLine)(['SO-2026-000001', 'Ade, Bola', 'He said "hi"', 1500]), 'SO-2026-000001,"Ade, Bola","He said ""hi""",1500');
});
