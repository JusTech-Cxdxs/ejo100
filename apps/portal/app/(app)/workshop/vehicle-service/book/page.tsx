import { guardAnyPage, allows } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getVehicle, listEligibleSupervisorsForVehicleType } from '@/lib/actions/workshop';
import { getVehicleServiceHealth } from '@/lib/actions/vehicle-service';
import { createVehicleServiceFormAction } from '@/lib/actions/vehicle-service-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { ServiceComplaintListInput } from '@/components/ServiceComplaintListInput';
import { formatDateOnly } from '@/lib/utils/format-date';
import { PageHeader } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';

/**
 * "Customer is back" — book a known vehicle straight in for its next
 * service. Opened from the Service Tracker, custody or the vehicle page,
 * so the customer and vehicle are already known and locked; the
 * supervisor list is already filtered to this vehicle's department.
 * Submits to the normal Vehicle Service creation, nothing separate.
 */
export default async function BookVehicleServicePage({ searchParams }: { searchParams: Promise<{ vehicleId?: string }> }) {
  await guardAnyPage(['workshop.view'], '/workshop');
  const { vehicleId } = await searchParams;
  if (!vehicleId) notFound();
  const vehicle = await getVehicle(vehicleId);
  if (!vehicle) notFound();
  // Customer names link to their Customers (CRM) page for those who may open it.
  const canSeeCustomers = await allows('crm.view');
  const [health, supervisorResult] = await Promise.all([
    getVehicleServiceHealth(vehicle.id),
    vehicle.vehicleType ? listEligibleSupervisorsForVehicleType(vehicle.vehicleType) : Promise.resolve(null),
  ]);
  const description = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle';

  return (
    <div className="p-8">
      <PageHeader
        icon="calendar"
        back={{ href: "/workshop/service-tracker", label: "Back to Service Tracker" }}
        title="Book in for service"
        description={<>{description}
        {vehicle.plateNumber ? ` — ${vehicle.plateNumber}` : ''} · <CustomerLink id={vehicle.customerId} name={vehicle.customer.fullName} canView={canSeeCustomers} /></>}
      />

      {health?.inWorkshop ? (
        <div className="max-w-xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-info)]/40 bg-[var(--ejo-info)]/10 p-5 text-sm text-[var(--ejo-text)]">
          This vehicle is already in the workshop on{' '}
          <LoadingLink
            href={health.inWorkshop.kind === 'JOB_CARD' ? `/workshop/job-cards/${health.inWorkshop.id}` : `/workshop/vehicle-service/${health.inWorkshop.id}`}
            className="font-medium text-[var(--ejo-primary)] hover:underline"
          >
            {health.inWorkshop.number}
          </LoadingLink>
          . Finish or close that visit before booking it in again.
        </div>
      ) : !vehicle.vehicleType ? (
        <div className="max-w-xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 p-5 text-sm text-[var(--ejo-text)]">
          This vehicle has no type (Passenger / Commercial) set, so no supervisor can be matched.{' '}
          <LoadingLink href={`/workshop/vehicles/${vehicle.id}/edit?edit=true`} className="font-medium text-[var(--ejo-primary)] hover:underline">
            Set the vehicle type
          </LoadingLink>{' '}
          first.
        </div>
      ) : (
        <div className="grid max-w-3xl gap-6 md:grid-cols-[1fr_280px]">
          <form action={createVehicleServiceFormAction} className="space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <FormPendingOverlay />
            <input type="hidden" name="customerId" value={vehicle.customerId} />
            <input type="hidden" name="vehicleId" value={vehicle.id} />
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Supervisor</label>
              <select
                name="supervisorId"
                required
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              >
                {(supervisorResult?.supervisors ?? []).map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.fullName}
                  </option>
                ))}
              </select>
              {supervisorResult?.usingFallback ? (
                <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">No Workshop Supervisor is set up for this department yet — an administrator is listed instead.</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Mileage at check-in (km)</label>
              <input
                name="mileageAtCheckIn"
                type="number"
                min={vehicle.mileage ?? 0}
                placeholder={vehicle.mileage != null ? `Last recorded: ${vehicle.mileage.toLocaleString('en-NG')} km` : undefined}
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Reason for visit</label>
              <ServiceComplaintListInput />
            </div>
            <SubmitButton
              label="Open Vehicle Service"
              pendingLabel="Opening…"
              className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
          </form>

          {health ? (
            <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 text-xs">
              <p className="font-semibold text-[var(--ejo-text)]">Service history</p>
              <p className="mt-2 text-[var(--ejo-text-muted)]">
                Last service{' '}
                <LoadingLink href={`/workshop/vehicle-service/${health.serviceId}`} className="text-[var(--ejo-primary)] hover:underline">
                  {health.serviceNumber}
                </LoadingLink>
                {health.primaryServiceDate ? ` on ${formatDateOnly(health.primaryServiceDate)}` : ''}
                {health.primaryServiceMileage != null ? ` at ${health.primaryServiceMileage.toLocaleString('en-NG')} km` : ''}.
              </p>
              <p className="mt-1 text-[var(--ejo-text-muted)]">
                Was due {health.nextServiceDueOdometer != null ? `${health.nextServiceDueOdometer.toLocaleString('en-NG')} km` : ''}
                {health.nextServiceDueOdometer != null && health.nextServiceDueDate ? ' or ' : ''}
                {health.nextServiceDueDate ? formatDateOnly(health.nextServiceDueDate) : ''}.
              </p>
              <p className="mt-1 text-[var(--ejo-text-muted)]">Reminders sent this cycle: {health.remindersSentThisCycle}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
