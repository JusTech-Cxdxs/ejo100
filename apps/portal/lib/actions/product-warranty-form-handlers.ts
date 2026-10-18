'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { registerProductWarranty, logProductWarrantyClaim } from './product-warranty';

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function fail(path: string, err: unknown, fallback: string): never {
  const message = friendlyError(err, fallback, 'product-warranty-form-handlers');
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}

/** /service/warranties → ?status=registered (the new warranty is at the top of the list). */
export async function registerProductWarrantyFormAction(formData: FormData) {
  const serial = str(formData, 'serialNumber');
  const starts = str(formData, 'startsAt');
  let number = '';
  try {
    number = (await registerProductWarranty({
      serialNumber: serial,
      policyId: str(formData, 'policyId') || undefined,
      startsAt: starts ? new Date(`${starts}T12:00:00+01:00`) : undefined,
      customerId: str(formData, 'customerId') || undefined,
      evidenceNote: str(formData, 'evidenceNote') || undefined,
    })).warrantyNumber;
  } catch (err) {
    fail(`/service/warranties?serial=${encodeURIComponent(serial)}`, err, 'Could not register the warranty.');
  }
  revalidatePath('/service/warranties');
  revalidatePath('/service');
  redirect(`/service/warranties?status=registered&number=${encodeURIComponent(number)}`);
}

/** /service/claims → the new service job (status=claim_logged). */
export async function logProductWarrantyClaimFormAction(formData: FormData) {
  const serial = str(formData, 'serialNumber');
  const failed = str(formData, 'failureDate');
  let jobId = '';
  try {
    jobId = (await logProductWarrantyClaim({ serialNumber: serial, fault: str(formData, 'fault'), causalPart: str(formData, 'causalPart') || undefined, failureDate: failed ? new Date(`${failed}T12:00:00+01:00`) : undefined })).jobId;
  } catch (err) {
    fail(`/service/claims?serial=${encodeURIComponent(serial)}`, err, 'Could not log the claim.');
  }
  revalidatePath('/service/claims');
  revalidatePath('/service/jobs');
  revalidatePath('/warranty/claims');
  redirect(`/service/jobs/${jobId}?status=claim_logged`);
}
