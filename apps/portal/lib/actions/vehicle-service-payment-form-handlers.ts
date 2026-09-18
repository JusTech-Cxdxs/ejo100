'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { recordServicePayment } from './vehicle-service-payment';

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

export async function recordServicePaymentFormAction(formData: FormData) {
  const vehicleServiceId = str(formData, 'vehicleServiceId');
  try {
    await recordServicePayment(
      vehicleServiceId,
      num(formData, 'amount') ?? NaN,
      str(formData, 'method') === 'CASH' ? 'CASH' : 'BANK_TRANSFER',
      str(formData, 'notes') || undefined,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not record payment.';
    redirect(`/workshop/vehicle-service/${vehicleServiceId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${vehicleServiceId}`);
  redirect(`/workshop/vehicle-service/${vehicleServiceId}?status=payment_recorded`);
}
