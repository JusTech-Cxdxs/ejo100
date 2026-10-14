import { FormJumpLink } from '@/components/ui/FormJumpLink';
import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import { guardAnyPage, allows } from '@/lib/authz/server';
import { OrgTrail } from '@/components/OrgTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { getJobCardOutcomes } from '@/lib/actions/visit-outcomes';
import { OutcomeFilterTabs } from '@/components/OutcomeFilterTabs';
import { matchesOutcomeFilter, outcomeBadge, parseOutcomeFilter, OUTCOME_FILTERS } from '@/lib/visit-outcome';
import { listJobCards } from '@/lib/actions/workshop';
import { createJobCardFormAction } from '@/lib/actions/workshop-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { CustomerVehiclePicker } from '@/components/CustomerVehiclePicker';
import { CategoryFilterTabs } from '@/components/CategoryFilterTabs';
import { ComplaintListInput } from '@/components/ComplaintListInput';
import { BinnedNotice } from '@/components/RecycleBinPanel';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { BackLink, PageHeader, StatusChip } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';
import { parseJobCardPrefill } from '@/lib/enyo/prefill';
import { checkJobCardPrefill } from '@/lib/enyo/prefill-server';

const STATUS_LABEL: Record<string, string> = {
  CHECKED_IN: 'Checked In',
  IN_PROGRESS: 'In Progress',
  AWAITING_PARTS: 'Awaiting Parts',
  QUALITY_CHECK: 'Quality Check',
  AWAITING_CUSTOMER_APPROVAL: 'Awaiting Customer Approval',
  COMPLETED: 'Completed',
  READY_FOR_COLLECTION: 'Ready for Collection',
  CLOSED: 'Closed',
  CHECKED_OUT: 'Checked Out',
  CANCELLED: 'Cancelled',
};


export default async function WorkshopJobCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string; error?: string; outcome?: string; binned?: string; prefill?: string; customerId?: string; vehicleId?: string; complaint?: string | string[]; mileage?: string }>;
}) {
  await guardAnyPage(['workshop.view'], '/workshop');
  const sp = await searchParams;
  const { q, type, error, outcome: rawOutcome, binned } = sp;
  // A form prepared by Enyo: validated, checked against this person's
  // organisation and rights, and only ever filled in — never submitted.
  const prefill = await checkJobCardPrefill(parseJobCardPrefill(sp));
  // Customer names link to their Customers (CRM) page for those who may open it.
  const canSeeCustomers = await allows('crm.view');
  const outcomeFilter = parseOutcomeFilter(rawOutcome);
  const vehicleType = type === 'PASSENGER' || type === 'COMMERCIAL' ? type : undefined;
  const jobCards = await listJobCards(undefined, q, vehicleType);
  // How each Job Card ended — completed normally, or cancelled (refunded or
  // not). Works alongside the Passenger / Commercial filter above.
  const outcomes = await getJobCardOutcomes(jobCards.map((jc: (typeof jobCards)[number]) => jc.id));
  const outcomeCounts = Object.fromEntries(
    OUTCOME_FILTERS.map((f) => [f.key, jobCards.filter((jc: (typeof jobCards)[number]) => outcomes[jc.id] && matchesOutcomeFilter(f.key, outcomes[jc.id]!.outcome, outcomes[jc.id]!.refund)).length]),
  );
  const shown = outcomeFilter ? jobCards.filter((jc: (typeof jobCards)[number]) => outcomes[jc.id] && matchesOutcomeFilter(outcomeFilter, outcomes[jc.id]!.outcome, outcomes[jc.id]!.refund)) : jobCards;

  return (
    <div className="p-8">
      <BackLink href="/workshop" label="Back to Workshop" className="mb-4" />
      <BinnedNotice reference={binned} />
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}
      <PageHeader
        icon="clipboard"
        title="Job Cards"
        description={<><OrgTrail area="Workshop" /></>}
      />

      <CategoryFilterTabs basePath="/workshop/job-cards" currentType={vehicleType} preserveParams={{ q }} />
      <OutcomeFilterTabs basePath="/workshop/job-cards" current={outcomeFilter} preserveParams={{ q, type: vehicleType }} counts={outcomeCounts} />

      <form className="mb-6 flex gap-2" action="/workshop/job-cards">
        {vehicleType ? <input type="hidden" name="type" value={vehicleType} /> : null}
        <LiveSearchInput
          type="search" name="q"
          defaultValue={q ?? ''}
          placeholder="Search by job number, customer, vehicle/VIN, or technician…"
          className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button
          type="submit"
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
        >
          Search
        </button>
      </form>

      <FormJumpLink target="open-job-card">New Job Card</FormJumpLink>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          {shown.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--ejo-text-muted)]">
              {q
                ? `No Job Cards match "${q}".`
                : vehicleType || outcomeFilter
                  ? 'No Job Cards match this filter.'
                  : 'No Job Cards yet. Open the first one using the form on the right.'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-3 font-medium">Job #</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Technician</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((jc: (typeof jobCards)[number]) => (
                  <tr key={jc.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-3 font-medium">
                      <LoadingLink href={`/workshop/job-cards/${jc.id}`} className="text-[var(--ejo-primary)] hover:underline">
                        {jc.jobNumber}
                      </LoadingLink>
                      {jc.escalatedFromVehicleService ? (
                        <LoadingLink
                          href={`/workshop/vehicle-service/${jc.escalatedFromVehicleService.id}`}
                          className="mt-1 block w-fit rounded-full bg-[var(--ejo-warning)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-warning)] hover:underline"
                          title="This Job Card continues an escalated Vehicle Service"
                        >
                          Escalated from {jc.escalatedFromVehicleService.serviceNumber}
                        </LoadingLink>
                      ) : null}
                    </td>
                    <td data-label="Customer" className="px-4 py-3 text-[var(--ejo-text-muted)]"><CustomerLink id={jc.customerId} name={jc.customer.fullName} canView={canSeeCustomers} /></td>
                    <td data-label="Vehicle" className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      <LoadingLink href={`/workshop/vehicles/${jc.vehicle.id}/edit`} className="hover:underline hover:text-[var(--ejo-text)]">
                        {jc.vehicle.plateNumber || [jc.vehicle.make, jc.vehicle.model].filter(Boolean).join(' ') || '—'}
                      </LoadingLink>
                    </td>
                    <td data-label="Technician" className="px-4 py-3 text-[var(--ejo-text-muted)]">
                      {jc.assignedTechnician?.fullName ?? 'Unassigned'}
                    </td>
                    <td data-label="Status" className="px-4 py-3">
                      <StatusChip status={jc.status} label={STATUS_LABEL[jc.status]} />
                    </td>
                    <td data-label="Outcome" className="px-4 py-3">
                      {(() => {
                        const o = outcomes[jc.id];
                        const badge = o ? outcomeBadge(o.outcome, o.refund) : null;
                        return badge ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span> : <span className="text-xs text-[var(--ejo-text-muted)]">In progress</span>;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ResponsiveTable>

        <div id="open-job-card" className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 xl:sticky xl:top-6 scroll-mt-20">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Open Job Card</h2>
          {prefill ? (
            <p role="status" className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-primary)]/30 bg-[var(--ejo-primary)]/5 px-3 py-2 text-xs text-[var(--ejo-text)]">
              Prepared by Enyo. Check the details, choose the supervisor and press &ldquo;Open Job Card&rdquo; — nothing is saved until you do.
            </p>
          ) : null}
          <form action={createJobCardFormAction} className="mt-4 space-y-3">
            <FormPendingOverlay />
            <CustomerVehiclePicker initialCustomer={prefill?.customer} initialVehicleId={prefill?.vehicleId} />
            <div>
              <label htmlFor="job-card-mileage" className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Mileage at check-in (km)</label>
              <input id="job-card-mileage" name="mileageAtCheckIn" type="number" defaultValue={prefill?.mileage ?? undefined} className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
                Complaints / reasons for visit <span className="text-[var(--ejo-error)]">*</span>
              </label>
              <ComplaintListInput initial={prefill?.complaints} />
            </div>
            <SubmitButton
              label="Open Job Card"
              pendingLabel="Opening…"
              className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
          </form>
        </div>
      </div>
    </div>
  );
}
