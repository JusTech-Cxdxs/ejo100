import { LoadingLink } from '@/components/LoadingLink';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { setEstimateLineBillToFormAction } from '@/lib/actions/estimate-billing-form-handlers';
import { BILL_TO_LABEL, type BillTo } from '@/lib/estimate-billing';
import type { getJobCardBilling } from '@/lib/actions/estimate-billing';

type Billing = NonNullable<Awaited<ReturnType<typeof getJobCardBilling>>>;
const naira = (n: number | null) => (n === null ? '—' : `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const CHIP: Record<BillTo, string> = {
  CUSTOMER: 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]',
  WARRANTY: 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]',
  GOODWILL: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  INTERNAL: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]',
};

/**
 * Who pays for each estimate line — customer, a specific warranty,
 * goodwill or internal. The customer is only ever asked to pay the
 * customer lines (payments, deposits and prints all follow this).
 */
export function JobCardBillingPanel({ jobCardId, billing }: { jobCardId: string; billing: Billing }) {
  const { lines, split, warranties } = billing;
  // No warranty on the vehicle and every line paid by the customer: show one
  // plain sentence; the per-line editor is tucked away for the rare goodwill
  // / internal case. "Warranty" is only offered when a warranty exists.
  const simple = warranties.length === 0 && lines.every((l) => (l.billTo ?? 'CUSTOMER') === 'CUSTOMER');
  const choices = (Object.keys(BILL_TO_LABEL) as BillTo[]).filter((k) => k !== 'WARRANTY' || warranties.length > 0);
  if (lines.length === 0) return null;
  const input = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]';
  const claimable = [...new Map(lines.filter((l) => l.billTo === 'WARRANTY' && l.coveringWarranty).map((l) => [l.coveringWarranty!.id, l.coveringWarranty!])).values()];
  return (
    <div id="who-pays" className="scroll-mt-24 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
      <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Who pays</h2>
      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Lines covered by warranty, goodwill or internally are never charged to the customer.</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-[var(--ejo-primary)]/10 px-3 py-1 font-semibold text-[var(--ejo-primary)]">Customer pays {naira(split.customer)}</span>
        {split.warranty > 0 ? <span className={`rounded-full px-3 py-1 font-medium ${CHIP.WARRANTY}`}>Warranty {naira(split.warranty)}</span> : null}
        {split.goodwill > 0 ? <span className={`rounded-full px-3 py-1 font-medium ${CHIP.GOODWILL}`}>Goodwill {naira(split.goodwill)}</span> : null}
        {split.internal > 0 ? <span className={`rounded-full px-3 py-1 font-medium ${CHIP.INTERNAL}`}>Internal {naira(split.internal)}</span> : null}
      </div>
      {billing.overpaid > 0 ? (
        <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-3 text-xs text-[var(--ejo-text)]">
          The customer has paid {naira(billing.overpaid)} more than they now owe — Finance can refund the difference in the Refunds panel below.
        </p>
      ) : null}
      {simple ? <p className="mt-3 text-sm text-[var(--ejo-text-muted)]">No active warranty on this vehicle — the customer pays for every line.</p> : null}
      <details open={!simple} className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-[var(--ejo-primary)]">{simple ? 'Change who pays (goodwill or internal work)' : 'Who pays — line by line'}</summary>
      <ul className="mt-2 divide-y divide-[var(--ejo-border)]">
        {lines.map((l) => {
          const bt = (l.billTo ?? 'CUSTOMER') as BillTo;
          return (
            <li key={l.id} className="grid gap-2 py-3 text-sm lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.7fr)]">
              <div className="min-w-0">
                <p className="break-words text-[var(--ejo-text)]">{l.description}</p>
                <p className="text-xs text-[var(--ejo-text-muted)]">
                  {naira(l.amount)}{' '}
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${CHIP[bt]}`}>{BILL_TO_LABEL[bt]}</span>
                  {l.coveringWarranty ? (
                    <>
                      {' '}
                      <LoadingLink href={`/warranty/${l.coveringWarranty.id}`} className="text-[var(--ejo-primary)] hover:underline">{l.coveringWarranty.warrantyNumber}</LoadingLink>
                    </>
                  ) : null}
                </p>
                {l.billToNote ? <p className="text-[11px] text-[var(--ejo-text-muted)]">{l.billToNote}</p> : null}
              </div>
              {billing.canEdit ? (
                <form action={setEstimateLineBillToFormAction} className="flex flex-wrap items-center gap-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="jobCardId" value={jobCardId} />
                  <input type="hidden" name="lineId" value={l.id} />
                  <select name="billTo" required defaultValue={bt} className={input}>
                    {choices.map((k) => <option key={k} value={k}>{BILL_TO_LABEL[k]}</option>)}
                  </select>
                  {warranties.length ? (
                    <select name="warrantyId" defaultValue={l.coveringWarranty?.id ?? ''} className={`${input} max-w-[14rem]`}>
                      <option value="">Covering warranty (when Warranty pays)…</option>
                      {warranties.map((w) => <option key={w.id} value={w.id}>{w.warrantyNumber} — {w.subject}</option>)}
                    </select>
                  ) : <input type="hidden" name="warrantyId" value="" />}
                  <input name="note" defaultValue={l.billToNote ?? ''} placeholder="Reason (needed for goodwill or internal)" className={`${input} min-w-0 flex-1`} />
                  <SubmitButton label="Save" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
      </details>
      {claimable.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {claimable.map((w) => (
            <LoadingLink key={w.id} href={`/warranty/claims/new?warrantyId=${w.id}&jobCardId=${jobCardId}`} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
              Start a claim on {w.warrantyNumber} (amounts filled in)
            </LoadingLink>
          ))}
        </div>
      ) : null}
      {!billing.canEdit && !billing.isClosed ? <p className="mt-3 text-[11px] text-[var(--ejo-text-muted)]">The Warranty HOD or a Branch Manager decides who pays for each line.</p> : null}
    </div>
  );
}
