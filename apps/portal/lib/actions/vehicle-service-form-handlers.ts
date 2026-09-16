'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createVehicleService,
  updateVehicleServiceStatus,
  escalateVehicleServiceToJobCard,
  createServiceType,
  addServiceItemsToVehicleService,
  approveVehicleService,
  rejectVehicleService,
  assignTechnicianToVehicleService,
  deleteVehicleService,
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
  const supervisorId = str(formData, 'supervisorId');
  let serviceId = '';
  try {
    const customerComplaints = formData.getAll('customerComplaints').filter((v): v is string => typeof v === 'string');
    const result = await createVehicleService({
      customerId,
      vehicleId,
      supervisorId,
      customerComplaints,
      mileageAtCheckIn: num(formData, 'mileageAtCheckIn'),
    });
    serviceId = result.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not open this Vehicle Service.';
    redirect(`/workshop/vehicle-service?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/workshop/vehicle-service');
  redirect(`/workshop/vehicle-service/${serviceId}`);
}

export async function approveVehicleServiceFormAction(formData: FormData) {
  const id = str(formData, 'serviceId');
  try {
    await approveVehicleService(id, str(formData, 'notes') || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not approve this Vehicle Service.';
    redirect(`/workshop/vehicle-service/${id}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${id}`);
}

export async function rejectVehicleServiceFormAction(formData: FormData) {
  const id = str(formData, 'serviceId');
  try {
    await rejectVehicleService(id, str(formData, 'reason'), str(formData, 'notes') || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not reject this Vehicle Service.';
    redirect(`/workshop/vehicle-service/${id}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${id}`);
}

export async function assignTechnicianToVehicleServiceFormAction(formData: FormData) {
  const serviceId = str(formData, 'serviceId');
  const technicianId = str(formData, 'technicianId');
  if (!technicianId) return; // "Unassigned" placeholder selected — nothing to do
  await assignTechnicianToVehicleService(serviceId, technicianId);
  revalidatePath(`/workshop/vehicle-service/${serviceId}`);
  revalidatePath('/workshop/vehicle-service');
}

export async function deleteVehicleServiceFormAction(formData: FormData) {
  const serviceId = str(formData, 'serviceId');
  try {
    await deleteVehicleService(serviceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not delete this Vehicle Service.';
    redirect(`/workshop/vehicle-service?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/workshop/vehicle-service');
  redirect('/workshop/vehicle-service?status=vehicle_service_deleted');
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

export async function addServiceItemsFormAction(formData: FormData) {
  const serviceId = str(formData, 'serviceId');
  const serviceTypeIds = formData.getAll('serviceTypeIds').filter((v): v is string => typeof v === 'string');
  if (serviceTypeIds.length === 0) {
    redirect(`/workshop/vehicle-service/${serviceId}?error=${encodeURIComponent('Select at least one item to add.')}`);
  }
  try {
    await addServiceItemsToVehicleService(serviceId, serviceTypeIds);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not add these items.';
    redirect(`/workshop/vehicle-service/${serviceId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${serviceId}`);
  redirect(`/workshop/vehicle-service/${serviceId}?status=items_added`);
}
