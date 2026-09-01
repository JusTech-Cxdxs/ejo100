import { notFound } from 'next/navigation';
import { getPart } from '@/lib/actions/store';
import { updatePartFormAction } from '@/lib/actions/store-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

/**
 * Edits an existing part's safe-to-change fields and its full
 * alternative-unit list in one form — deliberately never tracking type
 * or base unit of measure, since changing either on a part with real
 * stock already recorded in that unit would leave existing stock
 * records silently disagreeing with a changed unit.
 *
 * This is the real correction path for the drum-size fix (208L→205L,
 * confirmed against a real carton photo) and the new Carton unit for
 * Brake Fluid (12 Bottles, also from a real carton photo) — nothing
 * else needed to build for those corrections beyond this page.
 */
export default async function EditPartPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const part = await getPart(id);
  if (!part) notFound();

  // Always at least one row shown, even with zero existing alternative
  // units, so there's somewhere to type a first one in — the same
  // pattern as the create form's own optional-unit section. Rendered
  // as a real, separate empty row in JSX below rather than folded into
  // this array, since the fallback and the real PartUnitOfMeasure rows
  // don't share the same shape (no partId on a row that doesn't exist
  // yet) — mixing them into one array risked a real type mismatch for
  // no real benefit.
  const hasExistingUnits = part.alternativeUnits.length > 0;

  return (
    <div className="p-8">
      <LoadingLink href={`/inventory/parts/${id}`} className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to {part.name}
      </LoadingLink>
      <h1 className="mb-6 text-2xl font-bold text-[var(--ejo-text)]">Edit Part</h1>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}

      <form action={updatePartFormAction} className="max-w-xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
        <FormPendingOverlay />
        <input type="hidden" name="id" value={part.id} />

        <div>
          <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Name</label>
          <input
            name="name"
            required
            defaultValue={part.name}
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Category</label>
          <input
            name="category"
            defaultValue={part.category ?? ''}
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Part Number</label>
          <input
            name="partNumber"
            defaultValue={part.partNumber ?? ''}
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Description</label>
          <textarea
            name="description"
            rows={2}
            defaultValue={part.description ?? ''}
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
        </div>

        <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
          <p className="mb-1 text-xs font-medium text-[var(--ejo-text)]">Base unit: {part.baseUnitOfMeasure}</p>
          <p className="mb-3 text-xs text-[var(--ejo-text-muted)]">Fixed — cannot be changed once stock exists in this unit.</p>
          <p className="mb-2 text-xs font-medium text-[var(--ejo-text-muted)]">Alternative Units</p>
          <div className="space-y-2">
            {hasExistingUnits
              ? part.alternativeUnits.map((unit: (typeof part.alternativeUnits)[number], i: number) => (
                  <div key={unit.id} className="grid grid-cols-2 gap-2">
                    <input
                      name="altUnitName"
                      defaultValue={unit.unitName}
                      placeholder={i === 0 ? 'e.g. Drum, Carton' : 'Unit name'}
                      className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                    />
                    <input
                      name="altUnitFactor"
                      type="number"
                      step="0.0001"
                      defaultValue={Number(unit.conversionFactor)}
                      placeholder={`= how many ${part.baseUnitOfMeasure}`}
                      className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                    />
                  </div>
                ))
              : null}
            <div className="grid grid-cols-2 gap-2">
              <input
                name="altUnitName"
                placeholder="Add another unit"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
              <input
                name="altUnitFactor"
                type="number"
                step="0.0001"
                placeholder={`= how many ${part.baseUnitOfMeasure}`}
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">
            Leave a unit name blank to remove it. This replaces the full list on save — enter every unit that should remain.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Reorder Point</label>
            <input
              name="reorderPoint"
              type="number"
              step="0.001"
              defaultValue={part.reorderPoint ? Number(part.reorderPoint) : undefined}
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Safety Stock</label>
            <input
              name="safetyStock"
              type="number"
              step="0.001"
              defaultValue={part.safetyStock ? Number(part.safetyStock) : undefined}
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
        </div>

        <SubmitButton
          label="Save Changes"
          pendingLabel="Saving…"
          className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        />
      </form>
    </div>
  );
}
