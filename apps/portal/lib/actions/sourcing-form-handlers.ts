'use server';

/**
 * Thin <form action={...}> wrappers around lib/actions/sourcing.ts — same
 * pattern as store-form-handlers.ts and workshop-form-handlers.ts.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  requestPartRequestSlip,
  approvePartRequestSlipByHod,
  approvePartRequestSlipByStore,
  releasePartRequestSlip,
  rejectPartRequestSlip,
  requestExternalProcurement,
  approveExternalProcurementRequest,
  disburseExternalProcurementRequest,
  rejectExternalProcurementRequest,
} from './sourcing';

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function num(formData: FormData, key: string): number | undefined {
  const raw = str(formData, key);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function requestPartRequestSlipFormAction(formData: FormData) {
  const jobCardId = str(formData, 'jobCardId');
  try {
    const partIds = formData.getAll('linePartId').map((v) => (typeof v === 'string' ? v : ''));
    const quantities = formData.getAll('lineQuantity').map((v) => (typeof v === 'string' ? v : ''));
    const estimateLineItemIds = formData.getAll('lineEstimateLineItemId').map((v) => (typeof v === 'string' ? v : ''));
    const lines = partIds
      .map((partId, i) => ({
        partId,
        quantityRequested: Number(quantities[i]),
        estimateLineItemId: estimateLineItemIds[i] || undefined,
      }))
      .filter((l) => l.partId && l.quantityRequested > 0);
    await requestPartRequestSlip(jobCardId, lines);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not raise the parts request.';
    redirect(`/workshop/job-cards/${jobCardId}/request-parts?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/job-cards/${jobCardId}`);
  revalidatePath('/workshop/parts-requests');
  redirect(`/workshop/job-cards/${jobCardId}?status=parts_requested`);
}

export async function approvePartRequestSlipByHodFormAction(formData: FormData) {
  const slipId = str(formData, 'slipId');
  const jobCardId = str(formData, 'jobCardId');
  try {
    await approvePartRequestSlipByHod(slipId, str(formData, 'notes') || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not approve this request.';
    redirect(`/workshop/parts-requests/${slipId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/parts-requests/${slipId}`);
  revalidatePath('/workshop/parts-requests');
  if (jobCardId) revalidatePath(`/workshop/job-cards/${jobCardId}`);
  redirect(`/workshop/parts-requests/${slipId}?status=hod_approved`);
}

export async function approvePartRequestSlipByStoreFormAction(formData: FormData) {
  const slipId = str(formData, 'slipId');
  const jobCardId = str(formData, 'jobCardId');
  try {
    await approvePartRequestSlipByStore(slipId, str(formData, 'notes') || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not approve this request.';
    redirect(`/workshop/parts-requests/${slipId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/parts-requests/${slipId}`);
  revalidatePath('/workshop/parts-requests');
  if (jobCardId) revalidatePath(`/workshop/job-cards/${jobCardId}`);
  redirect(`/workshop/parts-requests/${slipId}?status=store_approved`);
}

export async function releasePartRequestSlipFormAction(formData: FormData) {
  const slipId = str(formData, 'slipId');
  const jobCardId = str(formData, 'jobCardId');
  try {
    const serializedLineIds = formData.getAll('serializedLineId').map((v) => (typeof v === 'string' ? v : ''));
    const lineSerials: Record<string, string[]> = {};
    for (const lineId of serializedLineIds) {
      lineSerials[lineId] = formData.getAll(`serials_${lineId}`).map((v) => (typeof v === 'string' ? v : ''));
    }
    await releasePartRequestSlip(
      slipId,
      { receivedByUserId: str(formData, 'receivedByUserId') || undefined, receivedByName: str(formData, 'receivedByName') || undefined },
      Object.keys(lineSerials).length > 0 ? lineSerials : undefined,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not release this request.';
    redirect(`/workshop/parts-requests/${slipId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/parts-requests/${slipId}`);
  revalidatePath('/workshop/parts-requests');
  revalidatePath('/inventory/parts');
  if (jobCardId) revalidatePath(`/workshop/job-cards/${jobCardId}`);
  redirect(`/workshop/parts-requests/${slipId}?status=released`);
}

export async function rejectPartRequestSlipFormAction(formData: FormData) {
  const slipId = str(formData, 'slipId');
  const jobCardId = str(formData, 'jobCardId');
  try {
    await rejectPartRequestSlip(slipId, str(formData, 'reason'));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not reject this request.';
    redirect(`/workshop/parts-requests/${slipId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/parts-requests/${slipId}`);
  revalidatePath('/workshop/parts-requests');
  if (jobCardId) revalidatePath(`/workshop/job-cards/${jobCardId}`);
  redirect(`/workshop/parts-requests/${slipId}?status=rejected`);
}

export async function requestExternalProcurementFormAction(formData: FormData) {
  const jobCardId = str(formData, 'jobCardId');
  try {
    await requestExternalProcurement(
      jobCardId,
      str(formData, 'description'),
      num(formData, 'estimatedAmount') ?? 0,
      str(formData, 'estimateLineItemId') || undefined,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not raise the procurement request.';
    redirect(`/workshop/job-cards/${jobCardId}/request-procurement?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/job-cards/${jobCardId}`);
  revalidatePath('/workshop/external-procurement');
  redirect(`/workshop/job-cards/${jobCardId}?status=procurement_requested`);
}

export async function approveExternalProcurementRequestFormAction(formData: FormData) {
  const requestId = str(formData, 'requestId');
  const jobCardId = str(formData, 'jobCardId');
  try {
    await approveExternalProcurementRequest(requestId, str(formData, 'notes') || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not approve this request.';
    redirect(`/workshop/external-procurement/${requestId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/external-procurement/${requestId}`);
  revalidatePath('/workshop/external-procurement');
  if (jobCardId) revalidatePath(`/workshop/job-cards/${jobCardId}`);
  redirect(`/workshop/external-procurement/${requestId}?status=approved`);
}

export async function disburseExternalProcurementRequestFormAction(formData: FormData) {
  const requestId = str(formData, 'requestId');
  const jobCardId = str(formData, 'jobCardId');
  try {
    await disburseExternalProcurementRequest(requestId, num(formData, 'disbursedAmount') ?? 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not disburse this request.';
    redirect(`/workshop/external-procurement/${requestId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/external-procurement/${requestId}`);
  revalidatePath('/workshop/external-procurement');
  if (jobCardId) revalidatePath(`/workshop/job-cards/${jobCardId}`);
  redirect(`/workshop/external-procurement/${requestId}?status=disbursed`);
}

export async function rejectExternalProcurementRequestFormAction(formData: FormData) {
  const requestId = str(formData, 'requestId');
  const jobCardId = str(formData, 'jobCardId');
  try {
    await rejectExternalProcurementRequest(requestId, str(formData, 'reason'));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not reject this request.';
    redirect(`/workshop/external-procurement/${requestId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/external-procurement/${requestId}`);
  revalidatePath('/workshop/external-procurement');
  if (jobCardId) revalidatePath(`/workshop/job-cards/${jobCardId}`);
  redirect(`/workshop/external-procurement/${requestId}?status=rejected`);
}
