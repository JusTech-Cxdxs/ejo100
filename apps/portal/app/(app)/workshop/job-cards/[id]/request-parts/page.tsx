import { ResponsiveTable } from '@/components/ui/ResponsiveTable';
import { guardAnyPage, allows } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getJobCard } from '@/lib/actions/workshop';
import { getJobCardSourcingNeeds, getRequestablePartRequestLines } from '@/lib/actions/sourcing';
import { requestPartRequestSlipFormAction } from '@/lib/actions/sourcing-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { pluralize, pluralizeWord } from '@/lib/utils/pluralize';
import { BackLink, PageTitle } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';

function formatNaira(value: number): string {
  return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Read-only review before raising a parts request. Every Store Part line is
 * already matched, priced and approved, so there is nothing to enter; the
 * header matches the request's detail page.
 */
export default async function RequestPartsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await guardAnyPage(['workshop.view'], '/workshop');
  const { id } = await params;
  const { error } = await searchParams;
  const jobCard = await getJobCard(id);
  if (!jobCard) notFound();
  // Customer names link to their Customers (CRM) page for those who may open it.
  const canSeeCustomers = await allows('crm.view');

  const [sourcingNeeds, requestableLines] = await Promise.all([getJobCardSourcingNeeds(id), getRequestablePartRequestLines(id)]);
  const totalAmount = requestableLines.reduce((sum: number, l: (typeof requestableLines)[number]) => sum + (l.amount !== null ? Number(l.amount) : 0), 0);
  const vehicle = jobCard.vehicle;
  const vehicleSummary = [vehicle.year, vehicle.make, vehicle.model, vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file';

  return (
    <div className="p-8">
      <BackLink href={`/workshop/job-cards/${id}`} label={<>Back to Job Card {jobCard.jobNumber}</>} className="mb-4" />
      <PageTitle icon="package" className="mb-2">Request Store Parts</PageTitle>
      <p className="mb-6 max-w-2xl text-sm text-[var(--ejo-text-muted)]">
        These parts have been matched and priced by the Store. Check the list, then raise the request for approval.
      </p>

      {error ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}

      {!sourcingNeeds.isEligibleToSource ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">
          This Job Card isn&apos;t far enough along to request parts yet — it needs to be at least In Progress.
        </p>
      ) : requestableLines.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">
          Nothing ready to request — either every matched Store Part line has already been requested, or none of this
          estimate&apos;s Store Part lines are matched yet.
        </p>
      ) : (
        <div className="max-w-4xl overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <div className="grid gap-4 border-b border-[var(--ejo-border)] p-6 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Job Card</dt>
              <dd className="text-sm font-medium text-[var(--ejo-text)]">{jobCard.jobNumber}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Customer</dt>
              <dd className="text-sm font-medium text-[var(--ejo-text)]"><CustomerLink id={jobCard.customerId} name={jobCard.customer.fullName} canView={canSeeCustomers} /></dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Vehicle</dt>
              <dd className="text-sm font-medium text-[var(--ejo-text)]">{vehicleSummary}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Plate No.</dt>
              <dd className="text-sm font-medium text-[var(--ejo-text)]">{vehicle.plateNumber ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">VIN / Chassis</dt>
              <dd className="text-sm font-medium text-[var(--ejo-text)]">{vehicle.chassisNumber ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--ejo-text-muted)]">Technician in Charge</dt>
              <dd className="text-sm font-medium text-[var(--ejo-text)]">{jobCard.assignedTechnician?.fullName ?? '—'}</dd>
            </div>
          </div>

          <ResponsiveTable flush>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-2">Part</th>
                  <th className="px-4 py-2">Part Type</th>
                  <th className="px-4 py-2">Part No.</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {requestableLines.map((line: (typeof requestableLines)[number]) => (
                  <tr key={line.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className="px-4 py-2 font-medium text-[var(--ejo-text)]">{line.matchedPart?.name ?? line.description}</td>
                    <td data-label="Part Type" className="px-4 py-2 text-[var(--ejo-text-muted)]">{line.partType?.name ?? '—'}</td>
                    <td data-label="Part No." className="px-4 py-2 text-[var(--ejo-text-muted)]">{line.matchedPart?.partNumber ?? '—'}</td>
                    <td data-label="Quantity" className="px-4 py-2 text-right text-[var(--ejo-text)]">
                      {line.quantity} {line.unitOfMeasure ? pluralizeWord(line.quantity, line.unitOfMeasure) : ''}
                    </td>
                    <td data-label="Amount" className="px-4 py-2 text-right text-[var(--ejo-text)]">{line.amount !== null ? formatNaira(Number(line.amount)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--ejo-border)] font-medium text-[var(--ejo-text)]">
                  <td className="px-4 py-2" colSpan={3}>
                    {pluralize(requestableLines.length, 'Part')} total
                  </td>
                  <td />
                  <td className="px-4 py-2 text-right">{formatNaira(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </ResponsiveTable>
          <form action={requestPartRequestSlipFormAction} className="border-t border-[var(--ejo-border)] p-4">
            <FormPendingOverlay />
            <input type="hidden" name="jobCardId" value={id} />
            <SubmitButton
              label="Raise Parts Request"
              pendingLabel="Raising…"
              className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
          </form>
        </div>
      )}
    </div>
  );
}
