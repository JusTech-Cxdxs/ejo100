import { allows, guardAnyPage } from '@/lib/authz/server';
import { OrgTrail } from '@/components/OrgTrail';
import { listGoodsReceipts, getStoreBranchId } from '@/lib/actions/store';
import { formatDateOnly } from '@/lib/utils/format-date';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { pluralize } from '@/lib/utils/pluralize';
import { EmptyState, HeaderAction, PageHeader } from '@/components/ui';

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
  await guardAnyPage(['store.view'], '/inventory');
  const { status, error } = await searchParams;
  const branchId = await getStoreBranchId();
  const [receipts, canRecord] = await Promise.all([listGoodsReceipts(branchId), allows('store.grn.record', { branchId })]);

  return (
    <div className="p-8">
      <PageHeader
        icon="receipt"
        back={{ href: "/inventory", label: "Back to Inventory" }}
        title="Goods Receipts"
        description={<><OrgTrail area="Store" /></>}
        actions={canRecord ? <HeaderAction href="/inventory/goods-receipts/new">Record Goods Receipt</HeaderAction> : null}
      />

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
        <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)]"><EmptyState compact icon="receipt" title="No goods receipts recorded yet." /></div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ejo-border)] text-left text-xs text-[var(--ejo-text-muted)]">
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Supplier</th>
                <th className="px-4 py-2">Received Into</th>
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
                  <td className="px-4 py-2 text-[var(--ejo-text-muted)]">
                    {/* Destination — each Part this delivery was received into,
                        the reverse of each Part's own "Source GRN" link. */}
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                      {receipt.lines.map((l: (typeof receipt.lines)[number], i: number) => (
                        <span key={l.id}>
                          <LoadingLink href={`/inventory/parts/${l.part.id}`} className="text-[var(--ejo-primary)] hover:underline">
                            {l.part.name}
                          </LoadingLink>
                          {i < receipt.lines.length - 1 ? ',' : ''}
                        </span>
                      ))}
                    </div>
                    <div className="text-[11px]">{pluralize(receipt.lines.length, 'line')}</div>
                  </td>
                  <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{receipt.receivedBy.fullName}</td>
                  <td className="px-4 py-2 text-[var(--ejo-text-muted)]">{formatDateOnly(new Date(receipt.receivedAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
