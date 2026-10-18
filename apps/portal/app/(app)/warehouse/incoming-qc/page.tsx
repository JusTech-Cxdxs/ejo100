import { allows, guardAnyPage } from '@/lib/authz/server';
import { listReceiptsAwaitingInspection, listRecentInspections } from '@/lib/actions/warehouse';
import { recordIncomingInspectionFormAction } from '@/lib/actions/warehouse-form-handlers';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState, ResponsiveTable, StatusChip, SectionCard } from '@/components/ui';
import { defectRate } from '@/lib/warehouse-core';
import { Banners, BTN, CARD, INPUT, LABEL, LINK, TABLE_WRAP, TD, TD_MUTED, TH, day } from '@/components/warehouse/forms';

const BANNER: Record<string, string> = { inspection_recorded: 'Inspection recorded.' };

/** Incoming QC: every goods receipt of components is sampled and passed or failed (quarantine on fail). */
export default async function IncomingQcPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['warehouse.view'], '/warehouse/incoming-qc');
  const { status, error } = await searchParams;
  const [pending, recent, canOperate, canStore] = await Promise.all([listReceiptsAwaitingInspection(), listRecentInspections(), allows('warehouse.parts.operate'), allows('store.view')]);
  return (
    <div className="p-8">
      <PageHeader icon="check" back={{ href: '/warehouse', label: 'Back to Warehouses' }} title="Incoming QC" description="Sample each delivery of components, test it, and pass or fail it. A failed delivery is quarantined and can raise a supplier claim." />
      <Banners status={status} error={error} map={BANNER} />

      <SectionCard icon="inbox" title={`Awaiting inspection (${pending.length})`} description="Goods receipts recorded in the Components store without a QC result yet." className="mb-6">
        {pending.length === 0 ? <EmptyState compact icon="check" title="Every receipt has been inspected." /> : (
          <div className="space-y-3">
            {pending.map((g) => (
              <details key={g.id} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span><span className="font-semibold text-[var(--ejo-text)]">{g.referenceNumber}</span> <span className="text-[var(--ejo-text-muted)]">· {g.supplierName}{g.purchaseOrder ? ` · ${g.purchaseOrder.number}` : ''} · received {day(g.receivedAt)} by {g.receivedBy.fullName}</span></span>
                  <span className="text-xs text-[var(--ejo-text-muted)]">{g.lines.map((l) => `${l.part.name} × ${Number(l.quantityInBaseUnit)}`).join(', ')}</span>
                </summary>
                <div className="border-t border-[var(--ejo-border)] p-4">
                  {canStore ? <p className="mb-3 text-xs"><LoadingLink href={`/inventory/goods-receipts/${g.id}`} className={LINK}>Open the goods receipt</LoadingLink></p> : null}
                  {canOperate ? (
                    <form action={recordIncomingInspectionFormAction} className="relative grid gap-3 md:grid-cols-[120px_120px_160px_minmax(0,1fr)_auto]">
                      <FormPendingOverlay />
                      <input type="hidden" name="goodsReceiptId" value={g.id} />
                      <label className={LABEL}>Sample size<input name="sampleSize" type="number" min="1" step="1" required className={`${INPUT} mt-1`} /></label>
                      <label className={LABEL}>Defects<input name="defects" type="number" min="0" step="1" defaultValue="0" required className={`${INPUT} mt-1`} /></label>
                      <label className={LABEL}>Result
                        <select name="result" className={`${INPUT} mt-1`} defaultValue="PASS"><option value="PASS">Pass</option><option value="FAIL">Fail</option></select>
                      </label>
                      <label className={LABEL}>Notes<input name="notes" maxLength={500} className={`${INPUT} mt-1`} placeholder="What was tested; what happens on a fail" /></label>
                      <div className="flex flex-col justify-end gap-2">
                        <label className="flex items-center gap-2 text-xs text-[var(--ejo-text)]"><input type="checkbox" name="quarantined" /> Quarantine the delivery</label>
                        <SubmitButton label="Record result" pendingLabel="Saving…" className={BTN} ariaLabel={`Record inspection for ${g.referenceNumber}`} />
                      </div>
                    </form>
                  ) : <p className="text-sm text-[var(--ejo-text-muted)]">The components warehouse records the result.</p>}
                </div>
              </details>
            ))}
          </div>
        )}
      </SectionCard>

      <div className={CARD}>
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Recent inspections</h2>
        {recent.length === 0 ? <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">None recorded yet.</p> : (
          <ResponsiveTable className={`${TABLE_WRAP} mt-3`}>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Receipt</th><th className={TH}>Supplier</th><th className={TH}>Sample</th><th className={TH}>Defects</th><th className={TH}>Result</th><th className={TH}>Inspected</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--ejo-border)] last:border-0">
                    <td className={`${TD} font-medium`}>{canStore ? <LoadingLink href={`/inventory/goods-receipts/${r.goodsReceipt.id}`} className={LINK}>{r.goodsReceipt.referenceNumber}</LoadingLink> : r.goodsReceipt.referenceNumber}{r.goodsReceipt.purchaseOrder ? <span className="block text-xs text-[var(--ejo-text-muted)]">{r.goodsReceipt.purchaseOrder.number}</span> : null}</td>
                    <td data-label="Supplier" className={TD_MUTED}>{r.goodsReceipt.supplierName}</td>
                    <td data-label="Sample" className={TD}>{r.sampleSize}</td>
                    <td data-label="Defects" className={TD}>{r.defects} <span className="text-xs text-[var(--ejo-text-muted)]">({defectRate(r.sampleSize, r.defects)}%)</span></td>
                    <td data-label="Result" className={TD}><StatusChip status={r.passed ? 'PASSED' : 'FAILED'} label={r.passed ? 'Passed' : r.quarantined ? 'Failed · quarantined' : 'Failed'} />{r.notes ? <span className="block text-xs text-[var(--ejo-text-muted)]">{r.notes}</span> : null}</td>
                    <td data-label="Inspected" className={TD_MUTED}>{day(r.inspectedAt)}{r.inspectedBy ? ` · ${r.inspectedBy}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
      </div>
    </div>
  );
}
