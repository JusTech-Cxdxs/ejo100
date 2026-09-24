import { recordRefundFormAction } from '@/lib/actions/refunds-form-handlers';
import { PrintMenu } from '@/components/print/PrintMenu';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { formatDateTime } from '@/lib/utils/format-date';

type RefundRow = {
  id: string;
  referenceNumber: string;
  amount: unknown;
  method: string;
  paidToName: string;
  reason: string;
  notes: string | null;
  recordedAt: Date;
  recordedBy: { fullName: string };
};

function naira(n: number): string {
  return `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Refunds for a cancelled Job Card or Vehicle Service — shared by both
 * pages so they behave identically. Money in, money returned, what is
 * still owed back; Finance's form to record a refund (only once the
 * cancellation is authorised); and every refund with its RF-number and
 * printable receipt.
 */
export function RefundsPanel({
  target,
  paid,
  refunds,
  isCancelled,
  canRecord,
  defaultPaidTo,
  defaultReason,
}: {
  target: { jobCardId: string } | { vehicleServiceId: string };
  paid: number;
  refunds: RefundRow[];
  isCancelled: boolean;
  canRecord: boolean;
  defaultPaidTo: string;
  defaultReason: string | null;
}) {
  const refunded = Math.round(refunds.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;
  const remaining = Math.max(0, Math.round((paid - refunded) * 100) / 100);
  const isJobCard = 'jobCardId' in target;

  return (
    <div id="refunds" className="scroll-mt-24 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Refunds</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            remaining <= 0 ? 'bg-[var(--ejo-success)]/15 text-[var(--ejo-success)]' : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]'
          }`}
        >
          {remaining <= 0 ? 'Fully refunded' : refunded > 0 ? 'Partly refunded' : 'Refund due'}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--ejo-text-muted)]">Paid</dt>
          <dd className="font-semibold text-[var(--ejo-text)]">{naira(paid)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--ejo-text-muted)]">Refunded</dt>
          <dd className="font-semibold text-[var(--ejo-text)]">{naira(refunded)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--ejo-text-muted)]">Still to refund</dt>
          <dd className={`font-semibold ${remaining > 0 ? 'text-[var(--ejo-warning)]' : 'text-[var(--ejo-success)]'}`}>{naira(remaining)}</dd>
        </div>
      </dl>

      {remaining > 0 && !isCancelled ? (
        <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">
          A refund can be recorded once {isJobCard ? 'a Manager approves the cancellation' : 'this service is cancelled by a Manager'}.
        </p>
      ) : null}

      {remaining > 0 && isCancelled && canRecord ? (
        <form action={recordRefundFormAction} className="mt-4 space-y-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-4">
          <FormPendingOverlay />
          {isJobCard ? <input type="hidden" name="jobCardId" value={target.jobCardId} /> : <input type="hidden" name="vehicleServiceId" value={target.vehicleServiceId} />}
          <p className="text-xs text-[var(--ejo-text-muted)]">
            Record the refund once the money has been paid to the customer. You can refund in parts — each gets its own receipt.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Amount refunded (₦)</label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={remaining}
                required
                defaultValue={remaining}
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Paid by</label>
              <select name="method" required className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2 text-sm text-[var(--ejo-text)]">
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CASH">Cash</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Received by (full name)</label>
              <input
                name="paidToName"
                required
                defaultValue={defaultPaidTo}
                className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2 text-sm text-[var(--ejo-text)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Transfer reference / note (optional)</label>
              <input name="notes" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Reason</label>
            <input
              name="reason"
              required
              defaultValue={defaultReason ?? ''}
              placeholder="Why this money is being returned"
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            />
          </div>
          <SubmitButton
            label="Record refund"
            pendingLabel="Recording…"
            className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          />
        </form>
      ) : remaining > 0 && isCancelled ? (
        <p className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/10 px-3 py-2 text-xs text-[var(--ejo-text)]">
          Waiting on Finance to refund {naira(remaining)} to the customer.
          {isJobCard ? ' The vehicle can be handed back once the refund is complete.' : ''}
        </p>
      ) : null}

      {refunds.length > 0 ? (
        <div className="mt-4 space-y-2 text-sm">
          {refunds.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ejo-border)] pb-2 last:border-0">
              <div>
                <p className="text-[var(--ejo-text)]">
                  <span className="font-medium">{r.referenceNumber}</span> — {naira(Number(r.amount))} · {r.method === 'CASH' ? 'Cash' : 'Bank Transfer'} to {r.paidToName}
                </p>
                <p className="text-xs text-[var(--ejo-text-muted)]">
                  Recorded by {r.recordedBy.fullName} · {formatDateTime(r.recordedAt)}
                  {r.notes ? ` · ${r.notes}` : ''}
                </p>
              </div>
              <PrintMenu orgHref={`/print/refunds/${r.id}`} clientHref={`/print/refunds/${r.id}?variant=client`} clientLabel="Customer Copy" size="compact" align="right" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
