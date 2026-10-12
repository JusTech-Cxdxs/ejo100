'use server';

import { friendlyError } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { startVehicleInspection, skipVehicleInspection, cancelVehicleInspection, updateInspectionItems, completeVehicleInspection } from './vehicle-inspection';
import type { InspectionItemInput } from './vehicle-inspection';

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function startVehicleInspectionFormAction(formData: FormData) {
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  try {
    await startVehicleInspection(vehicleServiceId);
  } catch (err) {
    const message = friendlyError(err, 'Could not start this inspection.', 'vehicle-inspection-form-handlers');
    redirect(`/workshop/vehicle-service/${vehicleServiceId}/inspection?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}/inspection`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}/inspection`);
}

export async function skipVehicleInspectionFormAction(formData: FormData) {
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  try {
    await skipVehicleInspection(vehicleServiceId, str(formData, 'reason') || undefined);
  } catch (err) {
    const message = friendlyError(err, 'Could not skip this inspection.', 'vehicle-inspection-form-handlers');
    redirect(`/workshop/vehicle-service/${vehicleServiceId}/inspection?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}/inspection`);
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}/inspection?status=skipped`);
}

/** Used from both the Vehicle Service page and the inspection page; a
 * hidden `redirectTo` field says where to go afterwards. */
export async function cancelVehicleInspectionFormAction(formData: FormData) {
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  // Only ever back inside the workshop — never an address taken as-is from the form.
  const fallback = `/workshop/vehicle-service/${vehicleServiceId}/inspection`;
  const raw = str(formData, 'redirectTo');
  const redirectTo = raw.startsWith('/workshop/') && !raw.startsWith('//') && !raw.includes('://') && !raw.includes('\\') ? (raw.split('?')[0] ?? fallback) : fallback;
  try {
    await cancelVehicleInspection(vehicleServiceId, str(formData, 'reason') || undefined);
  } catch (err) {
    const message = friendlyError(err, 'Could not cancel this inspection.', 'vehicle-inspection-form-handlers');
    redirect(`${redirectTo}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}/inspection`);
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  redirect(`${redirectTo}?status=inspection_cancelled`);
}

/** Saves the whole inspection page in one transaction. Item ids arrive as
 * a hidden comma-separated list. */
export async function saveInspectionFormAction(formData: FormData) {
  const inspectionId = str(formData, 'inspectionId');
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  const itemIds = str(formData, 'itemIds').split(',').filter(Boolean);
  const items: InspectionItemInput[] = itemIds.map((itemId) => ({
    itemId,
    condition: str(formData, `condition-${itemId}`) || undefined,
    severity: (str(formData, `severity-${itemId}`) || undefined) as InspectionItemInput['severity'],
    action: str(formData, `action-${itemId}`) || undefined,
    notes: str(formData, `notes-${itemId}`) || undefined,
  }));
  try {
    await updateInspectionItems(inspectionId, items);
  } catch (err) {
    const message = friendlyError(err, 'Could not save these changes.', 'vehicle-inspection-form-handlers');
    redirect(`/workshop/vehicle-service/${vehicleServiceId}/inspection?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}/inspection`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}/inspection?status=saved`);
}

export async function completeVehicleInspectionFormAction(formData: FormData) {
  const inspectionId = str(formData, 'inspectionId');
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  try {
    await completeVehicleInspection(inspectionId, str(formData, 'notes') || undefined);
  } catch (err) {
    const message = friendlyError(err, 'Could not complete this inspection.', 'vehicle-inspection-form-handlers');
    redirect(`/workshop/vehicle-service/${vehicleServiceId}/inspection?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}/inspection`);
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}/inspection?status=completed`);
}

/**
 * "Complete" from the Vehicle Service page: the same action as on the
 * inspection page, redirecting back to the service.
 */
export async function completeVehicleInspectionFromServicePageFormAction(formData: FormData) {
  const inspectionId = str(formData, 'inspectionId');
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  try {
    await completeVehicleInspection(inspectionId, str(formData, 'notes') || undefined);
  } catch (err) {
    const message = friendlyError(err, 'Could not complete this inspection.', 'vehicle-inspection-form-handlers');
    redirect(`/workshop/vehicle-service/${vehicleServiceId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}/inspection`);
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}?status=inspection_completed`);
}
