'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createServiceEstimate,
  cancelServiceEstimate,
  addServiceEstimateLineItem,
  removeServiceEstimateLineItem,
  matchServiceEstimateStorePartLine,
  submitServiceEstimate,
  approveServiceEstimate,
} from './vehicle-service-estimate';

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function num(formData: FormData, key: string): number | undefined {
  const value = formData.get(key);
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function createServiceEstimateFormAction(formData: FormData) {
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  try {
    await createServiceEstimate(vehicleServiceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not start this estimate.';
    redirect(`/workshop/vehicle-service/${vehicleServiceId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}?status=estimate_started`);
}

export async function cancelServiceEstimateFormAction(formData: FormData) {
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  try {
    await cancelServiceEstimate(vehicleServiceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not cancel this estimate.';
    redirect(`/workshop/vehicle-service/${vehicleServiceId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}?status=estimate_cancelled`);
}

export async function addServiceEstimateLineItemFormAction(formData: FormData) {
  const estimateId = str(formData, 'estimateId');
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  const typeRaw = str(formData, 'type');
  const validTypes = ['STORE_PART', 'INTERNAL_JOB', 'LABOUR', 'SUNDRY'] as const;
  const type = (validTypes as readonly string[]).includes(typeRaw) ? (typeRaw as (typeof validTypes)[number]) : 'INTERNAL_JOB';
  try {
    await addServiceEstimateLineItem(estimateId, {
      type,
      description: str(formData, 'description'),
      quantity: num(formData, 'quantity') ?? 0,
      unitPrice: num(formData, 'unitPrice'),
      partTypeId: str(formData, 'partTypeId') || undefined,
      unitOfMeasure: str(formData, 'unitOfMeasure') || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not add this line item.';
    redirect(`/workshop/vehicle-service/${vehicleServiceId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}?status=line_added`);
}

export async function matchServiceEstimateStorePartLineFormAction(formData: FormData) {
  const lineItemId = str(formData, 'lineItemId');
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  const partId = str(formData, 'partId');
  if (!partId) {
    redirect(`/workshop/vehicle-service/${vehicleServiceId}?error=${encodeURIComponent('Select a real Part to match this line to.')}`);
  }
  try {
    await matchServiceEstimateStorePartLine(lineItemId, partId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not match this line to that Part.';
    redirect(`/workshop/vehicle-service/${vehicleServiceId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}?status=line_matched`);
}

export async function removeServiceEstimateLineItemFormAction(formData: FormData) {
  const lineItemId = str(formData, 'lineItemId');
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  try {
    await removeServiceEstimateLineItem(lineItemId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not remove this line item.';
    redirect(`/workshop/vehicle-service/${vehicleServiceId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}?status=line_removed`);
}

export async function submitServiceEstimateFormAction(formData: FormData) {
  const estimateId = str(formData, 'estimateId');
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  try {
    await submitServiceEstimate(estimateId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not submit this estimate.';
    redirect(`/workshop/vehicle-service/${vehicleServiceId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}?status=estimate_submitted`);
}

export async function approveServiceEstimateFormAction(formData: FormData) {
  const estimateId = str(formData, 'estimateId');
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  try {
    await approveServiceEstimate(estimateId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not approve this estimate.';
    redirect(`/workshop/vehicle-service/${vehicleServiceId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}?status=estimate_approved`);
}
