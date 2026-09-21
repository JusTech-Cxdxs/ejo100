'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createVehicleService,
  updateVehicleServiceStatus,
  escalateVehicleServiceToJobCard,
  approveVehicleService,
  rejectVehicleService,
  assignTechnicianToVehicleService,
  acceptVehicleServiceTechnicianAssignment,
  rejectVehicleServiceTechnicianAssignment,
  deleteVehicleService,
  updatePrimaryServiceInterval,
  attendToOverdueVehicle,
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

export async function acceptVehicleServiceTechnicianAssignmentFormAction(formData: FormData) {
  const serviceId = str(formData, 'serviceId');
  try {
    await acceptVehicleServiceTechnicianAssignment(serviceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not accept assignment.';
    redirect(`/workshop/vehicle-service/${serviceId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${serviceId}`);
  redirect(`/workshop/vehicle-service/${serviceId}?status=assignment_accepted`);
}

export async function rejectVehicleServiceTechnicianAssignmentFormAction(formData: FormData) {
  const serviceId = str(formData, 'serviceId');
  try {
    await rejectVehicleServiceTechnicianAssignment(serviceId, str(formData, 'reason'));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not reject assignment.';
    redirect(`/workshop/vehicle-service/${serviceId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/workshop/vehicle-service/${serviceId}`);
  redirect(`/workshop/vehicle-service/${serviceId}?status=assignment_rejected`);
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
      primaryServiceCompleted: formData.get('primaryServiceCompleted') === 'on',
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

export async function updatePrimaryServiceIntervalFormAction(formData: FormData) {
  const organisationId = str(formData, 'organisationId');
  try {
    await updatePrimaryServiceInterval(organisationId, num(formData, 'primaryServiceIntervalKm'), num(formData, 'primaryServiceIntervalDays'));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update the Primary Service interval.';
    redirect(`/workshop/vehicle-service?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/workshop/vehicle-service');
  redirect('/workshop/vehicle-service?status=interval_updated');
}

export async function attendToOverdueVehicleFormAction(formData: FormData) {
  const serviceId = str(formData, 'serviceId');
  try {
    await attendToOverdueVehicle(serviceId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not attend to this vehicle.';
    redirect(`/workshop/vehicle-service-custody?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/workshop/vehicle-service-custody');
  redirect('/workshop/vehicle-service-custody?filter=overdue&status=attended');
}
