import { listParts, getStoreBranchId } from '@/lib/actions/store';
import { recordGoodsReceiptFormAction } from '@/lib/actions/store-form-handlers';
import { GoodsReceiptForm } from '@/components/GoodsReceiptForm';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

/**
 * Records one delivery of one part arriving into the store. The actual
 * form (GoodsReceiptForm, a client component) responds to which part is
 * selected — showing its real base/alternative units immediately, and
 * only the one field its tracking type genuinely needs.
 *
 * One part per submission for this first version — the underlying
 * recordGoodsReceipt() action already accepts multiple line items per
 * receipt, for a future multi-line form once that's worth the added
 * complexity; a delivery with several different parts is recorded as
 * one receipt per part for now.
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
        <GoodsReceiptForm branchId={branchId} parts={parts} action={recordGoodsReceiptFormAction} />
      )}
    </div>
  );
}
