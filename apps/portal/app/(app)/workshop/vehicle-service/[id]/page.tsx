import { notFound } from 'next/navigation';
import { getVehicleService } from '@/lib/actions/vehicle-service';
import {
  updateVehicleServiceStatusFormAction,
  escalateVehicleServiceFormAction,
} from '@/lib/actions/vehicle-service-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { SupervisorPicker } from '@/components/SupervisorPicker';
import { formatDateTime, formatDateOnly } from '@/lib/utils/format-date';

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  CHECKED_IN: 'Checked In',
  IN_SERVICE: 'In Service',
  COMPLETED: 'Completed',
  COLLECTED: 'Collected',
  CANCELLED: 'Cancelled',
};

const NEXT_ACTION: Record<string, { status: string; label: string } | null> = {
  SCHEDULED: { status: 'CHECKED_IN', label: 'Check In Vehicle' },
  CHECKED_IN: { status: 'IN_SERVICE', label: 'Start Service' },
  IN_SERVICE: { status: 'COMPLETED', label: 'Complete Service' },
  COMPLETED: { status: 'COLLECTED', label: 'Mark Collected' },
  COLLECTED: null,
  CANCELLED: null,
};

export default async function VehicleServiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = await getVehicleService(id);
  if (!service) notFound();

  const nextAction = NEXT_ACTION[service.status];
  const canCancel = service.status === 'SCHEDULED' || service.status === 'CHECKED_IN' || service.status === 'IN_SERVICE';
  const canEscalate = !service.escalatedToJobCard && service.status !== 'COLLECTED' && service.status !== 'CANCELLED';

  return (
    <div className="p-8">
      <LoadingLink
        href="/workshop/vehicle-service"
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Vehicle Service
      </LoadingLink>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">{service.serviceNumber}</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{STATUS_LABEL[service.status]}</p>
        </div>
      </div>

      {service.escalatedToJobCard ? (
        <div className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-4 text-sm">
          A real repair was found beyond routine maintenance — this visit was escalated to{' '}
          <LoadingLink href={`/workshop/job-cards/${service.escalatedToJobCard.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
            Job Card {service.escalatedToJobCard.jobNumber}
          </LoadingLink>
          , which now carries the real repair forward.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Customer &amp; Vehicle</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Customer</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">{service.customer.fullName}</dd>
              </div>
              <div>
                <dt className="text-[var(--ejo-text-muted)]">Vehicle</dt>
                <dd className="mt-0.5 font-medium text-[var(--ejo-text)]">
                  {[service.vehicle.year, service.vehicle.make, service.vehicle.model].filter(Boolean).join(' ') || '—'}
                  {service.vehicle.plateNumber ? ` — ${service.vehicle.plateNumber}` : ''}
                </dd>
              </div>
              {service.complaints.length > 0 ? (
                <div className="col-span-2">
                  <dt className="text-[var(--ejo-text-muted)]">Customer&apos;s Requests</dt>
                  <dd className="mt-1 space-y-1">
                    {service.complaints.map((c: (typeof service.complaints)[number]) => (
                      <p key={c.id} className="flex gap-2 text-sm text-[var(--ejo-text)]">
                        <span className="text-[var(--ejo-text-muted)]">{c.sequenceNumber}.</span> {c.description}
                      </p>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Service Items</h2>
            {service.items.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No service items recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-1.5 text-sm">
                {service.items.map((item: (typeof service.items)[number]) => (
                  <li key={item.id} className="flex items-center justify-between rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] px-3 py-2">
                    <span className="text-[var(--ejo-text)]">{item.serviceType.name}</span>
                    <span className="text-xs text-[var(--ejo-text-muted)]">{item.serviceType.category}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(service.nextServiceDueOdometer || service.nextServiceDueDate) ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-info)]/30 bg-[var(--ejo-info)]/5 p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Next Service Due</h2>
              <p className="mt-2 text-sm text-[var(--ejo-text)]">
                {service.nextServiceDueOdometer ? `${service.nextServiceDueOdometer.toLocaleString('en-NG')} km` : null}
                {service.nextServiceDueOdometer && service.nextServiceDueDate ? ' or ' : null}
                {service.nextServiceDueDate ? formatDateOnly(service.nextServiceDueDate) : null}
                {' — whichever comes first.'}
              </p>
            </div>
          ) : null}

          {service.technicianNotes ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Technician Notes</h2>
              <p className="mt-2 text-sm text-[var(--ejo-text)]">{service.technicianNotes}</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          {nextAction ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-text)]">{nextAction.label}</h2>
              <form action={updateVehicleServiceStatusFormAction} className="mt-3 space-y-3">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <input type="hidden" name="newStatus" value={nextAction.status} />
                {nextAction.status === 'CHECKED_IN' ? (
                  <div>
                    <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Odometer (km)</label>
                    <input
                      name="odometerAtService"
                      type="number"
                      min="0"
                      placeholder={service.vehicle.mileage ? String(service.vehicle.mileage) : 'e.g. 52430'}
                      className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                    />
                  </div>
                ) : null}
                {nextAction.status === 'COMPLETED' ? (
                  <div>
                    <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Technician Notes</label>
                    <textarea
                      name="technicianNotes"
                      rows={3}
                      placeholder="What was actually done…"
                      className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                    />
                  </div>
                ) : null}
                <SubmitButton
                  label={nextAction.label}
                  pendingLabel="Saving…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            </div>
          ) : null}

          {canEscalate ? (
            <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 p-5">
              <h2 className="text-sm font-semibold text-[var(--ejo-error)]">Found a Real Repair?</h2>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Something beyond routine maintenance leaves Vehicle Service entirely and becomes a real Job Card.
              </p>
              <form action={escalateVehicleServiceFormAction} className="mt-3 space-y-3">
                <FormPendingOverlay />
                <input type="hidden" name="serviceId" value={service.id} />
                <SupervisorPicker vehicleType={service.vehicle.vehicleType} />
                <textarea
                  name="additionalComplaint"
                  rows={2}
                  placeholder="What did the technician actually find…"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <SubmitButton
                  label="Escalate to Job Card"
                  pendingLabel="Escalating…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            </div>
          ) : null}

          {canCancel ? (
            <form action={updateVehicleServiceStatusFormAction}>
              <FormPendingOverlay />
              <input type="hidden" name="serviceId" value={service.id} />
              <input type="hidden" name="newStatus" value="CANCELLED" />
              <button type="submit" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]">
                Cancel this Vehicle Service
              </button>
            </form>
          ) : null}

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Opened</dt>
                <dd className="text-[var(--ejo-text)]">{formatDateTime(service.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ejo-text-muted)]">Opened By</dt>
                <dd className="text-[var(--ejo-text)]">{service.createdBy.fullName}</dd>
              </div>
              {service.odometerAtService ? (
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Odometer</dt>
                  <dd className="text-[var(--ejo-text)]">{service.odometerAtService.toLocaleString('en-NG')} km</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
