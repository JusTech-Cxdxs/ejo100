/**
 * Sales rules (lib/sales-core.ts): totals with VAT, discount approval
 * thresholds, the quotation / order / return status machines, the credit
 * check and the clearance rule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lineTotal, quotationTotals, discountApproval, canApproveDiscount, canMoveQuotation, canMoveOrder, canMoveReturn,
  creditCheck, clearanceAllowed, statusAfterClearance, paidInFull, outstandingOn, quotationExpired, csvLine, naira,
  QUOTATION_STATUS_LABEL, ORDER_STATUS_LABEL, RETURN_STATUS_LABEL, QUOTATION_NEXT, ORDER_NEXT, RETURN_NEXT,
} from '../lib/sales-core';

test('line totals and VAT: 7.5% on what is payable after discounts', () => {
  assert.equal(lineTotal({ quantity: 2, unitPrice: 100000, discountPercent: 0 }), 200000);
  assert.equal(lineTotal({ quantity: 3, unitPrice: 1000, discountPercent: 10 }), 2700);
  const t = quotationTotals([
    { quantity: 2, unitPrice: 100000, discountPercent: 0 },
    { quantity: 1, unitPrice: 50000, discountPercent: 10 },
  ]);
  assert.equal(t.subtotal, 250000);
  assert.equal(t.discountTotal, 5000);
  assert.equal(t.taxTotal, 18375); // 7.5% of 245,000
  assert.equal(t.total, 263375);
  // Rounding never drifts: 3 × ₦33.33 at 7.5%
  const r = quotationTotals([{ quantity: 3, unitPrice: 33.33, discountPercent: 0 }]);
  assert.equal(r.subtotal, 99.99);
  assert.equal(r.taxTotal, 7.5);
  assert.equal(r.total, 107.49);
  assert.deepEqual(quotationTotals([]), { subtotal: 0, discountTotal: 0, taxTotal: 0, total: 0 });
});

test('discounts: 5% is the officer\'s limit, 15% the Sales Manager\'s, beyond that the Commercial Director', () => {
  assert.equal(discountApproval([{ quantity: 1, unitPrice: 1000, discountPercent: 5 }]).level, 'NONE');
  assert.equal(discountApproval([{ quantity: 1, unitPrice: 1000, discountPercent: 5.01 }]).level, 'MANAGER');
  assert.equal(discountApproval([{ quantity: 1, unitPrice: 1000, discountPercent: 15 }]).level, 'MANAGER');
  assert.equal(discountApproval([{ quantity: 1, unitPrice: 1000, discountPercent: 15.5 }]).level, 'DIRECTOR');
  // One heavily discounted cheap line trips the line rule even when the overall discount is tiny.
  const mixed = discountApproval([{ quantity: 10, unitPrice: 100000, discountPercent: 0 }, { quantity: 1, unitPrice: 1000, discountPercent: 20 }]);
  assert.equal(mixed.level, 'DIRECTOR');
  assert.ok(mixed.overallPercent < 1);
  assert.equal(mixed.maxLinePercent, 20);
  assert.equal(discountApproval([]).needsApproval, false);
});

test('who may approve which discount level', () => {
  assert.equal(canApproveDiscount('MANAGER', { approve: true, approveLarge: false }), true);
  assert.equal(canApproveDiscount('MANAGER', { approve: false, approveLarge: true }), true);
  assert.equal(canApproveDiscount('DIRECTOR', { approve: true, approveLarge: false }), false);
  assert.equal(canApproveDiscount('DIRECTOR', { approve: false, approveLarge: true }), true);
  assert.equal(canApproveDiscount('NONE', { approve: true, approveLarge: true }), false);
});

test('quotation status machine', () => {
  assert.ok(canMoveQuotation('DRAFT', 'SENT'));
  assert.ok(canMoveQuotation('DRAFT', 'PENDING_DISCOUNT_APPROVAL'));
  assert.ok(canMoveQuotation('PENDING_DISCOUNT_APPROVAL', 'SENT'));
  assert.ok(canMoveQuotation('PENDING_DISCOUNT_APPROVAL', 'DRAFT'));
  assert.ok(canMoveQuotation('SENT', 'ACCEPTED'));
  assert.ok(canMoveQuotation('ACCEPTED', 'CONVERTED'));
  assert.equal(canMoveQuotation('DRAFT', 'ACCEPTED'), false);
  assert.equal(canMoveQuotation('CONVERTED', 'CANCELLED'), false);
  assert.equal(canMoveQuotation('SENT', 'CONVERTED'), false);
  for (const s of Object.keys(QUOTATION_NEXT)) assert.ok(QUOTATION_STATUS_LABEL[s as keyof typeof QUOTATION_STATUS_LABEL], `label for ${s}`);
  assert.equal(quotationExpired(new Date(Date.now() - 1000)), true);
  assert.equal(quotationExpired(new Date(Date.now() + 86400000)), false);
  assert.equal(quotationExpired(null), false);
});

test('sales order status machine: confirmed → paid → cleared → released → dispatched → delivered → invoiced → closed', () => {
  const path: [string, string][] = [['CONFIRMED', 'AWAITING_PAYMENT'], ['AWAITING_PAYMENT', 'PAID'], ['PAID', 'READY'], ['READY', 'RELEASED'], ['RELEASED', 'DISPATCHED'], ['DISPATCHED', 'DELIVERED'], ['DELIVERED', 'INVOICED'], ['INVOICED', 'CLOSED']];
  for (const [a, b] of path) assert.ok(canMoveOrder(a as never, b as never), `${a} → ${b}`);
  assert.ok(canMoveOrder('PAID', 'IN_PRODUCTION'));
  assert.ok(canMoveOrder('IN_PRODUCTION', 'READY'));
  assert.ok(canMoveOrder('CONFIRMED', 'CANCELLED'));
  assert.equal(canMoveOrder('RELEASED', 'CANCELLED'), false, 'nothing is cancelled once goods have left');
  assert.equal(canMoveOrder('CONFIRMED', 'RELEASED'), false, 'the warehouse never releases what Finance has not cleared');
  assert.equal(canMoveOrder('CLOSED', 'CONFIRMED'), false);
  for (const s of Object.keys(ORDER_NEXT)) assert.ok(ORDER_STATUS_LABEL[s as keyof typeof ORDER_STATUS_LABEL], `label for ${s}`);
});

test('paid in full is decided in kobo, never by float drift', () => {
  assert.equal(paidInFull(0.1 + 0.2, 0.3), true);
  assert.equal(paidInFull(99.99, 100), false);
  assert.equal(paidInFull(100, 100), true);
  assert.equal(paidInFull(150, 100), true);
});

test('clearance: paid in full, or approved credit; never a prepaid order still owing', () => {
  const base = { status: 'PAID' as const, paymentTerms: 'PREPAID' as const, amountPaid: 1000, total: 1000, creditApproved: false, creditNeedsApproval: false };
  assert.equal(clearanceAllowed(base).ok, true);
  assert.equal(clearanceAllowed({ ...base, status: 'AWAITING_PAYMENT', amountPaid: 500 }).ok, false);
  assert.equal(clearanceAllowed({ ...base, status: 'CONFIRMED', amountPaid: 0, paymentTerms: 'CREDIT' }).ok, true);
  assert.equal(clearanceAllowed({ ...base, status: 'CONFIRMED', amountPaid: 0, paymentTerms: 'CREDIT', creditNeedsApproval: true }).ok, false);
  assert.equal(clearanceAllowed({ ...base, status: 'CONFIRMED', amountPaid: 0, paymentTerms: 'CREDIT', creditNeedsApproval: true, creditApproved: true }).ok, true);
  assert.equal(clearanceAllowed({ ...base, status: 'READY' }).ok, false, 'already cleared');
  assert.equal(clearanceAllowed({ ...base, status: 'CANCELLED' }).ok, false);
});

test('a cleared order with anything assembled goes to the line; stock-only orders are ready to pick', () => {
  assert.equal(statusAfterClearance([{ source: 'FINISHED_IMPORT' }, { source: 'KIT' }]), 'READY');
  assert.equal(statusAfterClearance([{ source: 'FINISHED_IMPORT' }, { source: 'ASSEMBLED' }]), 'IN_PRODUCTION');
  assert.equal(statusAfterClearance([]), 'READY');
});

test('credit: a dealer with a limit buys on credit; over the remaining limit needs Finance; on hold means prepaid', () => {
  assert.deepEqual(creditCheck(null, 0, 500), { terms: 'PREPAID', needsApproval: false, remaining: 0, exposure: 0 });
  assert.equal(creditCheck({ creditLimit: 0, onHold: false }, 0, 500).terms, 'PREPAID');
  assert.equal(creditCheck({ creditLimit: 1000000, onHold: true }, 0, 500).terms, 'PREPAID');
  const ok = creditCheck({ creditLimit: 1000000, onHold: false }, 250000, 500000);
  assert.equal(ok.terms, 'CREDIT');
  assert.equal(ok.needsApproval, false);
  assert.equal(ok.remaining, 750000);
  const over = creditCheck({ creditLimit: 1000000, onHold: false }, 600000, 500000);
  assert.equal(over.terms, 'CREDIT');
  assert.equal(over.needsApproval, true);
  assert.equal(over.remaining, 400000);
  assert.equal(outstandingOn({ paymentTerms: 'CREDIT', status: 'RELEASED', total: 1000, amountPaid: 250 }), 750);
  assert.equal(outstandingOn({ paymentTerms: 'PREPAID', status: 'RELEASED', total: 1000, amountPaid: 250 }), 0);
  assert.equal(outstandingOn({ paymentTerms: 'CREDIT', status: 'CANCELLED', total: 1000, amountPaid: 0 }), 0);
});

test('returns: requested → approved → received → resolved; rejected is final', () => {
  assert.ok(canMoveReturn('REQUESTED', 'APPROVED'));
  assert.ok(canMoveReturn('REQUESTED', 'REJECTED'));
  assert.ok(canMoveReturn('APPROVED', 'RECEIVED'));
  assert.ok(canMoveReturn('RECEIVED', 'RESOLVED'));
  assert.equal(canMoveReturn('REJECTED', 'APPROVED'), false);
  assert.equal(canMoveReturn('REQUESTED', 'RECEIVED'), false);
  for (const s of Object.keys(RETURN_NEXT)) assert.ok(RETURN_STATUS_LABEL[s as keyof typeof RETURN_STATUS_LABEL], `label for ${s}`);
});

test('formatting: naira and CSV cells', () => {
  assert.equal(naira(1234.5), '₦1,234.50');
  assert.equal(naira(null), '₦0.00');
  assert.equal(naira({ toString: () => '99.999' }), '₦100.00');
  assert.equal(csvLine(['SO-2026-000001', 'Ade, Bola', 'He said "hi"', 1500]), 'SO-2026-000001,"Ade, Bola","He said ""hi""",1500');
});
