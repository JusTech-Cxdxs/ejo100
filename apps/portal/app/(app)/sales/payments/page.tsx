import { guardAnyPage } from '@/lib/authz/server';
import { redirect } from 'next/navigation';
import { listSalesPayments, getSalesRights } from '@/lib/actions/sales';
import { requireUser } from '@/lib/actions/workshop';
import { confirmSalesPaymentFormAction, rejectSalesPaymentFormAction } from '@/lib/actions/sales-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { PageHeader, HeaderAction, StatusChip, ResponsiveTable, EmptyState, StatTile } from '@/components/ui';
import { formatDateOnly } from '@/lib/utils/format-date';
import { naira, PAYMENT_METHOD_LABEL, round2 } from '@/lib/sales-core';
import { CHIP, INPUT } from '@/components/sales/ui';

const BANNER: Record<string, string> = { payment_confirmed: 'Payment confirmed.', payment_rejected: 'Payment rejected.' };

/** Payments recorded against sales orders: pending ones for Finance to confirm, and the confirmed and rejected history. `?export=csv` hands over to the CSV route. */
export default async function SalesPaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; export?: string; show?: string }> }) {
  await guardAnyPage(['sales.view'], '/sales');
  const { status, error, export: exp, show } = await searchParams;
  if (exp === 'csv') redirect('/sales/payments/export');
  const filter = ['PENDING', 'CONFIRMED', 'REJECTED'].includes(show ?? '') ? show : null;
  const [payments, rights, viewer] = await Promise.all([listSalesPayments({ status: filter ?? undefined }), getSalesRights(), requireUser()]);
  const pending = payments.filter((p: (typeof payments)[number]) => p.status === 'PENDING');
  const confirmed = payments.filter((p: (typeof payments)[number]) => p.status === 'CONFIRMED');
  const pendingTotal = round2(pending.reduce((s: number, p: (typeof payments)[number]) => s + Number(p.amount), 0));
  const confirmedTotal = round2(confirmed.reduce((s: number, p: (typeof payments)[number]) => s + Number(p.amount), 0));
  return (
    <div className="p-8">
      <PageHeader icon="money" back={{ href: '/sales', label: 'Back to Sales' }} title="Payments" description="What customers paid against their orders. Sales or Billing record a payment; Finance confirms it against the bank statement — never the person who recorded it. Confirmed payments count as revenue." actions={rights.exportCsv ? <HeaderAction href="/sales/payments/export" icon="download" variant="secondary">Export CSV</HeaderAction> : null} />
      {status && BANNER[status] ? <div className="max-w-2xl"><FormFeedbackBanner kind="success" message={BANNER[status]} /></div> : null}
      {error ? <div className="max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon="clock" label="Awaiting confirmation" value={pending.length} hint={naira(pendingTotal)} tone={pending.length ? 'warning' : 'neutral'} />
        <StatTile icon="check-circle" label="Confirmed (shown)" value={confirmed.length} hint={naira(confirmedTotal)} tone="success" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <LoadingLink href="/sales/payments" className={CHIP(!filter)}>All</LoadingLink>
        {(['PENDING', 'CONFIRMED', 'REJECTED'] as const).map((s) => <LoadingLink key={s} href={`/sales/payments?show=${s}`} className={CHIP(filter === s)}>{s === 'PENDING' ? 'To confirm' : s === 'CONFIRMED' ? 'Confirmed' : 'Rejected'}</LoadingLink>)}
      </div>
      {payments.length === 0 ? <EmptyState icon="money" title="No payments in this view">Payments are recorded on each sales order.</EmptyState> : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-3 py-2">Order</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Method · reference</th><th className="px-3 py-2">Paid on</th><th className="px-3 py-2">Recorded by</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Decision</th></tr></thead>
            <tbody>
              {payments.map((p: (typeof payments)[number]) => {
                const mayDecide = rights.confirm && p.status === 'PENDING' && p.recordedById !== viewer.id;
                return (
                  <tr key={p.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                    <td className="px-3 py-2"><LoadingLink href={`/sales/orders/${p.salesOrder.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{p.salesOrder.number}</LoadingLink><div className="text-xs text-[var(--ejo-text-muted)]">{naira(Number(p.salesOrder.amountPaid))} of {naira(Number(p.salesOrder.total))} paid</div></td>
                    <td data-label="Customer" className="px-3 py-2 text-[var(--ejo-text)]">{p.salesOrder.customer.fullName}</td>
                    <td data-label="Amount" className="px-3 py-2 text-right font-medium text-[var(--ejo-text)]">{naira(Number(p.amount))}</td>
                    <td data-label="Method" className="px-3 py-2 text-xs text-[var(--ejo-text)]">{PAYMENT_METHOD_LABEL[p.method] ?? p.method}{p.reference ? <div className="text-[var(--ejo-text-muted)]">{p.reference}</div> : null}</td>
                    <td data-label="Paid on" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{formatDateOnly(p.paidAt)}</td>
                    <td data-label="Recorded by" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{p.recordedByName ?? 'Customer portal'}{p.confirmedByName ? <div>{p.status === 'CONFIRMED' ? 'Confirmed' : 'Rejected'} by {p.confirmedByName}</div> : null}</td>
                    <td data-label="Status" className="px-3 py-2"><StatusChip status={p.status} />{p.rejectedReason ? <div className="text-xs text-[var(--ejo-text-muted)]">{p.rejectedReason}</div> : null}</td>
                    <td data-label="Decision" className="px-3 py-2">
                      {mayDecide ? (
                        <div className="flex flex-col gap-1">
                          <form action={confirmSalesPaymentFormAction}><FormPendingOverlay /><input type="hidden" name="salesOrderId" value={p.salesOrder.id} /><input type="hidden" name="salesPaymentId" value={p.id} /><input type="hidden" name="back" value="payments" /><SubmitButton label="Confirm" pendingLabel="Confirming…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90" /></form>
                          <form action={rejectSalesPaymentFormAction} className="flex gap-1"><FormPendingOverlay /><input type="hidden" name="salesOrderId" value={p.salesOrder.id} /><input type="hidden" name="salesPaymentId" value={p.id} /><input type="hidden" name="back" value="payments" /><input name="reason" required className={`${INPUT} py-1 text-xs`} placeholder="Why not?" /><SubmitButton label="Reject" pendingLabel="…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2 py-1 text-xs text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" /></form>
                        </div>
                      ) : rights.confirm && p.status === 'PENDING' ? <span className="text-xs text-[var(--ejo-text-muted)]">You recorded it</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
