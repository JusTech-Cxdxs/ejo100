/**
 * Procurement rules (lib/procurement-core.ts): requisition, purchase order,
 * shipment and claim machines, order totals and received-against-ordered.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canMoveRequisition, requisitionProblem, requisitionEstimate, REQUISITION_STATUS_LABEL,
  canMovePurchaseOrder, poTotal, poTotalInNaira, purchaseOrderProblem, receivedVsOrdered, statusAfterReceipt, receiptQuantityProblem, PO_STATUS_LABEL, PO_STATUS_TONE, RECEIVABLE_PO_STATUSES, OPEN_PO_STATUSES,
  SHIPMENT_STEPS, nextShipmentStatus, canAdvanceShipment, shipmentOverdue, SHIPMENT_STATUS_LABEL, SHIPMENT_STATUS_TONE,
  canMoveClaim, claimProblem, CLAIM_STATUS_LABEL, CURRENCIES, INCOTERMS,
} from '../lib/procurement-core';

test('a requisition goes draft → submitted → approved → ordered; the rejected one can be redrafted', () => {
  assert.ok(canMoveRequisition('DRAFT', 'SUBMITTED'));
  assert.ok(canMoveRequisition('SUBMITTED', 'APPROVED'));
  assert.ok(canMoveRequisition('SUBMITTED', 'REJECTED'));
  assert.ok(canMoveRequisition('APPROVED', 'ORDERED'));
  assert.ok(canMoveRequisition('REJECTED', 'DRAFT'));
  assert.ok(!canMoveRequisition('DRAFT', 'APPROVED'), 'nothing is approved before it is submitted');
  assert.ok(!canMoveRequisition('ORDERED', 'CANCELLED'));
  for (const s of Object.keys(REQUISITION_STATUS_LABEL)) assert.ok(REQUISITION_STATUS_LABEL[s as keyof typeof REQUISITION_STATUS_LABEL].length > 2);
});

test('a requisition needs a reason and at least one sensible line', () => {
  assert.match(requisitionProblem({ reason: ' ', lines: [{ description: 'x', quantity: 1 }] }) ?? '', /why/);
  assert.match(requisitionProblem({ reason: 'BOM shortage', lines: [] }) ?? '', /at least one line/);
  assert.match(requisitionProblem({ reason: 'BOM shortage', lines: [{ description: '', quantity: 1 }] }) ?? '', /Line 1: choose a part/);
  assert.match(requisitionProblem({ reason: 'BOM shortage', lines: [{ partId: 'p', description: '', quantity: 0 }] }) ?? '', /more than zero/);
  assert.match(requisitionProblem({ reason: 'BOM shortage', lines: [{ partId: 'p', description: '', quantity: 2, estimatedUnitCost: -1 }] }) ?? '', /negative/);
  assert.equal(requisitionProblem({ reason: 'BOM shortage', lines: [{ partId: 'p', description: '', quantity: 2, estimatedUnitCost: 10 }] }), null);
  assert.equal(requisitionEstimate([{ quantity: 2, estimatedUnitCost: 10.555 }, { quantity: 1, estimatedUnitCost: null }]), 21.11);
});

test('a purchase order is approved before it is sent, received in parts, then closed; a draft can still be cancelled', () => {
  assert.ok(canMovePurchaseOrder('DRAFT', 'APPROVED'));
  assert.ok(canMovePurchaseOrder('APPROVED', 'SENT'));
  assert.ok(canMovePurchaseOrder('SENT', 'PARTLY_RECEIVED'));
  assert.ok(canMovePurchaseOrder('PARTLY_RECEIVED', 'RECEIVED'));
  assert.ok(canMovePurchaseOrder('RECEIVED', 'CLOSED'));
  assert.ok(canMovePurchaseOrder('DRAFT', 'CANCELLED'));
  assert.ok(!canMovePurchaseOrder('DRAFT', 'SENT'), 'never sent unapproved');
  assert.ok(!canMovePurchaseOrder('RECEIVED', 'CANCELLED'), 'received goods cannot be cancelled away');
  assert.ok(!canMovePurchaseOrder('CLOSED', 'SENT'));
  assert.deepEqual(RECEIVABLE_PO_STATUSES, ['APPROVED', 'SENT', 'PARTLY_RECEIVED']);
  assert.ok(!OPEN_PO_STATUSES.includes('CLOSED') && !OPEN_PO_STATUSES.includes('CANCELLED'));
  for (const s of Object.keys(PO_STATUS_LABEL)) assert.ok(PO_STATUS_TONE[s as keyof typeof PO_STATUS_TONE]);
});

test('the order total is Σ quantity × unit cost to the cent, and converts with the exchange rate', () => {
  assert.equal(poTotal([{ quantity: 3, unitCost: 199.99 }, { quantity: 0.5, unitCost: 10 }]), 604.97);
  assert.equal(poTotal([]), 0);
  assert.equal(poTotal([{ quantity: 3, unitCost: 0.335 }]), 1.01, 'each line is rounded to the cent before summing');
  assert.equal(poTotalInNaira(100, 'USD', 1550.5), 155050);
  assert.equal(poTotalInNaira(100, 'USD', null), null);
  assert.equal(poTotalInNaira(100, 'NGN', null), 100);
});

test('a purchase order needs a supplier, a currency code, a positive rate and valid lines', () => {
  const ok = { supplierId: 's', currency: 'USD', exchangeRate: 1500, lines: [{ productId: 'p', description: '', quantity: 10, unitCost: 250 }] };
  assert.equal(purchaseOrderProblem(ok), null);
  assert.match(purchaseOrderProblem({ ...ok, supplierId: '' }) ?? '', /supplier/);
  assert.match(purchaseOrderProblem({ ...ok, currency: 'dollars' }) ?? '', /three-letter/);
  assert.match(purchaseOrderProblem({ ...ok, exchangeRate: 0 }) ?? '', /exchange rate/);
  assert.equal(purchaseOrderProblem({ ...ok, currency: 'NGN', exchangeRate: 0 }), null, 'no rate needed in naira');
  assert.match(purchaseOrderProblem({ ...ok, lines: [] }) ?? '', /at least one line/);
  assert.match(purchaseOrderProblem({ ...ok, lines: [{ description: '', quantity: 1, unitCost: 1 }] }) ?? '', /Line 1/);
  assert.match(purchaseOrderProblem({ ...ok, lines: [{ description: 'Casing', quantity: 1, unitCost: -1 }] }) ?? '', /negative/);
});

test('received against ordered: nothing, partly, fully — over-receipts never count beyond the line', () => {
  assert.deepEqual(receivedVsOrdered([{ quantity: 10, receivedQuantity: 0 }]), { ordered: 10, received: 0, outstanding: 10, state: 'NONE' });
  assert.deepEqual(receivedVsOrdered([{ quantity: 10, receivedQuantity: 4 }, { quantity: 5, receivedQuantity: 5 }]), { ordered: 15, received: 9, outstanding: 6, state: 'PARTLY_RECEIVED' });
  assert.deepEqual(receivedVsOrdered([{ quantity: 10, receivedQuantity: 12 }]), { ordered: 10, received: 10, outstanding: 0, state: 'RECEIVED' });
  assert.equal(statusAfterReceipt('SENT', [{ quantity: 10, receivedQuantity: 4 }]), 'PARTLY_RECEIVED');
  assert.equal(statusAfterReceipt('SENT', [{ quantity: 10, receivedQuantity: 10 }]), 'RECEIVED');
  assert.equal(statusAfterReceipt('SENT', [{ quantity: 10, receivedQuantity: 0 }]), 'SENT');
  assert.equal(receiptQuantityProblem({ quantity: 10, receivedQuantity: 8 }, 2), null);
  assert.match(receiptQuantityProblem({ quantity: 10, receivedQuantity: 8 }, 3) ?? '', /Only 2 are still outstanding/);
  assert.match(receiptQuantityProblem({ quantity: 10, receivedQuantity: 10 }, 1) ?? '', /fully received/);
  assert.match(receiptQuantityProblem({ quantity: 10, receivedQuantity: 0 }, 0) ?? '', /at least one/);
});

test('a shipment moves one step at a time: booked → in transit → at port → customs → cleared → delivered', () => {
  assert.deepEqual(SHIPMENT_STEPS, ['BOOKED', 'IN_TRANSIT', 'ARRIVED_PORT', 'CUSTOMS', 'CLEARED', 'DELIVERED']);
  assert.equal(nextShipmentStatus('BOOKED'), 'IN_TRANSIT');
  assert.equal(nextShipmentStatus('CLEARED'), 'DELIVERED');
  assert.equal(nextShipmentStatus('DELIVERED'), null);
  assert.ok(canAdvanceShipment('CUSTOMS', 'CLEARED'));
  assert.ok(!canAdvanceShipment('BOOKED', 'CLEARED'), 'no skipping customs');
  assert.ok(!canAdvanceShipment('DELIVERED', 'BOOKED'));
  for (const s of SHIPMENT_STEPS) { assert.ok(SHIPMENT_STATUS_LABEL[s]); assert.ok(SHIPMENT_STATUS_TONE[s]); }
  const now = new Date('2026-10-18T10:00:00Z');
  assert.equal(shipmentOverdue({ status: 'IN_TRANSIT', eta: new Date('2026-10-10T00:00:00Z') }, now), true);
  assert.equal(shipmentOverdue({ status: 'DELIVERED', eta: new Date('2026-10-10T00:00:00Z') }, now), false);
  assert.equal(shipmentOverdue({ status: 'IN_TRANSIT', eta: null }, now), false);
});

test('a supplier claim: open → sent → accepted → settled → closed; a rejected claim can be re-sent', () => {
  assert.ok(canMoveClaim('OPEN', 'SENT'));
  assert.ok(canMoveClaim('SENT', 'ACCEPTED'));
  assert.ok(canMoveClaim('ACCEPTED', 'SETTLED'));
  assert.ok(canMoveClaim('SETTLED', 'CLOSED'));
  assert.ok(canMoveClaim('REJECTED', 'SENT'));
  assert.ok(!canMoveClaim('OPEN', 'SETTLED'), 'nothing is settled before the supplier accepts');
  assert.ok(!canMoveClaim('CLOSED', 'SENT'));
  for (const s of Object.keys(CLAIM_STATUS_LABEL)) assert.ok(CLAIM_STATUS_LABEL[s as keyof typeof CLAIM_STATUS_LABEL].length > 2);
  assert.equal(claimProblem({ supplierId: 's', description: 'Three monitors arrived cracked', amount: 450 }), null);
  assert.match(claimProblem({ supplierId: '', description: 'Three monitors arrived cracked', amount: 450 }) ?? '', /supplier/);
  assert.match(claimProblem({ supplierId: 's', description: 'bad', amount: 450 }) ?? '', /Describe/);
  assert.match(claimProblem({ supplierId: 's', description: 'Three monitors arrived cracked', amount: -1 }) ?? '', /negative/);
});

test('currencies and incoterms are three-letter codes', () => {
  for (const c of CURRENCIES) assert.match(c, /^[A-Z]{3}$/);
  for (const i of INCOTERMS) assert.match(i, /^[A-Z]{3}$/);
});
