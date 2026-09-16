'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { startVehicleInspection, skipVehicleInspection, updateInspectionItems, completeVehicleInspection } from './vehicle-inspection';
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
    const message = err instanceof Error ? err.message : 'Could not start this inspection.';
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
    const message = err instanceof Error ? err.message : 'Could not skip this inspection.';
    redirect(`/workshop/vehicle-service/${vehicleServiceId}/inspection?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}/inspection`);
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}/inspection?status=skipped`);
}

/** One form per section on the inspection page — item IDs travel as
 * a hidden, comma-separated list so this single handler can save an
 * entire section's rows in one real transaction, without a separate
 * server action per item. */
export async function saveInspectionSectionFormAction(formData: FormData) {
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
    const message = err instanceof Error ? err.message : 'Could not save this section.';
    redirect(`/workshop/vehicle-service/${vehicleServiceId}/inspection?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}/inspection`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}/inspection?status=section_saved`);
}

export async function completeVehicleInspectionFormAction(formData: FormData) {
  const inspectionId = str(formData, 'inspectionId');
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  try {
    await completeVehicleInspection(inspectionId, str(formData, 'notes') || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not complete this inspection.';
    redirect(`/workshop/vehicle-service/${vehicleServiceId}/inspection?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}/inspection`);
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}/inspection?status=completed`);
}
