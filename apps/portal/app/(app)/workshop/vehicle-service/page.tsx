import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@ejo/database';
import { listVehicleServices, listVehiclesDueForService } from '@/lib/actions/vehicle-service';
import { getWorkshopBranchId, currentUserIsMasterAdmin } from '@/lib/actions/workshop';
import { createVehicleServiceFormAction, updatePrimaryServiceIntervalFormAction } from '@/lib/actions/vehicle-service-form-handlers';
import { CustomerVehiclePicker } from '@/components/CustomerVehiclePicker';
import { CategoryFilterTabs } from '@/components/CategoryFilterTabs';
import { LoadingLink } from '@/components/LoadingLink';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { SubmitButton } from '@/components/SubmitButton';
import { ServiceComplaintListInput } from '@/components/ServiceComplaintListInput';
import { formatDateOnly } from '@/lib/utils/format-date';

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  CHECKED_IN: 'Checked In',
  IN_SERVICE: 'In Service',
  COMPLETED: 'Completed',
  READY_FOR_COLLECTION: 'Ready for Collection',
  CLOSED: 'Closed',
  COLLECTED: 'Checked Out',
  CANCELLED: 'Cancelled',
  ESCALATED: 'Escalated to Job Card',
};
const STATUS_CLASS: Record<string, string> = {
  SCHEDULED: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  CHECKED_IN: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  IN_SERVICE: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  COMPLETED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  READY_FOR_COLLECTION: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  CLOSED: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
  COLLECTED: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  ESCALATED: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
  CANCELLED: 'bg-[var(--ejo-error)]/15 text-[var(--ejo-error)]',
};

/**
 * Reception opens the visit; a supervisor decides what work it
 * actually needs after inspecting the vehicle, from the service's own
 * detail page. This screen only ever records who came in, which
 * vehicle, the mileage, and why — the same real shape as Open Job
 * Card, on purpose. CustomerVehiclePicker already includes the real
 * supervisor picker, tied to the vehicle's own Passenger/Commercial
 * type — the exact same component Job Card creation uses.
 */
export default async function VehicleServicePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; error?: string; status?: string; editInterval?: string }>;
}) {
  const { q, type, error, status, editInterval } = await searchParams;
  const vehicleType = type === 'PASSENGER' || type === 'COMMERCIAL' ? type : undefined;
  const branchId = await getWorkshopBranchId().catch(() => null);
  const session = await auth.api.getSession({ headers: await headers() });
  const [isMasterAdmin, organisation] = await Promise.all([
    currentUserIsMasterAdmin(),
    session?.user?.id
      ? prisma.user.findUnique({ where: { id: session.user.id }, select: { organisationId: true } }).then((u: { organisationId: string | null } | null) =>
          u?.organisationId
            ? prisma.organisation.findUnique({ where: { id: u.organisationId }, select: { id: true, primaryServiceIntervalKm: true, primaryServiceIntervalDays: true } })
            : null,
        )
      : Promise.resolve(null),
  ]);
  const [services, dueVehicles] = await Promise.all([
    branchId ? listVehicleServices(branchId, q, vehicleType) : Promise.resolve([]),
    branchId ? listVehiclesDueForService(branchId) : Promise.resolve([]),
  ]);

  return (
    <div className="p-8">
      <LoadingLink
        href="/workshop"
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Workshop
      </LoadingLink>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Vehicle Service</h1>
        {isMasterAdmin && organisation ? (
          editInterval === 'true' ? (
            <form action={updatePrimaryServiceIntervalFormAction} className="flex flex-wrap items-end gap-2">
              <FormPendingOverlay />
              <input type="hidden" name="organisationId" value={organisation.id} />
              <div>
                <label className="mb-1 block text-[10px] text-[var(--ejo-text-muted)]">Every (km)</label>
                <input
                  name="primaryServiceIntervalKm"
                  type="number"
                  min="0"
                  defaultValue={organisation.primaryServiceIntervalKm ?? undefined}
                  placeholder="e.g. 10000"
                  className="w-28 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-[var(--ejo-text-muted)]">Every (days)</label>
                <input
                  name="primaryServiceIntervalDays"
                  type="number"
                  min="0"
                  defaultValue={organisation.primaryServiceIntervalDays ?? undefined}
                  placeholder="e.g. 180"
                  className="w-28 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                />
              </div>
              <SubmitButton
                label="Save"
                pendingLabel="Saving…"
                className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              />
            </form>
          ) : (
            <LoadingLink
              href="/workshop/vehicle-service?editInterval=true"
              className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
            >
              Primary Service every{' '}
              {organisation.primaryServiceIntervalKm ? `${organisation.primaryServiceIntervalKm.toLocaleString('en-NG')} km` : null}
              {organisation.primaryServiceIntervalKm && organisation.primaryServiceIntervalDays ? ' or ' : null}
              {organisation.primaryServiceIntervalDays ? `${organisation.primaryServiceIntervalDays} days` : null}
              {!organisation.primaryServiceIntervalKm && !organisation.primaryServiceIntervalDays ? 'Not set — click to set' : ''}
            </LoadingLink>
          )
        ) : null}
      </div>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Routine maintenance and minor customer requests — oil, filters, brake adjustment, AC top-up. If a
        technician finds a repair job along the way, send it to Job Card from the service page instead of
        handling it here.
      </p>

      {status === 'vehicle_service_deleted' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Vehicle Service deleted." />
        </div>
      ) : null}
      {status === 'interval_updated' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Primary Service interval updated." />
        </div>
      ) : null}
      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}

      {dueVehicles.length > 0 ? (
        <div className="mb-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Vehicles Due for Service</h2>
            <LoadingLink href="/workshop/service-tracker" className="text-xs text-[var(--ejo-primary)] hover:underline">
              Open Service Tracker
            </LoadingLink>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {dueVehicles.map((v: (typeof dueVehicles)[number]) => (
              <LoadingLink
                key={v.vehicleId}
                href={`/workshop/vehicles/${v.vehicleId}/edit`}
                className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2.5 text-sm hover:opacity-80"
              >
                <div className="flex items-center gap-1.5">
                  <span>{v.status === 'OVERDUE' ? '🔴' : '🟡'}</span>
                  <span className="font-medium text-[var(--ejo-text)]">{v.vehicleDescription}</span>
                  {v.plateNumber ? <span className="text-xs text-[var(--ejo-text-muted)]">— {v.plateNumber}</span> : null}
                </div>
                <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">
                  {v.customerName}
                  {v.inWorkshop ? ` · In workshop — ${v.inWorkshop.number}` : ''}
                </p>
              </LoadingLink>
            ))}
          </div>
        </div>
      ) : null}

      <CategoryFilterTabs basePath="/workshop/vehicle-service" currentType={vehicleType} preserveParams={{ q }} />

      <form className="mb-6 flex gap-2" action="/workshop/vehicle-service">
        {vehicleType ? <input type="hidden" name="type" value={vehicleType} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by service number, customer, or vehicle/VIN…"
          className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button
          type="submit"
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
        >
          Search
        </button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] overflow-x-auto">
          {services.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--ejo-text-muted)]">
              {q || vehicleType ? 'No Vehicle Service matches this search or filter.' : 'No Vehicle Service records yet.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-3 font-medium">Service No.</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Opened</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s: (typeof services)[number]) => (
                  <tr key={s.id} className="border-b border-[var(--ejo-border)] last:border-0 hover:bg-[var(--ejo-bg)]">
                    <td className="px-4 py-3">
                      <LoadingLink href={`/workshop/vehicle-service/${s.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                        {s.serviceNumber}
                      </LoadingLink>
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text)]">{s.customer.fullName}</td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      <LoadingLink href={`/workshop/vehicles/${s.vehicle.id}/edit`} className="hover:underline hover:text-[var(--ejo-text)]">
                        {[s.vehicle.make, s.vehicle.model].filter(Boolean).join(' ') || '—'}
                        {s.vehicle.plateNumber ? ` — ${s.vehicle.plateNumber}` : ''}
                      </LoadingLink>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          s.escalatedToJobCard ? 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]' : STATUS_CLASS[s.status]
                        }`}
                      >
                        {s.escalatedToJobCard ? 'Escalated' : STATUS_LABEL[s.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">{formatDateOnly(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 lg:sticky lg:top-6">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Open a Vehicle Service</h2>
          <form action={createVehicleServiceFormAction} className="mt-4 space-y-3">
            <FormPendingOverlay />
            <CustomerVehiclePicker />
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Mileage at check-in (km)</label>
              <input name="mileageAtCheckIn" type="number" min="0" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
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
        </div>
      </div>
    </div>
  );
}
