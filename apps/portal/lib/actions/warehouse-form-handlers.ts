'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createFgLocation, setFgLocationActive, moveFinishedUnit, setFinishedUnitQuarantine, requestUnitAdjustment, decideUnitAdjustment, receiveFinishedUnits,
  recordIncomingInspection, createTransfer, approveTransfer, dispatchTransfer, receiveTransfer, cancelTransfer, pickReleaseLine, unpickReleaseLine, releaseGoods,
  createDispatch, recordDelivery, markDispatchFailed,
} from './warehouse';

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function num(formData: FormData, key: string): number {
  const n = Number(str(formData, key).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function fail(path: string, err: unknown, fallback: string): never {
  const message = friendlyError(err, fallback, 'warehouse-form-handlers');
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}
function done(path: string, status: string): never {
  revalidatePath('/warehouse');
  revalidatePath(path.split('?')[0]!);
  redirect(`${path}${path.includes('?') ? '&' : '?'}status=${status}`);
}

// ── Locations ─────────────────────────────────────────────────────────────

export async function createFgLocationFormAction(formData: FormData) {
  try {
    await createFgLocation({ name: str(formData, 'name'), kind: str(formData, 'kind'), branchId: str(formData, 'branchId') || undefined });
  } catch (err) {
    fail('/warehouse/locations', err, 'Could not add the location.');
  }
  done('/warehouse/locations', 'location_created');
}

export async function setFgLocationActiveFormAction(formData: FormData) {
  const active = str(formData, 'active') === '1';
  try {
    await setFgLocationActive(str(formData, 'locationId'), active);
  } catch (err) {
    fail('/warehouse/locations', err, 'Could not change the location.');
  }
  done('/warehouse/locations', active ? 'location_reactivated' : 'location_retired');
}

// ── Finished units ────────────────────────────────────────────────────────

export async function moveFinishedUnitFormAction(formData: FormData) {
  const unitId = str(formData, 'unitId');
  try {
    await moveFinishedUnit(unitId, str(formData, 'locationId'), str(formData, 'note') || undefined);
  } catch (err) {
    fail(`/warehouse/finished-goods/${unitId}`, err, 'Could not move the unit.');
  }
  done(`/warehouse/finished-goods/${unitId}`, 'moved');
}

export async function quarantineFinishedUnitFormAction(formData: FormData) {
  const unitId = str(formData, 'unitId');
  const on = str(formData, 'quarantine') === '1';
  try {
    await setFinishedUnitQuarantine(unitId, on, str(formData, 'reason'));
  } catch (err) {
    fail(`/warehouse/finished-goods/${unitId}`, err, 'Could not change the unit.');
  }
  done(`/warehouse/finished-goods/${unitId}`, on ? 'quarantined' : 'back_in_stock');
}

export async function requestUnitAdjustmentFormAction(formData: FormData) {
  const unitId = str(formData, 'unitId');
  const back = str(formData, 'back') || `/warehouse/finished-goods/${unitId}`;
  try {
    await requestUnitAdjustment(unitId, str(formData, 'reason'));
  } catch (err) {
    fail(back, err, 'Could not raise the adjustment.');
  }
  revalidatePath('/warehouse/adjustments');
  done(back, 'adjustment_requested');
}

export async function decideUnitAdjustmentFormAction(formData: FormData) {
  const unitId = str(formData, 'unitId');
  const decision = str(formData, 'decision') === 'SCRAP' ? 'SCRAP' : 'RETURN_TO_STOCK';
  try {
    await decideUnitAdjustment(unitId, decision, str(formData, 'note'));
  } catch (err) {
    fail('/warehouse/adjustments', err, 'Could not record the decision.');
  }
  revalidatePath(`/warehouse/finished-goods/${unitId}`);
  done('/warehouse/adjustments', decision === 'SCRAP' ? 'scrapped' : 'returned_to_stock');
}

// ── Receiving ─────────────────────────────────────────────────────────────

export async function receiveFinishedUnitsFormAction(formData: FormData) {
  const orderId = str(formData, 'purchaseOrderId');
  const back = `/warehouse/receive${orderId ? `?order=${encodeURIComponent(orderId)}` : ''}`;
  let count = 0;
  try {
    const r = await receiveFinishedUnits({ purchaseOrderLineId: str(formData, 'purchaseOrderLineId'), locationId: str(formData, 'locationId'), serials: str(formData, 'serials'), configurationId: str(formData, 'configurationId') || undefined, quantity: num(formData, 'quantity') || undefined });
    count = r.count;
  } catch (err) {
    fail(back, err, 'Could not receive the units.');
  }
  revalidatePath('/warehouse/finished-goods');
  revalidatePath(`/procurement/orders/${orderId}`);
  done(`${back}${back.includes('?') ? '&' : '?'}count=${count}`, 'received');
}

// ── Incoming QC ───────────────────────────────────────────────────────────

export async function recordIncomingInspectionFormAction(formData: FormData) {
  try {
    await recordIncomingInspection({
      goodsReceiptId: str(formData, 'goodsReceiptId'),
      sampleSize: Math.round(num(formData, 'sampleSize')),
      defects: Math.round(num(formData, 'defects')),
      passed: str(formData, 'result') === 'PASS',
      quarantined: formData.get('quarantined') === 'on',
      notes: str(formData, 'notes') || undefined,
    });
  } catch (err) {
    fail('/warehouse/incoming-qc', err, 'Could not record the inspection.');
  }
  done('/warehouse/incoming-qc', 'inspection_recorded');
}

// ── Transfers ─────────────────────────────────────────────────────────────

export async function createTransferFormAction(formData: FormData) {
  let id = '';
  try {
    id = (await createTransfer({ fromLocationId: str(formData, 'fromLocationId'), toLocationId: str(formData, 'toLocationId'), reason: str(formData, 'reason') || undefined, unitIds: formData.getAll('unitIds').map((v) => String(v)) })).id;
  } catch (err) {
    fail('/warehouse/transfers/new', err, 'Could not create the transfer.');
  }
  revalidatePath('/warehouse/transfers');
  done(`/warehouse/transfers/${id}`, 'created');
}

async function transferStep(formData: FormData, step: (id: string, reason: string) => Promise<void>, status: string, fallback: string) {
  const id = str(formData, 'transferId');
  try {
    await step(id, str(formData, 'reason'));
  } catch (err) {
    fail(`/warehouse/transfers/${id}`, err, fallback);
  }
  revalidatePath('/warehouse/transfers');
  revalidatePath('/warehouse/finished-goods');
  done(`/warehouse/transfers/${id}`, status);
}

export async function approveTransferFormAction(formData: FormData) {
  await transferStep(formData, (id) => approveTransfer(id), 'approved', 'Could not approve the transfer.');
}
export async function dispatchTransferFormAction(formData: FormData) {
  await transferStep(formData, (id) => dispatchTransfer(id), 'dispatched', 'Could not dispatch the transfer.');
}
export async function receiveTransferFormAction(formData: FormData) {
  await transferStep(formData, (id) => receiveTransfer(id), 'received', 'Could not receive the transfer.');
}
export async function cancelTransferFormAction(formData: FormData) {
  await transferStep(formData, (id, reason) => cancelTransfer(id, reason), 'cancelled', 'Could not cancel the transfer.');
}

// ── Releases ──────────────────────────────────────────────────────────────

export async function pickReleaseLineFormAction(formData: FormData) {
  const releaseId = str(formData, 'releaseId');
  try {
    await pickReleaseLine(str(formData, 'releaseLineId'), str(formData, 'unitId'));
  } catch (err) {
    fail(`/warehouse/releases/${releaseId}`, err, 'Could not pick that unit.');
  }
  revalidatePath('/warehouse/finished-goods');
  done(`/warehouse/releases/${releaseId}`, 'picked');
}

export async function unpickReleaseLineFormAction(formData: FormData) {
  const releaseId = str(formData, 'releaseId');
  try {
    await unpickReleaseLine(str(formData, 'releaseLineId'));
  } catch (err) {
    fail(`/warehouse/releases/${releaseId}`, err, 'Could not unpick that line.');
  }
  revalidatePath('/warehouse/finished-goods');
  done(`/warehouse/releases/${releaseId}`, 'unpicked');
}

export async function releaseGoodsFormAction(formData: FormData) {
  const releaseId = str(formData, 'releaseId');
  try {
    await releaseGoods(releaseId);
  } catch (err) {
    fail(`/warehouse/releases/${releaseId}`, err, 'Could not release the goods.');
  }
  revalidatePath('/warehouse/releases');
  revalidatePath('/warehouse/finished-goods');
  revalidatePath('/sales/orders');
  done(`/warehouse/releases/${releaseId}`, 'released');
}

// ── Dispatch ──────────────────────────────────────────────────────────────

export async function createDispatchFormAction(formData: FormData) {
  const releaseNoteId = str(formData, 'releaseNoteId');
  let id = '';
  try {
    id = (await createDispatch({ releaseNoteId, vehiclePlate: str(formData, 'vehiclePlate'), driverName: str(formData, 'driverName'), driverPhone: str(formData, 'driverPhone'), carrier: str(formData, 'carrier'), waybill: str(formData, 'waybill') })).id;
  } catch (err) {
    fail(`/warehouse/dispatches/new?release=${encodeURIComponent(releaseNoteId)}`, err, 'Could not record the dispatch.');
  }
  revalidatePath('/warehouse/dispatches');
  revalidatePath('/warehouse/releases');
  revalidatePath(`/warehouse/releases/${releaseNoteId}`);
  revalidatePath('/sales/orders');
  done(`/warehouse/dispatches/${id}`, 'dispatched');
}

export async function recordDeliveryFormAction(formData: FormData) {
  const id = str(formData, 'dispatchId');
  const at = str(formData, 'deliveredAt');
  try {
    await recordDelivery(id, { deliveredAt: at ? new Date(at) : undefined, receivedByName: str(formData, 'receivedByName'), notes: str(formData, 'notes') || undefined });
  } catch (err) {
    fail(`/warehouse/dispatches/${id}`, err, 'Could not record the delivery.');
  }
  revalidatePath('/warehouse/dispatches');
  revalidatePath('/warehouse/finished-goods');
  revalidatePath('/sales/orders');
  done(`/warehouse/dispatches/${id}`, 'delivered');
}

export async function markDispatchFailedFormAction(formData: FormData) {
  const id = str(formData, 'dispatchId');
  try {
    await markDispatchFailed(id, str(formData, 'reason'));
  } catch (err) {
    fail(`/warehouse/dispatches/${id}`, err, 'Could not record the failed delivery.');
  }
  revalidatePath('/warehouse/dispatches');
  done(`/warehouse/dispatches/${id}`, 'failed');
}
