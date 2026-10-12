import { guardAnyPage } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getPart } from '@/lib/actions/store';
import { updatePartFormAction } from '@/lib/actions/store-form-handlers';
import { SubmitButton } from '@/components/SubmitButton';
import { pluralizeWord } from '@/lib/utils/pluralize';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { BackLink, PageTitle } from '@/components/ui';

/**
 * Edits a part and its alternative units. Tracking type and base unit are
 * not editable: existing stock is recorded in that unit.
 */
export default async function EditPartPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await guardAnyPage(['store.parts.manage'], '/inventory/parts/edit');
  const { id } = await params;
  const { error } = await searchParams;
  const part = await getPart(id);
  if (!part) notFound();

  // An empty row is rendered separately below so there is always somewhere
  // to add a first alternative unit.
  const hasExistingUnits = part.alternativeUnits.length > 0;

  return (
    <div className="p-8">
      <BackLink href={`/inventory/parts/${id}`} label={<>Back to {part.name}</>} className="mb-4" />
      <PageTitle icon="package" className="mb-6">Edit Part</PageTitle>

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
                      placeholder={`= how many ${pluralizeWord(2, part.baseUnitOfMeasure)}`}
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
                placeholder={`= how many ${pluralizeWord(2, part.baseUnitOfMeasure)}`}
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
