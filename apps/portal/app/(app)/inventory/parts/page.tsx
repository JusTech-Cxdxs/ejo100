import { listParts, getStoreBranchId } from '@/lib/actions/store';
import { createPartFormAction } from '@/lib/actions/store-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

const TRACKING_TYPE_LABEL: Record<string, string> = {
  QUANTITY: 'Quantity',
  BATCH: 'Batch',
  SERIALIZED: 'Serialized',
};

/**
 * The part catalog — every item the store stocks, with its tracking
 * type (Quantity/Batch/Serialized — the real distinction behind how
 * each part's stock is actually represented) and current stock on
 * hand. Create form covers the base unit of measure and one optional
 * alternative unit with its conversion factor — the drum-of-oil
 * scenario this was designed around.
 */
export default async function InventoryPartsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string; q?: string }>;
}) {
  const { error, status, q } = await searchParams;
  const branchId = await getStoreBranchId();
  const parts = await listParts(branchId, q);

  return (
    <div className="p-8">
      <LoadingLink
        href="/inventory"
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Inventory
      </LoadingLink>
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Parts Catalog</h1>
      </div>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Store
      </p>

      {error ? (
        <div className="mb-6">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'part_created' ? (
        <div className="mb-6">
          <FormFeedbackBanner kind="success" message="Part added to the catalog." />
        </div>
      ) : null}

      <form className="mb-8 flex gap-2" action="/inventory/parts">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by name, part number, or category…"
          className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <button
          type="submit"
          className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
        >
          Search
        </button>
        {q ? (
          <LoadingLink
            href="/inventory/parts"
            className="inline-flex items-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"
          >
            Clear
          </LoadingLink>
        ) : null}
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          {parts.length === 0 ? (
            <p className="text-sm text-[var(--ejo-text-muted)]">No parts in the catalog yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Part No.</th>
                    <th className="px-4 py-2">Tracking</th>
                    <th className="px-4 py-2">Unit</th>
                    <th className="px-4 py-2">On Hand</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part: (typeof parts)[number]) => (
                    <tr key={part.id} className="border-b border-[var(--ejo-border)] last:border-0">
                      <td className="px-4 py-2">
                        <LoadingLink href={`/inventory/parts/${part.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">
                          {part.name}
                        </LoadingLink>
                        {part.category ? <p className="text-xs text-[var(--ejo-text-muted)]">{part.category}</p> : null}
                      </td>
                      <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{part.partNumber ?? '—'}</td>
                      <td className="px-4 py-2 text-[var(--ejo-text)]">{TRACKING_TYPE_LABEL[part.trackingType] ?? part.trackingType}</td>
                      <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{part.baseUnitOfMeasure}</td>
                      <td className="px-4 py-2 font-medium text-[var(--ejo-text)]">
                        {part.stock ? Number(part.stock.quantityOnHand).toLocaleString('en-NG', { maximumFractionDigits: 3 }) : '0'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Add a Part</h2>
          <form action={createPartFormAction} className="mt-4 space-y-3">
            <FormPendingOverlay />
            <input type="hidden" name="branchId" value={branchId} />
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Name</label>
              <input
                name="name"
                required
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Category</label>
              <input
                name="category"
                placeholder="e.g. Filters, Brakes, Fluids"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Part Number</label>
              <input
                name="partNumber"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Description</label>
              <textarea
                name="description"
                rows={2}
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Tracking Type</label>
              <select
                name="trackingType"
                required
                defaultValue="QUANTITY"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              >
                <option value="QUANTITY">Quantity — a running total (e.g. brake pads, filters)</option>
                <option value="BATCH">Batch — grouped by delivery (e.g. engine oil, coolant)</option>
                <option value="SERIALIZED">Serialized — every unit has its own ID (e.g. tyres, rims)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Base Unit of Measure</label>
              <input
                name="baseUnitOfMeasure"
                required
                placeholder="e.g. Each, Liter, Kg"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
              <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">
                Stock is always tracked in this unit, no matter what unit a delivery arrives in.
              </p>
            </div>
            <details className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
              <summary className="cursor-pointer text-xs font-medium text-[var(--ejo-text)]">
                Alternative unit (optional) — e.g. a Drum or Case
              </summary>
              <div className="mt-3 space-y-2">
                <input
                  name="altUnitName"
                  placeholder="Unit name, e.g. Drum"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
                <input
                  name="altUnitFactor"
                  type="number"
                  step="0.0001"
                  placeholder="Conversion factor, e.g. 200 (1 Drum = 200 Liters)"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
              </div>
            </details>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Reorder Point</label>
                <input
                  name="reorderPoint"
                  type="number"
                  step="0.001"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Safety Stock</label>
                <input
                  name="safetyStock"
                  type="number"
                  step="0.001"
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
              </div>
            </div>
            <SubmitButton
              label="Add Part"
              pendingLabel="Adding…"
              className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            />
          </form>
        </div>
      </div>
    </div>
  );
}
