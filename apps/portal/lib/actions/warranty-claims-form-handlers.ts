'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createWarrantyClaim,
  updateWarrantyClaim,
  submitWarrantyClaimForApproval,
  approveWarrantyClaim,
  sendBackWarrantyClaim,
  markWarrantyClaimSubmitted,
  recordWarrantyClaimDecision,
  recordWarrantyClaimSettlement,
  reopenRejectedWarrantyClaim,
  cancelWarrantyClaim,
  recordFailedPartSent,
  recordFailedPartReceived,
  recordReplacementReceived,
  recordRepairedPartReturned,
  type WarrantyClaimInput,
} from './warranty-claims';

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function num(formData: FormData, key: string): number {
  const v = str(formData, key).replace(/,/g, '');
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function readInput(formData: FormData): WarrantyClaimInput {
  const reading = str(formData, 'failureReading');
  return {
    complaint: str(formData, 'complaint'),
    cause: str(formData, 'cause'),
    correction: str(formData, 'correction'),
    causalPart: str(formData, 'causalPart'),
    causalPartNumber: str(formData, 'causalPartNumber') || undefined,
    failureDate: new Date(`${str(formData, 'failureDate')}T12:00:00Z`),
    failureReading: reading ? Math.round(Number(reading)) : undefined,
    labourAmount: num(formData, 'labourAmount'),
    partsAmount: num(formData, 'partsAmount'),
    otherAmount: num(formData, 'otherAmount'),
    jobCardId: str(formData, 'jobCardId') || undefined,
    vehicleServiceId: str(formData, 'vehicleServiceId') || undefined,
    remedy: (['REIMBURSEMENT', 'REPLACEMENT', 'REPAIR'].includes(str(formData, 'remedy')) ? str(formData, 'remedy') : undefined) as WarrantyClaimInput['remedy'],
    // Only when the form carried the checkbox (unticked sends nothing).
    partReturnRequired: formData.get('partReturnField') === '1' ? formData.get('partReturnRequired') === 'true' : undefined,
  };
}
function fail(path: string, err: unknown, fallback: string): never {
  const message = err instanceof Error ? err.message : fallback;
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}
function done(claimId: string, status: string): never {
  revalidatePath(`/warranty/claims/${claimId}`);
  revalidatePath('/warranty/claims');
  redirect(`/warranty/claims/${claimId}?status=${status}`);
}

export async function createWarrantyClaimFormAction(formData: FormData) {
  const warrantyId = str(formData, 'warrantyId');
  let id = '';
  try {
    id = (await createWarrantyClaim(warrantyId, readInput(formData))).id;
  } catch (err) {
    fail(`/warranty/claims/new?warrantyId=${encodeURIComponent(warrantyId)}`, err, 'Could not open the claim.');
  }
  done(id, 'created');
}

export async function updateWarrantyClaimFormAction(formData: FormData) {
  const claimId = str(formData, 'claimId');
  try {
    await updateWarrantyClaim(claimId, readInput(formData));
  } catch (err) {
    fail(`/warranty/claims/${claimId}?edit=1`, err, 'Could not save the claim.');
  }
  done(claimId, 'saved');
}

export async function submitWarrantyClaimForApprovalFormAction(formData: FormData) {
  const claimId = str(formData, 'claimId');
  try {
    await submitWarrantyClaimForApproval(claimId);
  } catch (err) {
    fail(`/warranty/claims/${claimId}`, err, 'Could not send the claim for approval.');
  }
  done(claimId, 'sent_for_approval');
}

export async function approveWarrantyClaimFormAction(formData: FormData) {
  const claimId = str(formData, 'claimId');
  try {
    await approveWarrantyClaim(claimId);
  } catch (err) {
    fail(`/warranty/claims/${claimId}`, err, 'Could not approve the claim.');
  }
  done(claimId, 'approved');
}

export async function sendBackWarrantyClaimFormAction(formData: FormData) {
  const claimId = str(formData, 'claimId');
  try {
    await sendBackWarrantyClaim(claimId, str(formData, 'reason'));
  } catch (err) {
    fail(`/warranty/claims/${claimId}`, err, 'Could not send the claim back.');
  }
  done(claimId, 'sent_back');
}

export async function markWarrantyClaimSubmittedFormAction(formData: FormData) {
  const claimId = str(formData, 'claimId');
  try {
    await markWarrantyClaimSubmitted(claimId, str(formData, 'providerReference'));
  } catch (err) {
    fail(`/warranty/claims/${claimId}`, err, 'Could not record the submission.');
  }
  done(claimId, 'submitted');
}

export async function recordWarrantyClaimDecisionFormAction(formData: FormData) {
  const claimId = str(formData, 'claimId');
  const decision = str(formData, 'decision') as 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'REJECTED';
  try {
    await recordWarrantyClaimDecision(claimId, decision, str(formData, 'approvedAmount') ? num(formData, 'approvedAmount') : undefined, str(formData, 'notes'));
  } catch (err) {
    fail(`/warranty/claims/${claimId}`, err, 'Could not record the decision.');
  }
  done(claimId, 'decision_recorded');
}

export async function recordWarrantyClaimSettlementFormAction(formData: FormData) {
  const claimId = str(formData, 'claimId');
  try {
    await recordWarrantyClaimSettlement(claimId, num(formData, 'amount'), str(formData, 'reference'));
  } catch (err) {
    fail(`/warranty/claims/${claimId}`, err, 'Could not record the settlement.');
  }
  done(claimId, 'settled');
}

export async function reopenRejectedWarrantyClaimFormAction(formData: FormData) {
  const claimId = str(formData, 'claimId');
  try {
    await reopenRejectedWarrantyClaim(claimId, str(formData, 'reason'));
  } catch (err) {
    fail(`/warranty/claims/${claimId}`, err, 'Could not reopen the claim.');
  }
  done(claimId, 'reopened');
}

export async function cancelWarrantyClaimFormAction(formData: FormData) {
  const claimId = str(formData, 'claimId');
  try {
    await cancelWarrantyClaim(claimId, str(formData, 'reason'));
  } catch (err) {
    fail(`/warranty/claims/${claimId}`, err, 'Could not cancel the claim.');
  }
  done(claimId, 'cancelled');
}

export async function recordFailedPartSentFormAction(formData: FormData) {
  const claimId = str(formData, 'claimId');
  try {
    await recordFailedPartSent(claimId, str(formData, 'reference'));
  } catch (err) {
    fail(`/warranty/claims/${claimId}`, err, 'Could not record the part as sent.');
  }
  done(claimId, 'part_sent');
}

export async function recordFailedPartReceivedFormAction(formData: FormData) {
  const claimId = str(formData, 'claimId');
  try {
    await recordFailedPartReceived(claimId);
  } catch (err) {
    fail(`/warranty/claims/${claimId}`, err, 'Could not record the part as received.');
  }
  done(claimId, 'part_received');
}

export async function recordReplacementReceivedFormAction(formData: FormData) {
  const claimId = str(formData, 'claimId');
  try {
    await recordReplacementReceived(claimId, str(formData, 'replacementSerial'), str(formData, 'notes'));
  } catch (err) {
    fail(`/warranty/claims/${claimId}`, err, 'Could not record the replacement.');
  }
  done(claimId, 'settled');
}

export async function recordRepairedPartReturnedFormAction(formData: FormData) {
  const claimId = str(formData, 'claimId');
  try {
    await recordRepairedPartReturned(claimId, str(formData, 'notes'));
  } catch (err) {
    fail(`/warranty/claims/${claimId}`, err, 'Could not record the repaired part.');
  }
  done(claimId, 'settled');
}
