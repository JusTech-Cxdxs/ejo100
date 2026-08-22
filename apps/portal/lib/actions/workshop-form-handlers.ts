'use server';

/**
 * Thin <form action={...}> wrappers around lib/actions/workshop.ts.
 * Deliberately using native React 19 form actions (FormData in, redirect
 * or revalidatePath out) rather than react-hook-form + Zod — neither is
 * an installed dependency yet, and every new dependency added to this
 * monorepo this project has needed a full, careful deploy-verification
 * cycle. Adding real client-side validation is a good, deliberate next
 * step, not something to fold silently into this pass.
 *
 * Every create-action now redirects back to its list page carrying a
 * `?status=` (success) or `?error=` (failure) query param, which the
 * page reads server-side to render a FormFeedbackBanner. This is the
 * fix for "nothing visibly happens after clicking Add/Register" — the
 * SubmitButton component handles the *during* (spinner, disabled), this
 * handles the *after* (a real confirmation or a real error message,
 * instead of silence either way).
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { JobCardStatus } from '@ejo/database';
import {
  findOrCreateCustomer,
  createVehicle,
  createJobCard,
  updateJobCardStatus,
  assignTechnician,
  deleteVehicle,
  deleteJobCard,
} from './workshop';

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

export async function createCustomerFormAction(formData: FormData) {
  let query: string;
  try {
    const { wasExisting, welcomeEmailSent } = await findOrCreateCustomer({
      fullName: str(formData, 'fullName'),
      email: str(formData, 'email'),
      phone: str(formData, 'phone') || undefined,
    });
    revalidatePath('/workshop/customers');
    if (wasExisting) {
      query = 'status=customer_existing';
    } else if (welcomeEmailSent) {
      query = 'status=customer_created_emailed';
    } else {
      query = 'status=customer_created_no_email';
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not add customer.';
    redirect(`/workshop/customers?error=${encodeURIComponent(message)}`);
  }
  redirect(`/workshop/customers?${query}`);
}

export async function createVehicleFormAction(formData: FormData) {
  try {
    const vehicleTypeRaw = str(formData, 'vehicleType');
    await createVehicle({
      customerId: str(formData, 'customerId'),
      make: str(formData, 'make') || undefined,
      model: str(formData, 'model') || undefined,
      vehicleType: vehicleTypeRaw === 'PASSENGER' || vehicleTypeRaw === 'COMMERCIAL' ? vehicleTypeRaw : undefined,
      year: num(formData, 'year'),
      plateNumber: str(formData, 'plateNumber') || undefined,
      chassisNumber: str(formData, 'chassisNumber') || undefined,
      engineNumber: str(formData, 'engineNumber') || undefined,
      mileage: num(formData, 'mileage'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not register vehicle.';
    redirect(`/workshop/vehicles?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/workshop/vehicles');
  redirect('/workshop/vehicles?status=vehicle_created');
}

export async function createJobCardFormAction(formData: FormData) {
  let jobCardId: string;
  try {
    const jobCard = await createJobCard({
      customerId: str(formData, 'customerId'),
      vehicleId: str(formData, 'vehicleId'),
      complaints: formData.getAll('complaints').map((v) => String(v)),
      supervisorId: str(formData, 'supervisorId'),
      mileageAtCheckIn: num(formData, 'mileageAtCheckIn'),
    });
    jobCardId = jobCard.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not open Job Card.';
    redirect(`/workshop/job-cards?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/workshop/job-cards');
  redirect(`/workshop/job-cards/${jobCardId}?status=job_card_created`);
}

export async function updateJobCardStatusFormAction(formData: FormData) {
  const id = str(formData, 'jobCardId');
  const status = str(formData, 'status') as JobCardStatus;
  await updateJobCardStatus(id, status);
  revalidatePath(`/workshop/job-cards/${id}`);
  revalidatePath('/workshop/job-cards');
}

export async function assignTechnicianFormAction(formData: FormData) {
  const jobCardId = str(formData, 'jobCardId');
  const technicianId = str(formData, 'technicianId');
  if (!technicianId) return; // "Unassigned" placeholder selected — nothing to do
  await assignTechnician(jobCardId, technicianId);
  revalidatePath(`/workshop/job-cards/${jobCardId}`);
  revalidatePath('/workshop/job-cards');
}

export async function deleteVehicleFormAction(formData: FormData) {
  const vehicleId = str(formData, 'vehicleId');
  try {
    await deleteVehicle(vehicleId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not delete vehicle.';
    redirect(`/workshop/vehicles?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/workshop/vehicles');
  revalidatePath('/workshop/job-cards');
  redirect('/workshop/vehicles?status=vehicle_deleted');
}

/** `redirectTo` distinguishes the two places this can be triggered from:
 * the Job Cards list (stay on the list after deleting) vs. a specific
 * Job Card's own detail page (that page no longer exists afterward, so
 * it must redirect back to the list instead of trying to re-render). */
export async function deleteJobCardFormAction(formData: FormData) {
  const jobCardId = str(formData, 'jobCardId');
  try {
    await deleteJobCard(jobCardId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not delete Job Card.';
    redirect(`/workshop/job-cards?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/workshop/job-cards');
  redirect('/workshop/job-cards?status=job_card_deleted');
}
