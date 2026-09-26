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
function fail(path: string, err: unknown, fallback: string): never {
  const message = err instanceof Error ? err.message : fallback;
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}

export async function createWarrantyProviderFormAction(formData: FormData) {
  try {
    await createWarrantyProvider({
      name: str(formData, 'name'),
      type: (str(formData, 'type') || 'MANUFACTURER') as WarrantyProviderInput['type'],
      contactName: str(formData, 'contactName') || undefined,
      email: str(formData, 'email') || undefined,
      phone: str(formData, 'phone') || undefined,
      claimSubmissionDays: optInt(formData, 'claimSubmissionDays'),
      partRetentionDays: optInt(formData, 'partRetentionDays'),
      notes: str(formData, 'notes') || undefined,
    });
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
      coverageSummary: str(formData, 'coverageSummary'),
      exclusions: str(formData, 'exclusions') || undefined,
      conditions: str(formData, 'conditions') || undefined,
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
