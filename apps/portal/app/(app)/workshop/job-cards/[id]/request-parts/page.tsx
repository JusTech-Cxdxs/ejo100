import { notFound } from 'next/navigation';
import { getJobCard, getJobCardEstimate } from '@/lib/actions/workshop';
import { getJobCardSourcingNeeds } from '@/lib/actions/sourcing';
import { listParts, getStoreBranchId } from '@/lib/actions/store';
import { requestPartRequestSlipFormAction } from '@/lib/actions/sourcing-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

/**
 * Raises a Store Parts request for a Job Card — one row per STORE_PART
 * line on its own estimate, each matched here to a real catalog Part and
 * confirmed quantity. Deliberately shows every store-type estimate line
 * regardless of whether an earlier request already covered it (a
 * technician can legitimately need a second round, or a first request
 * may have been rejected) — whoever's raising this picks which lines to
 * actually include this time by choosing a Part for them; a row left at
 * "— Skip —" isn't submitted.
 */
export default async function RequestPartsPage({
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

  const [estimate, sourcingNeeds, storeBranchId] = await Promise.all([
    getJobCardEstimate(id),
    getJobCardSourcingNeeds(id),
    getStoreBranchId(),
  ]);
  const parts = await listParts(storeBranchId);
  const allLineItems = estimate?.lineItems ?? [];
  const storeLines = allLineItems.filter((li: (typeof allLineItems)[number]) => li.type === 'STORE_PART');

  return (
    <div className="p-8">
      <LoadingLink
        href={`/workshop/job-cards/${id}`}
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Job Card {jobCard.jobNumber}
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Request Store Parts</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Job Card {jobCard.jobNumber} — match each estimate line to a real Part and confirm quantity.
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
      ) : storeLines.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">This estimate has no Store Part line items.</p>
      ) : parts.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">
          No parts in the catalog yet — <LoadingLink href="/inventory/parts" className="text-[var(--ejo-primary)] hover:underline">add some first</LoadingLink>.
        </p>
      ) : (
        <form action={requestPartRequestSlipFormAction} className="max-w-2xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <FormPendingOverlay />
          <input type="hidden" name="jobCardId" value={id} />

          <div className="space-y-4">
            {storeLines.map((line: (typeof storeLines)[number]) => (
              <div key={line.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-4">
                <input type="hidden" name="lineEstimateLineItemId" value={line.id} />
                <p className="text-sm font-medium text-[var(--ejo-text)]">{line.description}</p>
                <p className="mb-3 text-xs text-[var(--ejo-text-muted)]">Estimate quantity: {line.quantity}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Part</label>
                    <select
                      name="linePartId"
                      defaultValue=""
                      className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                    >
                      <option value="">— Skip —</option>
                      {parts.map((part: (typeof parts)[number]) => (
                        <option key={part.id} value={part.id}>
                          {part.name} ({part.baseUnitOfMeasure})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Quantity (in Part&apos;s base unit)</label>
                    <input
                      name="lineQuantity"
                      type="number"
                      step="0.0001"
                      defaultValue={line.quantity}
                      className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <SubmitButton
            label="Raise Parts Request"
            pendingLabel="Raising…"
            className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          />
        </form>
      )}
    </div>
  );
}
