'use server';

/**
 * Thin <form action={...}> wrappers around lib/actions/workshop.ts.
 * Deliberately using native React 19 form actions (FormData in, redirect
 * or revalidatePath out) rather than react-hook-form + Zod — neither is
 * an installed dependency yet, and every new dependency added to this
 * monorepo this project has needed a full, careful deploy-verification
 * cycle. Adding real client-side validation is a good, deliberate next
 * step, not something to fold silently into this pass.
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
  await findOrCreateCustomer({
    fullName: str(formData, 'fullName'),
    email: str(formData, 'email'),
    phone: str(formData, 'phone') || undefined,
  });
  revalidatePath('/workshop/customers');
}

export async function createVehicleFormAction(formData: FormData) {
  await createVehicle({
    customerId: str(formData, 'customerId'),
    make: str(formData, 'make') || undefined,
    model: str(formData, 'model') || undefined,
    year: num(formData, 'year'),
    plateNumber: str(formData, 'plateNumber') || undefined,
    chassisNumber: str(formData, 'chassisNumber') || undefined,
    mileage: num(formData, 'mileage'),
  });
  revalidatePath('/workshop/vehicles');
}

export async function createJobCardFormAction(formData: FormData) {
  const jobCard = await createJobCard({
    customerId: str(formData, 'customerId'),
    vehicleId: str(formData, 'vehicleId'),
    complaint: str(formData, 'complaint'),
    mileageAtCheckIn: num(formData, 'mileageAtCheckIn'),
  });
  revalidatePath('/workshop/job-cards');
  redirect(`/workshop/job-cards/${jobCard.id}`);
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
