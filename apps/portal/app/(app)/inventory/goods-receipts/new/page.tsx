import { allows, guardAnyPage } from '@/lib/authz/server';
import { OrgTrail } from '@/components/OrgTrail';
import { listParts, getStoreBranchId } from '@/lib/actions/store';
import { recordGoodsReceiptFormAction } from '@/lib/actions/store-form-handlers';
import { GoodsReceiptForm } from '@/components/GoodsReceiptForm';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { PageHeader } from '@/components/ui';

/**
 * Records a delivery into the Store. GoodsReceiptForm shows the selected
 * part's units and the field its tracking type needs (batch or serials).
 */
export default async function NewGoodsReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await guardAnyPage(['store.grn.record'], '/inventory/goods-receipts/new');
  const { error } = await searchParams;
  const branchId = await getStoreBranchId();
  const [parts, canRecord] = await Promise.all([listParts(branchId), allows('store.grn.record', { branchId })]);

  return (
    <div className="p-8">
      <PageHeader
        icon="receipt"
        back={{ href: "/inventory/goods-receipts", label: "Back to Goods Receipts" }}
        title="Record Goods Receipt"
        description={<><OrgTrail area="Store" /></>}
      />

      {error ? (
        <div className="mb-6 max-w-xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}

      {!canRecord ? (
        <p className="max-w-xl rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 py-3 text-sm text-[var(--ejo-text-muted)]">
          Goods receipts are recorded by the Store. You can see every receipt on the <LoadingLink href="/inventory/goods-receipts" className="text-[var(--ejo-primary)] hover:underline">Goods Receipts</LoadingLink> list.
        </p>
      ) : parts.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">
          No parts in the catalog yet — <LoadingLink href="/inventory/parts" className="text-[var(--ejo-primary)] hover:underline">add one first</LoadingLink>.
        </p>
      ) : (
        <GoodsReceiptForm branchId={branchId} parts={parts} action={recordGoodsReceiptFormAction} />
      )}
    </div>
  );
}
