'use server';

import { friendlyError } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { setEstimateLineBillTo } from './estimate-billing';
import type { BillTo } from '@/lib/estimate-billing';

export async function setEstimateLineBillToFormAction(formData: FormData) {
  const jobCardId = String(formData.get('jobCardId') ?? '');
  const back = `/workshop/job-cards/${jobCardId}`;
  try {
    await setEstimateLineBillTo(String(formData.get('lineId') ?? ''), String(formData.get('billTo') ?? '') as BillTo, String(formData.get('warrantyId') ?? '') || null, String(formData.get('note') ?? ''));
  } catch (err) {
    const message = friendlyError(err, 'Could not update who pays for this line.', 'estimate-billing-form-handlers');
    redirect(`${back}?error=${encodeURIComponent(message)}#who-pays`);
  }
  revalidatePath(back);
  redirect(`${back}?status=bill_to_set#who-pays`);
}
