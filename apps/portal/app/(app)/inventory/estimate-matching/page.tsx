import { listUnmatchedStorePartLines, getFittingPartsForVehicle, getStoreBranchId } from '@/lib/actions/store';
import { matchEstimateStorePartLineFormAction } from '@/lib/actions/store-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { pluralize } from '@/lib/utils/pluralize';

const WRENCH_ICON = (
  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0 text-[var(--ejo-warning)]">
    <path
      d="M14.5 3.5a3 3 0 00-3.86 3.86L4 14l2 2 6.64-6.64a3 3 0 003.86-3.86l-2.1 2.1-1.9-.5-.5-1.9 2.1-2.1z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Store's own real queue — every Store Part line, across every Job
 * Card, whose estimate has been submitted but hasn't yet been matched
 * to a real, vehicle-fitting catalog Part. Grouped one card per Job
 * Card rather than one flat card per line — a real Job Card can (and
 * often does) have several unmatched lines at once, and repeating the
 * same vehicle and Job Card reference on every single one just adds
 * noise once more than one request is in flight across different Job
 * Cards at the same time. Matching pulls in the fitment-matching
 * logic already proven in the Vehicle Fitment phase — a technician's
 * plain "Fuel Filter" request narrows down to exactly the Parts that
 * both share that PartType and genuinely fit this Job Card's own
 * vehicle.
 */
export default async function EstimateMatchingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { error, status } = await searchParams;
  const branchId = await getStoreBranchId();
  const lines = await listUnmatchedStorePartLines(branchId);
  const linesWithFittingParts = await Promise.all(
    lines.map(async (line: (typeof lines)[number]) => ({
      line,
      fittingParts: await getFittingPartsForVehicle(branchId, line.estimate.jobCard.vehicle, undefined, line.partTypeId ?? undefined),
    })),
  );

  // One group per real Job Card — every line for the same Job Card
  // ends up under the same card, in whatever order they were
  // originally added.
  const groupsByJobCard = new Map<
    string,
    { jobCard: (typeof lines)[number]['estimate']['jobCard']; lines: typeof linesWithFittingParts }
  >();
  for (const entry of linesWithFittingParts) {
    const jobCardId = entry.line.estimate.jobCard.id;
    const existing = groupsByJobCard.get(jobCardId);
    if (existing) {
      existing.lines.push(entry);
    } else {
      groupsByJobCard.set(jobCardId, { jobCard: entry.line.estimate.jobCard, lines: [entry] });
    }
  }
  const groups = [...groupsByJobCard.values()];

  return (
    <div className="p-8">
      <LoadingLink href="/inventory" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Inventory
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">Estimate Matching</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Store Part lines waiting for a real catalog Part and price — the estimate can&apos;t reach final approval
        until every line here is matched.
      </p>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'line_matched' ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="success" message="Matched." />
        </div>
      ) : null}

      {groups.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">Nothing waiting on Store right now.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const vehicle = group.jobCard.vehicle;
            const vehicleLine = [vehicle.year, vehicle.make, vehicle.model, vehicle.engineType].filter(Boolean).join(' ') || 'No vehicle details on file';
            return (
              <div key={group.jobCard.id} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/30 bg-[var(--ejo-warning)]/5 p-5">
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ejo-warning)]/20 pb-3">
                  <LoadingLink
                    href={`/workshop/job-cards/${group.jobCard.id}`}
                    className="text-sm font-semibold text-[var(--ejo-primary)] hover:underline"
                  >
                    {group.jobCard.jobNumber}
                  </LoadingLink>
                  <span className="text-xs text-[var(--ejo-text-muted)]">{vehicleLine}</span>
                  <span className="ml-auto rounded-full bg-[var(--ejo-warning)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-warning)]">
                    {pluralize(group.lines.length, 'line')} to match
                  </span>
                </div>

                <div className="mt-3 space-y-4">
                  {group.lines.map(({ line, fittingParts }) => (
                    <div key={line.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        {WRENCH_ICON}
                        <span className="text-sm font-medium text-[var(--ejo-text)]">{line.partType?.name ?? line.description}</span>
                        {line.partType ? (
                          <span className="rounded-full bg-[var(--ejo-text-muted)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--ejo-text-muted)]">
                            {line.partType.category.name}
                          </span>
                        ) : null}
                        <span className="text-xs text-[var(--ejo-text-muted)]">× {line.quantity}</span>
                      </div>

                      {fittingParts.length === 0 ? (
                        <p className="mt-2 pl-6 text-xs text-[var(--ejo-error)]">
                          No catalog Part for this vehicle and Part Type yet — add one under Parts Catalog before this line can be matched.
                        </p>
                      ) : (
                        <form action={matchEstimateStorePartLineFormAction} className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                          <FormPendingOverlay />
                          <input type="hidden" name="lineItemId" value={line.id} />
                          <input type="hidden" name="jobCardId" value={line.estimate.jobCard.id} />
                          <select
                            name="partId"
                            required
                            className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                          >
                            {fittingParts.map((part: (typeof fittingParts)[number]) => (
                              <option key={part.id} value={part.id}>
                                {part.name} — {pluralize(Number(part.stock?.quantityOnHand ?? 0), part.baseUnitOfMeasure)} on hand
                              </option>
                            ))}
                          </select>
                          <SubmitButton
                            label="Match"
                            pendingLabel="Matching…"
                            className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                          />
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
