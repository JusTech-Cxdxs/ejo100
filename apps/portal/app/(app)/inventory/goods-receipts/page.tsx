import { listGoodsReceipts, getStoreBranchId } from '@/lib/actions/store';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { pluralize } from '@/lib/utils/pluralize';

/**
 * A complete, permanent record of every delivery received into the
 * store — the Goods Receipt half of the standard Goods Receipt/Goods
 * Issue pair that gives this whole system a real, auditable stock
 * ledger.
 */
export default async function GoodsReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const { status, error } = await searchParams;
  const branchId = await getStoreBranchId();
  const receipts = await listGoodsReceipts(branchId);

  return (
    <div className="p-8">
      <LoadingLink
        href="/inventory"
        className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        ← Back to Inventory
      </LoadingLink>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Goods Receipts</h1>
        <LoadingLink
          href="/inventory/goods-receipts/new"
          className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Record Goods Receipt
        </LoadingLink>
      </div>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Kewalram Nigeria — Automobile Division — Lagos State — Isolo Branch — Store
      </p>

      {error ? (
        <div className="mb-6">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'receipt_recorded' ? (
        <div className="mb-6">
          <FormFeedbackBanner kind="success" message="Goods receipt recorded and stock updated." />
        </div>
      ) : null}

      {receipts.length === 0 ? (
        <p className="text-sm text-[var(--ejo-text-muted)]">No goods receipts recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Supplier</th>
                <th className="px-4 py-2">Lines</th>
                <th className="px-4 py-2">Received By</th>
                <th className="px-4 py-2">Received At</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt: (typeof receipts)[number]) => (
                <tr key={receipt.id} className="border-b border-[var(--ejo-border)] last:border-0">
                  <td className="px-4 py-2 font-medium">
                    <LoadingLink href={`/inventory/goods-receipts/${receipt.id}`} className="text-[var(--ejo-primary)] hover:underline">
                      {receipt.referenceNumber}
                    </LoadingLink>
                  </td>
                  <td className="px-4 py-2 text-[var(--ejo-text)]">{receipt.supplierName}</td>
                  <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{pluralize(receipt.lines.length, 'line')}</td>
                  <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{receipt.receivedBy.fullName}</td>
                  <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{new Date(receipt.receivedAt).toLocaleDateString('en-NG')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
