'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createSupplier, updateSupplier, createRequisition, submitRequisition, approveRequisition, rejectRequisition, reopenRequisition, cancelRequisition,
  createPurchaseOrder, approvePurchaseOrder, markPurchaseOrderSent, closePurchaseOrder, cancelPurchaseOrder, addShipment, advanceShipment,
  createSupplierClaim, sendSupplierClaim, decideSupplierClaim, settleSupplierClaim, closeSupplierClaim, type SupplierInput,
} from './procurement';

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function num(formData: FormData, key: string): number {
  const n = Number(str(formData, key).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function optNum(formData: FormData, key: string): number | null {
  const s = str(formData, key).replace(/,/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function date(formData: FormData, key: string): Date | null {
  const s = str(formData, key);
  if (!s) return null;
  const d = new Date(s.length <= 10 ? `${s}T12:00:00+01:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** Line rows come as line_<i>_<field>, as many as the editor added (gaps allowed). */
function lines(formData: FormData): { partId?: string; productId?: string; description: string; quantity: number; unitCost: number; estimatedUnitCost: number | null }[] {
  const out: { partId?: string; productId?: string; description: string; quantity: number; unitCost: number; estimatedUnitCost: number | null }[] = [];
  for (let i = 0; i < 40; i++) {
    if (!formData.has(`line_${i}_quantity`) && !formData.has(`line_${i}_description`)) continue;
    const kind = str(formData, `line_${i}_kind`);
    const partId = kind === 'part' ? str(formData, `line_${i}_partId`) : '';
    const productId = kind === 'product' ? str(formData, `line_${i}_productId`) : '';
    const description = str(formData, `line_${i}_description`);
    const quantity = num(formData, `line_${i}_quantity`);
    if (!partId && !productId && !description && !quantity) continue; // an empty row
    out.push({ partId: partId || undefined, productId: productId || undefined, description, quantity, unitCost: num(formData, `line_${i}_unitCost`), estimatedUnitCost: optNum(formData, `line_${i}_unitCost`) });
  }
  return out;
}
function fail(path: string, err: unknown, fallback: string): never {
  const message = friendlyError(err, fallback, 'procurement-form-handlers');
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}
function done(path: string, status: string): never {
  revalidatePath('/procurement');
  revalidatePath(path.split('?')[0]!);
  redirect(`${path}${path.includes('?') ? '&' : '?'}status=${status}`);
}
function supplierInput(formData: FormData): SupplierInput {
  return {
    name: str(formData, 'name'), country: str(formData, 'country'), currency: str(formData, 'currency') || 'USD', contactName: str(formData, 'contactName'), email: str(formData, 'email'),
    phone: str(formData, 'phone'), address: str(formData, 'address'), paymentTerms: str(formData, 'paymentTerms'), leadTimeDays: optNum(formData, 'leadTimeDays'),
  };
}

// ── Suppliers ─────────────────────────────────────────────────────────────

export async function createSupplierFormAction(formData: FormData) {
  let id = '';
  try {
    id = (await createSupplier(supplierInput(formData))).id;
  } catch (err) {
    fail('/procurement/suppliers/new', err, 'Could not add the supplier.');
  }
  revalidatePath('/procurement/suppliers');
  done(`/procurement/suppliers/${id}`, 'created');
}

export async function updateSupplierFormAction(formData: FormData) {
  const id = str(formData, 'supplierId');
  try {
    await updateSupplier(id, { ...supplierInput(formData), isActive: str(formData, 'isActive') !== '0' });
  } catch (err) {
    fail(`/procurement/suppliers/${id}?edit=1`, err, 'Could not save the supplier.');
  }
  revalidatePath('/procurement/suppliers');
  done(`/procurement/suppliers/${id}`, 'saved');
}

// ── Requisitions ──────────────────────────────────────────────────────────

export async function createRequisitionFormAction(formData: FormData) {
  let id = '';
  try {
    const r = await createRequisition({ reason: str(formData, 'reason'), neededBy: date(formData, 'neededBy'), buildOrderNumber: str(formData, 'buildOrderNumber') || undefined, lines: lines(formData).map((l) => ({ partId: l.partId, productId: l.productId, description: l.description, quantity: l.quantity, estimatedUnitCost: l.estimatedUnitCost })) });
    id = r.id;
    if (str(formData, 'submitNow') === '1') await submitRequisition(id);
  } catch (err) {
    fail(id ? `/procurement/requisitions/${id}` : '/procurement/requisitions/new', err, 'Could not save the requisition.');
  }
  revalidatePath('/procurement/requisitions');
  done(`/procurement/requisitions/${id}`, str(formData, 'submitNow') === '1' ? 'submitted' : 'created');
}

async function requisitionStep(formData: FormData, step: (id: string, reason: string) => Promise<void>, status: string, fallback: string) {
  const id = str(formData, 'requisitionId');
  try {
    await step(id, str(formData, 'reason'));
  } catch (err) {
    fail(`/procurement/requisitions/${id}`, err, fallback);
  }
  revalidatePath('/procurement/requisitions');
  done(`/procurement/requisitions/${id}`, status);
}

export async function submitRequisitionFormAction(formData: FormData) {
  await requisitionStep(formData, (id) => submitRequisition(id), 'submitted', 'Could not submit the requisition.');
}
export async function approveRequisitionFormAction(formData: FormData) {
  await requisitionStep(formData, (id) => approveRequisition(id), 'approved', 'Could not approve the requisition.');
}
export async function rejectRequisitionFormAction(formData: FormData) {
  await requisitionStep(formData, (id, reason) => rejectRequisition(id, reason), 'rejected', 'Could not reject the requisition.');
}
export async function reopenRequisitionFormAction(formData: FormData) {
  await requisitionStep(formData, (id) => reopenRequisition(id), 'reopened', 'Could not reopen the requisition.');
}
export async function cancelRequisitionFormAction(formData: FormData) {
  await requisitionStep(formData, (id, reason) => cancelRequisition(id, reason), 'cancelled', 'Could not cancel the requisition.');
}

// ── Purchase orders ───────────────────────────────────────────────────────

export async function createPurchaseOrderFormAction(formData: FormData) {
  const requisitionId = str(formData, 'requisitionId');
  let id = '';
  try {
    id = (await createPurchaseOrder({
      supplierId: str(formData, 'supplierId'), requisitionId: requisitionId || undefined, currency: str(formData, 'currency') || 'USD', exchangeRate: optNum(formData, 'exchangeRate'),
      incoterms: str(formData, 'incoterms'), paymentTerms: str(formData, 'paymentTerms'), expectedDate: date(formData, 'expectedDate'), notes: str(formData, 'notes'),
      lines: lines(formData).map((l) => ({ partId: l.partId, productId: l.productId, description: l.description, quantity: l.quantity, unitCost: l.unitCost })),
    })).id;
  } catch (err) {
    fail(`/procurement/orders/new${requisitionId ? `?requisition=${encodeURIComponent(requisitionId)}` : ''}`, err, 'Could not create the purchase order.');
  }
  revalidatePath('/procurement/orders');
  revalidatePath('/procurement/requisitions');
  done(`/procurement/orders/${id}`, 'created');
}

async function orderStep(formData: FormData, step: (id: string, reason: string) => Promise<void>, status: string, fallback: string) {
  const id = str(formData, 'purchaseOrderId');
  try {
    await step(id, str(formData, 'reason'));
  } catch (err) {
    fail(`/procurement/orders/${id}`, err, fallback);
  }
  revalidatePath('/procurement/orders');
  done(`/procurement/orders/${id}`, status);
}

export async function approvePurchaseOrderFormAction(formData: FormData) {
  await orderStep(formData, (id) => approvePurchaseOrder(id), 'approved', 'Could not approve the purchase order.');
}
export async function markPurchaseOrderSentFormAction(formData: FormData) {
  await orderStep(formData, (id) => markPurchaseOrderSent(id), 'sent', 'Could not mark the order as sent.');
}
export async function closePurchaseOrderFormAction(formData: FormData) {
  await orderStep(formData, (id, note) => closePurchaseOrder(id, note), 'closed', 'Could not close the order.');
}
export async function cancelPurchaseOrderFormAction(formData: FormData) {
  await orderStep(formData, (id, reason) => cancelPurchaseOrder(id, reason), 'cancelled', 'Could not cancel the order.');
}

// ── Shipments ─────────────────────────────────────────────────────────────

export async function addShipmentFormAction(formData: FormData) {
  const purchaseOrderId = str(formData, 'purchaseOrderId');
  let id = '';
  try {
    id = (await addShipment({ purchaseOrderId, mode: str(formData, 'mode'), carrier: str(formData, 'carrier'), reference: str(formData, 'reference'), containerNumbers: str(formData, 'containerNumbers'), etd: date(formData, 'etd'), eta: date(formData, 'eta'), notes: str(formData, 'notes') })).id;
  } catch (err) {
    fail(`/procurement/orders/${purchaseOrderId}`, err, 'Could not add the shipment.');
  }
  revalidatePath('/procurement/shipments');
  revalidatePath(`/procurement/orders/${purchaseOrderId}`);
  done(`/procurement/shipments/${id}`, 'booked');
}

export async function advanceShipmentFormAction(formData: FormData) {
  const id = str(formData, 'shipmentId');
  let status = '';
  try {
    status = (await advanceShipment(id, { at: date(formData, 'at'), dutyPaid: optNum(formData, 'dutyPaid'), notes: str(formData, 'notes') })).status;
  } catch (err) {
    fail(`/procurement/shipments/${id}`, err, 'Could not update the shipment.');
  }
  revalidatePath('/procurement/shipments');
  done(`/procurement/shipments/${id}`, status.toLowerCase());
}

// ── Supplier claims ───────────────────────────────────────────────────────

export async function createSupplierClaimFormAction(formData: FormData) {
  const orderId = str(formData, 'purchaseOrderId');
  let id = '';
  try {
    id = (await createSupplierClaim({ supplierId: str(formData, 'supplierId'), purchaseOrderId: orderId || undefined, goodsReceiptId: str(formData, 'goodsReceiptId') || undefined, warrantyClaimId: str(formData, 'warrantyClaimId') || undefined, description: str(formData, 'description'), amount: num(formData, 'amount'), currency: str(formData, 'currency') || undefined })).id;
  } catch (err) {
    fail(`/procurement/claims/new${orderId ? `?order=${encodeURIComponent(orderId)}` : ''}`, err, 'Could not raise the claim.');
  }
  revalidatePath('/procurement/claims');
  done(`/procurement/claims/${id}`, 'created');
}

async function claimStep(formData: FormData, step: (id: string) => Promise<void>, status: string, fallback: string) {
  const id = str(formData, 'claimId');
  try {
    await step(id);
  } catch (err) {
    fail(`/procurement/claims/${id}`, err, fallback);
  }
  revalidatePath('/procurement/claims');
  done(`/procurement/claims/${id}`, status);
}

export async function sendSupplierClaimFormAction(formData: FormData) {
  await claimStep(formData, (id) => sendSupplierClaim(id), 'sent', 'Could not send the claim.');
}
export async function decideSupplierClaimFormAction(formData: FormData) {
  const accepted = str(formData, 'decision') === 'ACCEPTED';
  await claimStep(formData, (id) => decideSupplierClaim(id, accepted, str(formData, 'note')), accepted ? 'accepted' : 'rejected', 'Could not record the supplier\'s answer.');
}
export async function settleSupplierClaimFormAction(formData: FormData) {
  await claimStep(formData, (id) => settleSupplierClaim(id, str(formData, 'reference'), optNum(formData, 'amount')), 'settled', 'Could not record the settlement.');
}
export async function closeSupplierClaimFormAction(formData: FormData) {
  await claimStep(formData, (id) => closeSupplierClaim(id, str(formData, 'note')), 'closed', 'Could not close the claim.');
}
