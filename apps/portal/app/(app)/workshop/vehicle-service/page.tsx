import { guardAnyPage, allows } from '@/lib/authz/server';
import { headers } from 'next/headers';
import { getVehicleServiceOutcomes } from '@/lib/actions/visit-outcomes';
import { OutcomeFilterTabs } from '@/components/OutcomeFilterTabs';
import { matchesOutcomeFilter, outcomeBadge, parseOutcomeFilter, OUTCOME_FILTERS } from '@/lib/visit-outcome';
import { pluralize } from '@/lib/utils/pluralize';
import { auth } from '@/lib/auth';
import { prisma } from '@ejo/database';
import { listVehicleServices, listVehiclesDueForService } from '@/lib/actions/vehicle-service';
import { currentUserIsMasterAdmin } from '@/lib/actions/workshop';
import { getWorkshopBranchId } from '@/lib/workshop-core';
import { createVehicleServiceFormAction, updatePrimaryServiceIntervalFormAction } from '@/lib/actions/vehicle-service-form-handlers';
import { CustomerVehiclePicker } from '@/components/CustomerVehiclePicker';
import { CategoryFilterTabs } from '@/components/CategoryFilterTabs';
import { LoadingLink } from '@/components/LoadingLink';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { SubmitButton } from '@/components/SubmitButton';
import { ServiceComplaintListInput } from '@/components/ServiceComplaintListInput';
import { formatDateOnly } from '@/lib/utils/format-date';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { BackLink, PageTitle, StatusChip } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';

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

/**
 * Reception opens the visit (customer, vehicle, mileage, reason); the
 * supervisor decides the work after inspection. CustomerVehiclePicker
 * includes the supervisor picker, filtered by vehicle type, as on Job Cards.
 */
export default async function VehicleServicePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; error?: string; status?: string; editInterval?: string; outcome?: string }>;
}) {
  await guardAnyPage(['workshop.view'], '/workshop');
  const { q, type, error, status, editInterval, outcome: rawOutcome } = await searchParams;
  // Customer names link to their Customers (CRM) page for those who may open it.
  const canSeeCustomers = await allows('crm.view');
  const outcomeFilter = parseOutcomeFilter(rawOutcome);
  const vehicleType = type === 'PASSENGER' || type === 'COMMERCIAL' ? type : undefined;
  const [branchId, session] = await Promise.all([
    getWorkshopBranchId().catch(() => null),
    auth.api.getSession({ headers: await headers() }),
  ]);
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
  // How each service ended — completed normally, cancelled (refunded or
  // not), or escalated. Works alongside the Passenger / Commercial filter.
  const outcomes = await getVehicleServiceOutcomes(services.map((s: (typeof services)[number]) => s.id));
  const outcomeCounts = Object.fromEntries(
    OUTCOME_FILTERS.map((f) => [f.key, services.filter((s: (typeof services)[number]) => outcomes[s.id] && matchesOutcomeFilter(f.key, outcomes[s.id]!.outcome, outcomes[s.id]!.refund)).length]),
  );
  const shown = outcomeFilter ? services.filter((s: (typeof services)[number]) => outcomes[s.id] && matchesOutcomeFilter(outcomeFilter, outcomes[s.id]!.outcome, outcomes[s.id]!.refund)) : services;

  return (
    <div className="p-8">
      <BackLink href="/workshop" label="Back to Workshop" className="mb-4" />
      <div className="mb-2 flex items-center justify-between">
        <PageTitle icon="droplet">Vehicle Service</PageTitle>
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
              {organisation.primaryServiceIntervalDays ? pluralize(organisation.primaryServiceIntervalDays, 'day') : null}
              {!organisation.primaryServiceIntervalKm && !organisation.primaryServiceIntervalDays ? 'Not set — click to set' : ''}
            </LoadingLink>
          )
        ) : null}
      </div>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Routine maintenance and minor customer requests: oil, filters, brake adjustment, AC top-up. If a
        technician finds a repair job, escalate it to a Job Card from the service page instead of
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
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Vehicles due for service</h2>
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
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${v.status === 'OVERDUE' ? 'bg-[var(--ejo-error)]' : 'bg-[var(--ejo-warning)]'}`} aria-hidden="true" />
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
      <OutcomeFilterTabs basePath="/workshop/vehicle-service" current={outcomeFilter} preserveParams={{ q, type: vehicleType }} counts={outcomeCounts} />

      <form className="mb-6 flex gap-2" action="/workshop/vehicle-service">
        {vehicleType ? <input type="hidden" name="type" value={vehicleType} /> : null}
        <LiveSearchInput
          type="search" name="q"
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
          {shown.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--ejo-text-muted)]">
              {q || vehicleType || outcomeFilter ? 'No Vehicle Service matches this search or filter.' : 'No Vehicle Service records yet.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-3 font-medium">Service No.</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Outcome</th>
                  <th className="px-4 py-3 font-medium">Opened</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s: (typeof services)[number]) => (
                  <tr key={s.id} className="border-b border-[var(--ejo-border)] last:border-0 hover:bg-[var(--ejo-bg)]">
                    <td className="px-4 py-3">
                      <LoadingLink href={`/workshop/vehicle-service/${s.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                        {s.serviceNumber}
                      </LoadingLink>
                      {s.escalatedToJobCard ? (
                        <LoadingLink
                          href={`/workshop/job-cards/${s.escalatedToJobCard.id}`}
                          className="mt-1 block w-fit rounded-full bg-[var(--ejo-warning)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-warning)] hover:underline"
                          title="Escalated — the work continues on this Job Card"
                        >
                          Escalated → {s.escalatedToJobCard.jobNumber}
                        </LoadingLink>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[var(--ejo-text)]"><CustomerLink id={s.customerId} name={s.customer.fullName} canView={canSeeCustomers} /></td>
                    <td className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      <LoadingLink href={`/workshop/vehicles/${s.vehicle.id}/edit`} className="hover:underline hover:text-[var(--ejo-text)]">
                        {[s.vehicle.make, s.vehicle.model].filter(Boolean).join(' ') || '—'}
                        {s.vehicle.plateNumber ? ` — ${s.vehicle.plateNumber}` : ''}
                      </LoadingLink>
                    </td>
                    <td className="px-4 py-3">
                      {s.escalatedToJobCard ? <StatusChip tone="warning">Escalated</StatusChip> : <StatusChip status={s.status} label={STATUS_LABEL[s.status]} />}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const o = outcomes[s.id];
                        const badge = o ? outcomeBadge(o.outcome, o.refund) : null;
                        return badge ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span> : <span className="text-xs text-[var(--ejo-text-muted)]">In progress</span>;
                      })()}
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
