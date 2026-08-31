import { notFound } from 'next/navigation';
import { getJobCard, getJobCardEstimate } from '@/lib/actions/workshop';
import { getJobCardSourcingNeeds } from '@/lib/actions/sourcing';
import { requestExternalProcurementFormAction } from '@/lib/actions/sourcing-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

/**
 * Raises one External Procurement (cash-advance) request for a Job Card
 * — one request per external-type estimate line, matching the schema's
 * own one-to-one estimateLineItemId design. Picking a line pre-fills the
 * description and estimated amount from the estimate itself, editable
 * before submitting.
 */
export default async function RequestProcurementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const jobCard = await getJobCard(id);
  if (!jobCard) notFound();

  const [estimate, sourcingNeeds] = await Promise.all([getJobCardEstimate(id), getJobCardSourcingNeeds(id)]);
  const allLineItems = estimate?.lineItems ?? [];
  const externalLines = allLineItems.filter((li: (typeof allLineItems)[number]) => li.type === 'EXTERNAL_PART' || li.type === 'EXTERNAL_JOB');

  return (
    <div className="p-8">
      <LoadingLink
        href={`/workshop/job-cards/${id}`}
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Job Card {jobCard.jobNumber}
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Request External Procurement</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Job Card {jobCard.jobNumber} — a cash advance request for one externally-sourced part or job.
      </p>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}

      {!sourcingNeeds.isEligibleToSource ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">
          This Job Card isn&apos;t far enough along to request procurement yet — it needs to be at least In Progress.
        </p>
      ) : externalLines.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">This estimate has no External Part or External Job line items.</p>
      ) : (
        <form action={requestExternalProcurementFormAction} className="max-w-xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <FormPendingOverlay />
          <input type="hidden" name="jobCardId" value={id} />

          <div>
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Estimate Line</label>
            <select
              name="estimateLineItemId"
              required
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            >
              {externalLines.map((line: (typeof externalLines)[number]) => (
                <option key={line.id} value={line.id}>
                  {line.description} — ₦{Number(line.amount ?? 0).toLocaleString('en-NG')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Description</label>
            <textarea
              name="description"
              required
              rows={3}
              defaultValue={externalLines[0]?.description ?? ''}
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
            <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
              Pre-filled from the first line above — edit to match whichever line you actually select.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Estimated Amount</label>
            <input
              name="estimatedAmount"
              type="number"
              step="0.01"
              required
              defaultValue={externalLines[0]?.amount ? Number(externalLines[0].amount) : undefined}
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>

          <SubmitButton
            label="Raise Procurement Request"
            pendingLabel="Raising…"
            className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          />
        </form>
      )}
    </div>
  );
}
