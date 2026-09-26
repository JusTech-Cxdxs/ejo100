'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createWarrantyProvider,
  createWarrantyPolicy,
  setWarrantyPolicyActive,
  loadSampleWarrantyPolicies,
  setPartWarrantyPolicy,
  registerAssetWarranty,
  verifyWarranty,
  setWarrantyStatus,
  updateWarrantyPolicy,
  requestWarrantyPolicyDeletion,
  approveWarrantyPolicyDeletion,
  declineWarrantyPolicyDeletion,
  updateWarrantyProvider,
  setWarrantyProviderActive,
  requestWarrantyProviderDeletion,
  approveWarrantyProviderDeletion,
  declineWarrantyProviderDeletion,
  type WarrantyProviderInput,
} from './warranty';

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function optInt(formData: FormData, key: string): number | undefined {
  const v = str(formData, key);
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}
/** A one-item-per-line list field (LineItemsInput) → stored text. */
function lines(formData: FormData, key: string): string {
  return formData
    .getAll(key)
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)
    .join('\n');
}
/** Coverage + remedy fields shared by the policy create and edit forms. */
function coverage(formData: FormData) {
  const remedy = str(formData, 'defaultRemedy');
  return {
    coversParts: formData.get('coversParts') === 'true',
    coversLabour: formData.get('coversLabour') === 'true',
    defaultRemedy: (remedy === 'REPLACEMENT' || remedy === 'REPAIR' ? remedy : 'REIMBURSEMENT') as 'REIMBURSEMENT' | 'REPLACEMENT' | 'REPAIR',
  };
}
function providerInput(formData: FormData): WarrantyProviderInput {
  return {
    name: str(formData, 'name'),
    type: (str(formData, 'type') || 'MANUFACTURER') as WarrantyProviderInput['type'],
    contactName: str(formData, 'contactName') || undefined,
    email: str(formData, 'email') || undefined,
    phone: str(formData, 'phone') || undefined,
    claimSubmissionDays: optInt(formData, 'claimSubmissionDays'),
    partRetentionDays: optInt(formData, 'partRetentionDays'),
    notes: str(formData, 'notes') || undefined,
  };
}
function fail(path: string, err: unknown, fallback: string): never {
  const message = err instanceof Error ? err.message : fallback;
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}

export async function createWarrantyProviderFormAction(formData: FormData) {
  try {
    await createWarrantyProvider(providerInput(formData));
  } catch (err) {
    fail('/warranty/providers', err, 'Could not add the provider.');
  }
  revalidatePath('/warranty/providers');
  redirect('/warranty/providers?status=provider_created');
}

export async function createWarrantyPolicyFormAction(formData: FormData) {
  try {
    await createWarrantyPolicy({
      code: str(formData, 'code'),
      name: str(formData, 'name'),
      kind: str(formData, 'kind') === 'PART' ? 'PART' : 'ASSET',
      providerId: str(formData, 'providerId'),
      brand: str(formData, 'brand') || undefined,
      model: str(formData, 'model') || undefined,
      durationMonths: optInt(formData, 'durationMonths') ?? 0,
      distanceLimit: optInt(formData, 'distanceLimit'),
      coverageSummary: lines(formData, 'coverageItem'),
      exclusions: lines(formData, 'exclusionItem') || undefined,
      conditions: lines(formData, 'conditionItem') || undefined,
      ...coverage(formData),
    });
  } catch (err) {
    fail('/warranty/policies', err, 'Could not add the policy.');
  }
  revalidatePath('/warranty/policies');
  redirect('/warranty/policies?status=policy_created');
}

export async function setWarrantyPolicyActiveFormAction(formData: FormData) {
  try {
    await setWarrantyPolicyActive(str(formData, 'policyId'), str(formData, 'isActive') === 'true');
  } catch (err) {
    fail('/warranty/policies', err, 'Could not update the policy.');
  }
  revalidatePath('/warranty/policies');
  redirect('/warranty/policies?status=policy_updated');
}

export async function loadSampleWarrantyPoliciesFormAction() {
  let created = 0;
  try {
    created = (await loadSampleWarrantyPolicies()).created;
  } catch (err) {
    fail('/warranty/policies', err, 'Could not load the sample policies.');
  }
  revalidatePath('/warranty/policies');
  redirect(`/warranty/policies?status=samples_loaded&created=${created}`);
}

export async function setPartWarrantyPolicyFormAction(formData: FormData) {
  const partId = str(formData, 'partId');
  try {
    await setPartWarrantyPolicy(partId, str(formData, 'policyId') || null);
  } catch (err) {
    fail(`/inventory/parts/${partId}`, err, 'Could not update the part’s warranty.');
  }
  revalidatePath(`/inventory/parts/${partId}`);
  redirect(`/inventory/parts/${partId}?status=warranty_policy_set#warranty`);
}

export async function registerAssetWarrantyFormAction(formData: FormData) {
  const vehicleId = str(formData, 'vehicleId');
  let id = '';
  try {
    const result = await registerAssetWarranty({
      vehicleId,
      policyId: str(formData, 'policyId'),
      startsAt: new Date(`${str(formData, 'startsAt')}T12:00:00Z`),
      startReading: optInt(formData, 'startReading'),
      evidenceNote: str(formData, 'evidenceNote'),
    });
    id = result.id;
  } catch (err) {
    fail(`/warranty/register?vehicleId=${encodeURIComponent(vehicleId)}`, err, 'Could not register the warranty.');
  }
  revalidatePath('/warranty');
  redirect(`/warranty/${id}?status=registered`);
}

export async function verifyWarrantyFormAction(formData: FormData) {
  const id = str(formData, 'warrantyId');
  try {
    await verifyWarranty(id);
  } catch (err) {
    fail(`/warranty/${id}`, err, 'Could not verify the warranty.');
  }
  revalidatePath(`/warranty/${id}`);
  redirect(`/warranty/${id}?status=verified`);
}

export async function setWarrantyStatusFormAction(formData: FormData) {
  const id = str(formData, 'warrantyId');
  const status = str(formData, 'status') as 'ACTIVE' | 'SUSPENDED' | 'VOID' | 'TRANSFERRED';
  try {
    await setWarrantyStatus(id, status, str(formData, 'reason'));
  } catch (err) {
    fail(`/warranty/${id}`, err, 'Could not change the warranty status.');
  }
  revalidatePath(`/warranty/${id}`);
  redirect(`/warranty/${id}?status=status_changed`);
}

export async function updateWarrantyPolicyFormAction(formData: FormData) {
  const policyId = str(formData, 'policyId');
  try {
    await updateWarrantyPolicy(policyId, {
      name: str(formData, 'name'),
      kind: str(formData, 'kind') === 'PART' ? 'PART' : 'ASSET',
      providerId: str(formData, 'providerId'),
      brand: str(formData, 'brand') || undefined,
      model: str(formData, 'model') || undefined,
      durationMonths: optInt(formData, 'durationMonths') ?? 0,
      distanceLimit: optInt(formData, 'distanceLimit'),
      coverageSummary: lines(formData, 'coverageItem'),
      exclusions: lines(formData, 'exclusionItem') || undefined,
      conditions: lines(formData, 'conditionItem') || undefined,
      ...coverage(formData),
    });
  } catch (err) {
    fail(`/warranty/policies/${policyId}?edit=1`, err, 'Could not save the policy.');
  }
  revalidatePath(`/warranty/policies/${policyId}`);
  redirect(`/warranty/policies/${policyId}?status=policy_updated`);
}

export async function requestWarrantyPolicyDeletionFormAction(formData: FormData) {
  const policyId = str(formData, 'policyId');
  try {
    await requestWarrantyPolicyDeletion(policyId, str(formData, 'reason'));
  } catch (err) {
    fail(`/warranty/policies/${policyId}`, err, 'Could not request the deletion.');
  }
  revalidatePath('/warranty/policies');
  revalidatePath(`/warranty/policies/${policyId}`);
  redirect(`/warranty/policies/${policyId}?status=deletion_requested#deletion`);
}

export async function approveWarrantyPolicyDeletionFormAction(formData: FormData) {
  const policyId = str(formData, 'policyId');
  try {
    await approveWarrantyPolicyDeletion(str(formData, 'requestId'));
  } catch (err) {
    fail(`/warranty/policies/${policyId}`, err, 'Could not approve the deletion.');
  }
  revalidatePath('/warranty/policies');
  // The policy may now be gone (deleted) — land on the list in that case.
  redirect(`/warranty/policies?status=deletion_approved&policy=${encodeURIComponent(policyId)}`);
}

export async function declineWarrantyPolicyDeletionFormAction(formData: FormData) {
  const policyId = str(formData, 'policyId');
  try {
    await declineWarrantyPolicyDeletion(str(formData, 'requestId'), str(formData, 'reason'));
  } catch (err) {
    fail(`/warranty/policies/${policyId}`, err, 'Could not decline the deletion.');
  }
  revalidatePath(`/warranty/policies/${policyId}`);
  redirect(`/warranty/policies/${policyId}?status=deletion_declined#deletion`);
}

export async function updateWarrantyProviderFormAction(formData: FormData) {
  const providerId = str(formData, 'providerId');
  try {
    await updateWarrantyProvider(providerId, providerInput(formData));
  } catch (err) {
    fail(`/warranty/providers/${providerId}?edit=1`, err, 'Could not save the provider.');
  }
  revalidatePath(`/warranty/providers/${providerId}`);
  redirect(`/warranty/providers/${providerId}?status=provider_updated`);
}

export async function setWarrantyProviderActiveFormAction(formData: FormData) {
  const providerId = str(formData, 'providerId');
  const back = str(formData, 'returnTo') === 'list' ? '/warranty/providers' : `/warranty/providers/${providerId}`;
  try {
    await setWarrantyProviderActive(providerId, str(formData, 'isActive') === 'true');
  } catch (err) {
    fail(back, err, 'Could not update the provider.');
  }
  revalidatePath('/warranty/providers');
  revalidatePath(`/warranty/providers/${providerId}`);
  redirect(`${back}?status=provider_updated`);
}

export async function requestWarrantyProviderDeletionFormAction(formData: FormData) {
  const providerId = str(formData, 'providerId');
  try {
    await requestWarrantyProviderDeletion(providerId, str(formData, 'reason'));
  } catch (err) {
    fail(`/warranty/providers/${providerId}`, err, 'Could not request the deletion.');
  }
  revalidatePath(`/warranty/providers/${providerId}`);
  redirect(`/warranty/providers/${providerId}?status=deletion_requested#deletion`);
}

export async function approveWarrantyProviderDeletionFormAction(formData: FormData) {
  const providerId = str(formData, 'providerId');
  try {
    await approveWarrantyProviderDeletion(str(formData, 'requestId'));
  } catch (err) {
    fail(`/warranty/providers/${providerId}`, err, 'Could not approve the deletion.');
  }
  revalidatePath('/warranty/providers');
  redirect('/warranty/providers?status=deletion_approved');
}

export async function declineWarrantyProviderDeletionFormAction(formData: FormData) {
  const providerId = str(formData, 'providerId');
  try {
    await declineWarrantyProviderDeletion(str(formData, 'requestId'), str(formData, 'reason'));
  } catch (err) {
    fail(`/warranty/providers/${providerId}`, err, 'Could not decline the deletion.');
  }
  revalidatePath(`/warranty/providers/${providerId}`);
  redirect(`/warranty/providers/${providerId}?status=deletion_declined#deletion`);
}
