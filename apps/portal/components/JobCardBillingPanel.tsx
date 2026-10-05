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
 * Who pays for each estimate line — only shown when it has a real job to do:
 *  • nothing on the estimate → nothing;
 *  • settled (paid in full or job closed) and all customer-paid → nothing;
 *  • settled with covered lines → a read-only summary (+ "Start a claim");
 *  • no warranty on the vehicle or its parts, not settled → one quiet link
 *    ("Goodwill or internal work? Change who pays");
 *  • a warranty exists, not settled → step by step: 1 covered by,
 *    2 who pays each line (Warranty offered only here), 3 start the claim.
 */
export function JobCardBillingPanel({ jobCardId, billing }: { jobCardId: string; billing: Billing }) {
  const { lines, split, warranties } = billing;
  if (lines.length === 0) return null;
  const bt = (l: (typeof lines)[number]) => (l.billTo ?? 'CUSTOMER') as BillTo;
  const covered = lines.filter((l) => bt(l) !== 'CUSTOMER');
  const paidInFull = split.customer > 0 ? billing.netPaid >= split.customer - 0.009 : covered.length > 0;
  const settled = billing.isClosed || paidInFull || !billing.canEdit;
  const hasWarranty = warranties.length > 0;
  const claimable = [...new Map(lines.filter((l) => bt(l) === 'WARRANTY' && l.coveringWarranty).map((l) => [l.coveringWarranty!.id, l.coveringWarranty!])).values()];
  const box = 'scroll-mt-24 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]';
  const claims = claimable.length ? (
    <div className="mt-3 flex flex-wrap gap-2">
      {claimable.map((w) => (
        <LoadingLink key={w.id} href={`/warranty/claims/new?warrantyId=${w.id}&jobCardId=${jobCardId}`} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Start a claim on {w.warrantyNumber} (amounts filled in)</LoadingLink>
      ))}
    </div>
  ) : null;
  const summary = (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="rounded-full bg-[var(--ejo-primary)]/10 px-3 py-1 font-semibold text-[var(--ejo-primary)]">Customer {naira(split.customer)}</span>
      {split.warranty > 0 ? <span className={`rounded-full px-3 py-1 font-medium ${CHIP.WARRANTY}`}>Warranty {naira(split.warranty)}</span> : null}
      {split.goodwill > 0 ? <span className={`rounded-full px-3 py-1 font-medium ${CHIP.GOODWILL}`}>Goodwill {naira(split.goodwill)}</span> : null}
      {split.internal > 0 ? <span className={`rounded-full px-3 py-1 font-medium ${CHIP.INTERNAL}`}>Internal {naira(split.internal)}</span> : null}
    </div>
  );

  // Settled: nothing left to decide.
  if (settled) {
    if (covered.length === 0) return null;
    return (
      <div id="who-pays" className={`${box} p-5`}>
        <h2 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Who paid</h2>
        {summary}
        <ul className="mt-3 space-y-1 text-xs text-[var(--ejo-text-muted)]">
          {covered.map((l) => (
            <li key={l.id}>
              <span className="text-[var(--ejo-text)]">{l.description}</span> — {naira(l.amount)} · {BILL_TO_LABEL[bt(l)]}
              {l.coveringWarranty ? <> · <LoadingLink href={`/warranty/${l.coveringWarranty.id}`} className="text-[var(--ejo-primary)] hover:underline">{l.coveringWarranty.warrantyNumber}</LoadingLink></> : null}
              {l.billToNote ? ` · ${l.billToNote}` : ''}
            </li>
          ))}
        </ul>
        {claims}
      </div>
    );
  }

  const choices = (Object.keys(BILL_TO_LABEL) as BillTo[]).filter((k) => k !== 'WARRANTY' || hasWarranty);
  const input = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]';
  const editor = (
    <ul className="divide-y divide-[var(--ejo-border)]">
      {lines.map((l) => (
        <li key={l.id} className="grid gap-2 py-2.5 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <p className="break-words text-[var(--ejo-text)]">{l.description} <span className="text-xs text-[var(--ejo-text-muted)]">· {naira(l.amount)}</span></p>
            {bt(l) !== 'CUSTOMER' ? <p className="text-[11px] text-[var(--ejo-text-muted)]">{BILL_TO_LABEL[bt(l)]}{l.coveringWarranty ? ` · ${l.coveringWarranty.warrantyNumber}` : ''}{l.billToNote ? ` · ${l.billToNote}` : ''}</p> : null}
          </div>
          <form action={setEstimateLineBillToFormAction} className="flex flex-wrap items-center gap-2">
            <FormPendingOverlay />
            <input type="hidden" name="jobCardId" value={jobCardId} />
            <input type="hidden" name="lineId" value={l.id} />
            <select name="billTo" required defaultValue={bt(l)} aria-label="Who pays" className={input}>
              {choices.map((k) => <option key={k} value={k}>{BILL_TO_LABEL[k]}</option>)}
            </select>
            {hasWarranty ? (
              <select name="warrantyId" defaultValue={l.coveringWarranty?.id ?? ''} aria-label="Covering warranty" className={`${input} max-w-[12rem]`}>
                <option value="">Warranty (if Warranty pays)…</option>
                {warranties.map((w) => <option key={w.id} value={w.id}>{w.warrantyNumber}</option>)}
              </select>
            ) : <input type="hidden" name="warrantyId" value="" />}
            <input name="note" defaultValue={l.billToNote ?? ''} placeholder="Reason (goodwill / internal)" aria-label="Reason" className={`${input} w-44`} />
            <SubmitButton label="Save" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
          </form>
        </li>
      ))}
    </ul>
  );

  // No warranty anywhere, everything customer-paid: one quiet link.
  if (!hasWarranty && covered.length === 0) {
    return (
      <details id="who-pays" className={`${box} px-5 py-3`}>
        <summary className="cursor-pointer text-xs font-medium text-[var(--ejo-primary)]">Goodwill or internal work? Change who pays</summary>
        <p className="mt-2 text-[11px] text-[var(--ejo-text-muted)]">Lines marked goodwill or internal are never charged to the customer. A reason is required.</p>
        {editor}
      </details>
    );
  }

  // A warranty exists (or lines are already covered): step by step.
  return (
    <div id="who-pays" className={`${box} p-5`}>
      <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Who pays</h2>
      <div className="mt-2">{summary}</div>
      {billing.overpaid > 0 ? <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-3 text-xs text-[var(--ejo-text)]">The customer has paid {naira(billing.overpaid)} more than they now owe — Finance can refund the difference below.</p> : null}
      <ol className="mt-4 space-y-4 text-sm">
        {hasWarranty ? (
          <li>
            <p className="text-xs font-semibold text-[var(--ejo-text-muted)]">1 · Covered by</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {warranties.map((w) => <li key={w.id}><LoadingLink href={`/warranty/${w.id}`} className={`rounded-full px-3 py-1 text-xs font-medium ${CHIP.WARRANTY} hover:underline`}>{w.warrantyNumber} — {w.subject}</LoadingLink></li>)}
            </ul>
          </li>
        ) : null}
        <li>
          <p className="text-xs font-semibold text-[var(--ejo-text-muted)]">{hasWarranty ? '2 · ' : ''}Who pays each line</p>
          {editor}
        </li>
        {claims ? <li><p className="text-xs font-semibold text-[var(--ejo-text-muted)]">{hasWarranty ? '3 · ' : ''}Claim from the warranty provider</p>{claims}</li> : null}
      </ol>
    </div>
  );
}
