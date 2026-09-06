import { notFound } from 'next/navigation';
import { getJobCard } from '@/lib/actions/workshop';
import { getJobCardSourcingNeeds, getRequestableExternalProcurementLines } from '@/lib/actions/sourcing';
import { requestExternalProcurementFormAction } from '@/lib/actions/sourcing-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

function formatNaira(value: number): string {
  return `₦${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * One real, already-priced External Part/External Job line per card
 * — each its own request (the schema's own real one-to-one design,
 * a cash advance is genuinely tied to one specific line, never a
 * batch). Nothing here needs typing: the description and amount are
 * exactly what's already on the approved estimate, read-only, with a
 * single button to actually raise it.
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

  const [sourcingNeeds, requestableLines] = await Promise.all([getJobCardSourcingNeeds(id), getRequestableExternalProcurementLines(id)]);

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
        Job Card {jobCard.jobNumber} — each line below is already priced on the approved estimate; raising a request
        simply sends that exact line forward as a cash advance request.
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
      ) : requestableLines.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">
          Nothing ready to request — either every External Part/Job line has already been requested, or none of
          this estimate&apos;s external-type lines are priced yet.
        </p>
      ) : (
        <div className="max-w-xl space-y-3">
          {requestableLines.map((line: (typeof requestableLines)[number]) => (
            <div key={line.id} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
              <p className="text-sm font-medium text-[var(--ejo-text)]">{line.description}</p>
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                {line.type === 'EXTERNAL_PART' ? 'External Part' : 'External Job'} · Qty {line.quantity}
                {line.unitOfMeasure ? ` ${line.unitOfMeasure}` : ''}
              </p>
              <p className="mt-2 text-lg font-bold text-[var(--ejo-text)]">{line.amount !== null ? formatNaira(Number(line.amount)) : '—'}</p>
              <form action={requestExternalProcurementFormAction} className="mt-3">
                <FormPendingOverlay />
                <input type="hidden" name="jobCardId" value={id} />
                <input type="hidden" name="estimateLineItemId" value={line.id} />
                <SubmitButton
                  label="Raise Procurement Request"
                  pendingLabel="Raising…"
                  className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                />
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
