'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { recordRefund } from './refunds';

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function recordRefundFormAction(formData: FormData) {
  const jobCardId = str(formData, 'jobCardId');
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  const page = jobCardId ? `/workshop/job-cards/${jobCardId}` : `/workshop/vehicle-service/${vehicleServiceId}`;
  let referenceNumber = '';
  try {
    if (!jobCardId && !vehicleServiceId) throw new Error('Record not found.');
    const result = await recordRefund({
      target: jobCardId ? { jobCardId } : { vehicleServiceId },
      amount: Number(str(formData, 'amount')),
      method: str(formData, 'method') as 'CASH' | 'BANK_TRANSFER',
      paidToName: str(formData, 'paidToName'),
      reason: str(formData, 'reason') || undefined,
      notes: str(formData, 'notes') || undefined,
    });
    referenceNumber = result.referenceNumber;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not record the refund.';
    redirect(`${page}?error=${encodeURIComponent(message)}#refunds`);
  }
  revalidatePath(page);
  redirect(`${page}?status=refund_recorded&ref=${encodeURIComponent(referenceNumber)}#refunds`);
}
