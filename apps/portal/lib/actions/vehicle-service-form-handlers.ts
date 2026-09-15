'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createVehicleService,
  updateVehicleServiceStatus,
  escalateVehicleServiceToJobCard,
  createServiceType,
} from './vehicle-service';

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
function num(formData: FormData, key: string): number | undefined {
  const value = str(formData, key);
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function createVehicleServiceFormAction(formData: FormData) {
  const customerId = str(formData, 'customerId');
  const vehicleId = str(formData, 'vehicleId');
  let serviceId = '';
  try {
    const serviceTypeIds = formData.getAll('serviceTypeIds').filter((v): v is string => typeof v === 'string');
    const customerComplaints = formData.getAll('customerComplaints').filter((v): v is string => typeof v === 'string');
    const result = await createVehicleService({
      customerId,
      vehicleId,
      customerComplaints,
      serviceTypeIds,
    });
    serviceId = result.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not open this Vehicle Service.';
    redirect(`/workshop/vehicle-service?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/workshop/vehicle-service');
  redirect(`/workshop/vehicle-service/${serviceId}`);
}

export async function updateVehicleServiceStatusFormAction(formData: FormData) {
  const serviceId = str(formData, 'serviceId');
  const newStatus = str(formData, 'newStatus') as 'CHECKED_IN' | 'IN_SERVICE' | 'COMPLETED' | 'COLLECTED' | 'CANCELLED';
  try {
    await updateVehicleServiceStatus(serviceId, newStatus, {
      odometerAtService: num(formData, 'odometerAtService'),
      technicianNotes: str(formData, 'technicianNotes') || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update this Vehicle Service.';
    redirect(`/workshop/vehicle-service/${serviceId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${serviceId}`);
  redirect(`/workshop/vehicle-service/${serviceId}?status=updated`);
}

export async function escalateVehicleServiceFormAction(formData: FormData) {
  const serviceId = str(formData, 'serviceId');
  const supervisorId = str(formData, 'supervisorId');
  let jobCardId = '';
  try {
    const result = await escalateVehicleServiceToJobCard(serviceId, supervisorId, str(formData, 'additionalComplaint') || undefined);
    jobCardId = result.jobCardId;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not escalate this Vehicle Service.';
    redirect(`/workshop/vehicle-service/${serviceId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${serviceId}`);
  redirect(`/workshop/job-cards/${jobCardId}`);
}

export async function createServiceTypeFormAction(formData: FormData) {
  const organisationId = str(formData, 'organisationId');
  try {
    await createServiceType(organisationId, {
      name: str(formData, 'name'),
      category: str(formData, 'category'),
      intervalKm: num(formData, 'intervalKm'),
      intervalDays: num(formData, 'intervalDays'),
      isPrimary: formData.get('isPrimary') === 'on',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create this Service Type.';
    redirect(`/workshop/vehicle-service/service-types?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/workshop/vehicle-service/service-types');
  redirect('/workshop/vehicle-service/service-types?status=created');
}
