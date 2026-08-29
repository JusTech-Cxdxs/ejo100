import { listParts, getStoreBranchId } from '@/lib/actions/store';
import { recordGoodsReceiptFormAction } from '@/lib/actions/store-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

/**
 * Records one delivery of one part arriving into the store. Handles all
 * three tracking types on the same form — a Server Component page can't
 * dynamically show or hide fields based on which part gets selected
 * without client-side JavaScript, so the Batch Number and Serial Numbers
 * fields are both always visible, clearly labeled with which tracking
 * type each applies to. The server action itself is the real source of
 * truth for what's actually required for a given part — this form just
 * makes it easy to provide the right thing.
 *
 * One part per submission for this first version — the underlying
 * recordGoodsReceipt() action already accepts multiple line items per
 * receipt, for a future multi-line form once that's worth the added
 * client-side complexity; a delivery with several different parts is
 * recorded as one receipt per part for now.
 */
export default async function NewGoodsReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const branchId = await getStoreBranchId();
  const parts = await listParts(branchId);

  return (
    <div className="p-8">
      <LoadingLink
        href="/inventory/goods-receipts"
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Goods Receipts
      </LoadingLink>
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Record Goods Receipt</h1>
      </div>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Store
      </p>

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}

      {parts.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">
          No parts in the catalog yet — <LoadingLink href="/inventory/parts" className="text-[var(--ejo-primary)] hover:underline">add one first</LoadingLink>.
        </p>
      ) : (
        <form action={recordGoodsReceiptFormAction} className="max-w-xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <FormPendingOverlay />
          <input type="hidden" name="branchId" value={branchId} />

          <div>
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Supplier</label>
            <input
              name="supplierName"
              required
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Part</label>
            <select
              name="partId"
              required
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            >
              {parts.map((part: (typeof parts)[number]) => (
                <option key={part.id} value={part.id}>
                  {part.name} — base unit: {part.baseUnitOfMeasure}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Quantity Received</label>
              <input
                name="quantityReceivedInUnit"
                type="number"
                step="0.0001"
                required
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Unit</label>
              <input
                name="unitUsed"
                required
                placeholder="e.g. Liter, or Drum"
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-[var(--ejo-text-muted)]">
            Enter the delivery exactly as it arrived — the part&apos;s own base unit, or one of its recognized
            alternative units (see the part&apos;s own page for the exact conversion). Anything else is rejected.
          </p>

          <div>
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Unit Cost (optional)</label>
            <input
              name="unitCost"
              type="number"
              step="0.01"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">
              Batch Number <span className="text-[var(--ejo-text-muted)]">— only for Batch-tracked parts (e.g. engine oil, coolant)</span>
            </label>
            <input
              name="batchNumber"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">
              Serial Numbers <span className="text-[var(--ejo-text-muted)]">— only for Serialized parts (e.g. tyres, rims), one per line or comma-separated</span>
            </label>
            <textarea
              name="serialNumbers"
              rows={3}
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Notes (optional)</label>
            <textarea
              name="notes"
              rows={2}
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>

          <SubmitButton
            label="Record Goods Receipt"
            pendingLabel="Recording…"
            className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          />
        </form>
      )}
    </div>
  );
}
