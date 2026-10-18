'use server';
import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { onboardDealer, updateDealerAccount, setDealerCredit, holdDealer, releaseDealerHold } from './dealers';

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function num(formData: FormData, key: string): number {
  const n = Number(str(formData, key).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function fail(path: string, err: unknown, fallback: string): never {
  const message = friendlyError(err, fallback, 'dealers-form-handlers');
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}
function done(dealerAccountId: string, status: string): never {
  revalidatePath(`/sales/dealers/${dealerAccountId}`);
  revalidatePath('/sales/dealers');
  redirect(`/sales/dealers/${dealerAccountId}?status=${status}`);
}

/** Onboard a customer as a dealer → /sales/dealers/<id>?status=onboarded */
export async function onboardDealerFormAction(formData: FormData) {
  let id = '';
  try {
    id = (await onboardDealer({ customerId: str(formData, 'customerId'), channel: str(formData, 'channel'), tier: str(formData, 'tier') || undefined, territory: str(formData, 'territory') || undefined, receivesPriceBroadcast: formData.get('receivesPriceBroadcast') === 'on' })).id;
  } catch (err) {
    fail('/sales/dealers', err, 'Could not onboard the dealer.');
  }
  done(id, 'onboarded');
}

/** → ?status=updated */
export async function updateDealerAccountFormAction(formData: FormData) {
  const id = str(formData, 'dealerAccountId');
  try {
    await updateDealerAccount(id, { channel: str(formData, 'channel'), tier: str(formData, 'tier') || undefined, territory: str(formData, 'territory') || undefined, receivesPriceBroadcast: formData.get('receivesPriceBroadcast') === 'on' });
  } catch (err) {
    fail(`/sales/dealers/${id}`, err, 'Could not save the dealer account.');
  }
  done(id, 'updated');
}

/** → ?status=credit_set */
export async function setDealerCreditFormAction(formData: FormData) {
  const id = str(formData, 'dealerAccountId');
  try {
    await setDealerCredit(id, { creditLimit: num(formData, 'creditLimit'), creditDays: num(formData, 'creditDays') });
  } catch (err) {
    fail(`/sales/dealers/${id}`, err, 'Could not set the credit terms.');
  }
  done(id, 'credit_set');
}

/** → ?status=held */
export async function holdDealerFormAction(formData: FormData) {
  const id = str(formData, 'dealerAccountId');
  try {
    await holdDealer(id, str(formData, 'reason'));
  } catch (err) {
    fail(`/sales/dealers/${id}`, err, 'Could not put the account on hold.');
  }
  done(id, 'held');
}

/** → ?status=hold_released */
export async function releaseDealerHoldFormAction(formData: FormData) {
  const id = str(formData, 'dealerAccountId');
  try {
    await releaseDealerHold(id);
  } catch (err) {
    fail(`/sales/dealers/${id}`, err, 'Could not release the hold.');
  }
  done(id, 'hold_released');
}
