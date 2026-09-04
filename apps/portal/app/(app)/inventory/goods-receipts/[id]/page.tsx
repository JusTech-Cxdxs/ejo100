import { notFound } from 'next/navigation';
import { getGoodsReceipt, getGoodsReceiptAuditTrail } from '@/lib/actions/store';
import { updateGoodsReceiptFormAction, updateGoodsReceiptLineCostFormAction } from '@/lib/actions/store-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { pluralize } from '@/lib/utils/pluralize';

const AUDIT_ACTION_LABEL: Record<string, string> = {
  'goods_receipt.updated': 'Supplier / notes updated',
  'goods_receipt.line_cost_updated': 'Line cost corrected',
};

function formatNaira(amount: number | null): string {
  return amount === null ? '—' : `₦${amount.toLocaleString('en-NG')}`;
}

/**
 * One Goods Receipt's own real, permanent record — click through from
 * the list's own reference number, same as a Job Card or a Part gets
 * its own dedicated page. Editing is deliberately narrow: Supplier
 * and Notes (pure record-keeping, no effect on stock or price), and
 * each line's own Unit Cost (the one field a real mistake — like the
 * user's own Coolant example — actually needs correcting). Never
 * quantity, unit, or which Part: those are physical facts about what
 * arrived, and editing them safely would need real stock
 * reconciliation this page doesn't attempt. Every edit here is
 * deliberately loud, not just logged quietly — this is a real
 * financial record, and Store gets notified by email every time,
 * alongside the audit trail below.
 */
export default async function GoodsReceiptDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; status?: string }>;
}) {
  const { id } = await params;
  const { error, status } = await searchParams;
  const [receipt, auditTrail] = await Promise.all([getGoodsReceipt(id), getGoodsReceiptAuditTrail(id)]);
  if (!receipt) notFound();

  return (
    <div className="p-8">
      <LoadingLink href="/inventory/goods-receipts" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">
        ← Back to Goods Receipts
      </LoadingLink>
      <h1 className="mb-2 text-2xl font-bold text-[var(--ejo-text)]">{receipt.referenceNumber}</h1>
      <p className="mb-6 text-sm text-[var(--ejo-text-muted)]">
        Received by {receipt.receivedBy.fullName} on {new Date(receipt.receivedAt).toLocaleString('en-NG')}
      </p>

      {error ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="error" message={error} />
        </div>
      ) : null}
      {status === 'updated' ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="success" message="Updated — Store has been notified by email." />
        </div>
      ) : null}
      {status === 'cost_updated' ? (
        <div className="mb-6 max-w-2xl">
          <FormFeedbackBanner kind="success" message="Cost corrected — Store has been notified by email." />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Details</h2>
            <form action={updateGoodsReceiptFormAction} className="mt-3 space-y-3">
              <FormPendingOverlay />
              <input type="hidden" name="id" value={receipt.id} />
              <div>
                <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Supplier</label>
                <input
                  name="supplierName"
                  required
                  defaultValue={receipt.supplierName}
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Notes</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={receipt.notes ?? ''}
                  className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
                />
              </div>
              <SubmitButton
                label="Save"
                pendingLabel="Saving…"
                className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-xs font-medium text-white hover:opacity-90"
              />
            </form>
          </div>

          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
            <h2 className="mb-3 text-sm font-semibold text-[var(--ejo-text)]">{pluralize(receipt.lines.length, 'Line')}</h2>
            <div className="space-y-3">
              {receipt.lines.map((line: (typeof receipt.lines)[number]) => (
                <div key={line.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--ejo-text)]">{line.part.name}</span>
                    <span className="text-xs text-[var(--ejo-text-muted)]">
                      {Number(line.quantityReceivedInUnit).toLocaleString('en-NG')} {line.unitUsed}
                      {line.unitUsed !== line.part.baseUnitOfMeasure ? ` (= ${Number(line.quantityInBaseUnit).toLocaleString('en-NG')} ${line.part.baseUnitOfMeasure})` : ''}
                    </span>
                  </div>
                  {line.batchNumber ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Batch: {line.batchNumber}</p> : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[var(--ejo-text-muted)]">
                      Cost on record: <span className="font-medium text-[var(--ejo-text)]">{formatNaira(line.unitCost !== null ? Number(line.unitCost) : null)} per {line.part.baseUnitOfMeasure}</span>
                    </span>
                    <form action={updateGoodsReceiptLineCostFormAction} className="ml-auto flex items-center gap-2">
                      <FormPendingOverlay />
                      <input type="hidden" name="goodsReceiptId" value={receipt.id} />
                      <input type="hidden" name="lineId" value={line.id} />
                      <input
                        name="unitCost"
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        placeholder={`Correct cost per ${line.unitUsed}`}
                        className="w-40 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1.5 text-xs text-[var(--ejo-text)]"
                      />
                      <SubmitButton
                        label="Correct"
                        pendingLabel="Saving…"
                        className="shrink-0 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
                      />
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Audit Trail</h2>
          {auditTrail.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No edits recorded — this is exactly as it was first entered.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {auditTrail.map((entry: (typeof auditTrail)[number]) => (
                <li key={entry.id} className="text-sm">
                  <p className="font-medium text-[var(--ejo-text)]">{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">{entry.userName}</p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">{new Date(entry.createdAt).toLocaleString('en-NG')}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
