'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  openServiceJob, assignServiceTechnician, recordServiceDiagnosis, recordServicePartUsed, markServiceAwaitingParts, resumeServiceRepair,
  recordServiceResolution, recordServiceQa, returnServiceUnit, closeServiceJob, cancelServiceJob, quoteServiceJob, recordServiceJobPayment,
  setServiceCostCentre, recordWarrantyLedgerEntry, type OpenServiceJobInput,
} from './service';

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function num(formData: FormData, key: string): number {
  const n = Number(str(formData, key).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}
function fail(path: string, err: unknown, fallback: string): never {
  const message = friendlyError(err, fallback, 'service-form-handlers');
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}
function done(jobId: string, status: string): never {
  revalidatePath(`/service/jobs/${jobId}`);
  revalidatePath('/service/jobs');
  revalidatePath('/service');
  redirect(`/service/jobs/${jobId}?status=${status}`);
}

/** /service/jobs/new → the job page (status=opened). */
export async function openServiceJobFormAction(formData: FormData) {
  const serial = str(formData, 'serialNumber');
  const input: OpenServiceJobInput = {
    serialNumber: serial,
    fault: str(formData, 'fault'),
    productName: str(formData, 'productName') || undefined,
    customerId: str(formData, 'customerId') || undefined,
    kind: (['WARRANTY', 'PAID', 'GOODWILL'].includes(str(formData, 'kind')) ? str(formData, 'kind') : undefined) as OpenServiceJobInput['kind'],
  };
  let id = '';
  try {
    id = (await openServiceJob(input)).id;
  } catch (err) {
    fail(`/service/jobs/new?serial=${encodeURIComponent(serial)}`, err, 'Could not open the service job.');
  }
  done(id, 'opened');
}

export async function assignServiceTechnicianFormAction(formData: FormData) {
  const jobId = str(formData, 'jobId');
  try { await assignServiceTechnician(jobId, str(formData, 'technicianId')); } catch (err) { fail(`/service/jobs/${jobId}`, err, 'Could not assign the technician.'); }
  done(jobId, 'assigned');
}

export async function recordServiceDiagnosisFormAction(formData: FormData) {
  const jobId = str(formData, 'jobId');
  try { await recordServiceDiagnosis(jobId, str(formData, 'diagnosis')); } catch (err) { fail(`/service/jobs/${jobId}`, err, 'Could not record the diagnosis.'); }
  done(jobId, 'diagnosed');
}

export async function recordServicePartUsedFormAction(formData: FormData) {
  const jobId = str(formData, 'jobId');
  const cost = str(formData, 'unitCost');
  try { await recordServicePartUsed(jobId, str(formData, 'partId'), num(formData, 'quantity'), cost ? num(formData, 'unitCost') : undefined); } catch (err) { fail(`/service/jobs/${jobId}`, err, 'Could not record the part.'); }
  done(jobId, 'part_recorded');
}

export async function markServiceAwaitingPartsFormAction(formData: FormData) {
  const jobId = str(formData, 'jobId');
  try { await markServiceAwaitingParts(jobId, str(formData, 'note')); } catch (err) { fail(`/service/jobs/${jobId}`, err, 'Could not mark the job as awaiting parts.'); }
  done(jobId, 'awaiting_parts');
}

export async function resumeServiceRepairFormAction(formData: FormData) {
  const jobId = str(formData, 'jobId');
  try { await resumeServiceRepair(jobId); } catch (err) { fail(`/service/jobs/${jobId}`, err, 'Could not resume the repair.'); }
  done(jobId, 'repairing');
}

export async function recordServiceResolutionFormAction(formData: FormData) {
  const jobId = str(formData, 'jobId');
  try { await recordServiceResolution(jobId, str(formData, 'resolution')); } catch (err) { fail(`/service/jobs/${jobId}`, err, 'Could not record the resolution.'); }
  done(jobId, 'sent_to_qa');
}

export async function recordServiceQaFormAction(formData: FormData) {
  const jobId = str(formData, 'jobId');
  const passed = str(formData, 'result') === 'PASS';
  try { await recordServiceQa(jobId, passed, str(formData, 'note')); } catch (err) { fail(`/service/jobs/${jobId}`, err, 'Could not record the quality check.'); }
  done(jobId, passed ? 'qa_passed' : 'qa_failed');
}

export async function returnServiceUnitFormAction(formData: FormData) {
  const jobId = str(formData, 'jobId');
  try { await returnServiceUnit(jobId, str(formData, 'collectedBy')); } catch (err) { fail(`/service/jobs/${jobId}`, err, 'Could not return the unit.'); }
  done(jobId, 'returned');
}

export async function closeServiceJobFormAction(formData: FormData) {
  const jobId = str(formData, 'jobId');
  try { await closeServiceJob(jobId); } catch (err) { fail(`/service/jobs/${jobId}`, err, 'Could not close the job.'); }
  done(jobId, 'closed');
}

export async function cancelServiceJobFormAction(formData: FormData) {
  const jobId = str(formData, 'jobId');
  try { await cancelServiceJob(jobId, str(formData, 'reason')); } catch (err) { fail(`/service/jobs/${jobId}`, err, 'Could not cancel the job.'); }
  done(jobId, 'cancelled');
}

export async function quoteServiceJobFormAction(formData: FormData) {
  const jobId = str(formData, 'jobId');
  try { await quoteServiceJob(jobId, num(formData, 'amount')); } catch (err) { fail(`/service/jobs/${jobId}`, err, 'Could not save the quotation.'); }
  done(jobId, 'quoted');
}

export async function recordServiceJobPaymentFormAction(formData: FormData) {
  const jobId = str(formData, 'jobId');
  try { await recordServiceJobPayment(jobId, num(formData, 'amount'), str(formData, 'reference')); } catch (err) { fail(`/service/jobs/${jobId}`, err, 'Could not record the payment.'); }
  done(jobId, 'payment_recorded');
}

export async function setServiceCostCentreFormAction(formData: FormData) {
  const jobId = str(formData, 'jobId');
  try { await setServiceCostCentre(jobId, str(formData, 'costCentre')); } catch (err) { fail(`/service/jobs/${jobId}`, err, 'Could not set the cost centre.'); }
  done(jobId, 'cost_centre_set');
}

export async function recordWarrantyLedgerEntryFormAction(formData: FormData) {
  const jobId = str(formData, 'jobId');
  try { await recordWarrantyLedgerEntry(jobId, str(formData, 'costCentre'), num(formData, 'amount'), str(formData, 'note')); } catch (err) { fail(`/service/jobs/${jobId}`, err, 'Could not record the ledger entry.'); }
  revalidatePath('/service/ledger');
  done(jobId, 'ledger_recorded');
}
