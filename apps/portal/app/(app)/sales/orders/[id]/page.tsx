import { guardAnyPage, allows } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getSalesOrder, getSalesOrderAuditTrail, getSalesRights } from '@/lib/actions/sales';
import { requireUser } from '@/lib/actions/workshop';
import { humanizeAction } from '@/lib/humanize-action';
import {
  issueProFormaFormAction, recordSalesPaymentFormAction, confirmSalesPaymentFormAction, rejectSalesPaymentFormAction, approveCreditSaleFormAction, declineCreditSaleFormAction,
  clearOrderForReleaseFormAction, issueSalesInvoiceFormAction, closeSalesOrderFormAction, cancelSalesOrderFormAction, requestSalesReturnFormAction,
} from '@/lib/actions/sales-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { AuditTrail } from '@/components/AuditTrail';
import { CustomerLink } from '@/components/CustomerLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { RevealPanel } from '@/components/ui/RevealPanel';
import { BackLink, PageTitle, StatusChip, SectionCard, ResponsiveTable, EmptyState } from '@/components/ui';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';
import { naira, ORDER_STATUS_LABEL, CHANNEL_LABEL, PAYMENT_TERMS_LABEL, PAYMENT_METHOD_LABEL, RETURN_STATUS_LABEL, PRO_FORMA_STATUSES, PAYABLE_ORDER_STATUSES, CANCELLABLE_ORDER_STATUSES, RETURNABLE_ORDER_STATUSES, type OrderStatus, type PaymentTerms, type ReturnStatus } from '@/lib/sales-core';
import { INPUT, LABEL, BTN, BTN_LINE } from '@/components/sales/ui';

const BANNER: Record<string, string> = {
  confirmed: 'Sales order confirmed from the quotation.',
  credit_approval_needed: 'Sales order confirmed on credit — it exceeds the dealer\'s remaining credit, so Finance must approve the credit sale before release.',
  pro_forma_issued: 'Pro-forma invoice issued. The customer has been emailed if they have an address.',
  payment_recorded: 'Payment recorded — waiting for Finance to confirm it.',
  payment_confirmed: 'Payment confirmed.',
  payment_rejected: 'Payment rejected.',
  credit_approved: 'Credit sale approved.',
  credit_declined: 'Credit sale declined — the order is cancelled.',
  cleared: 'Cleared for release. The goods release note is issued to the warehouse.',
  invoiced: 'Tax invoice issued.',
  closed: 'Order closed.',
  cancelled: 'Order cancelled.',
};
const ACTION_LABEL: Record<string, string> = {
  'sales_order.confirmed': 'Order confirmed',
  'pro_forma_invoice.issued': 'Pro-forma invoice issued',
  'sales_payment.recorded': 'Payment recorded',
  'sales_payment.confirmed': 'Payment confirmed by Finance',
  'sales_payment.rejected': 'Payment rejected',
  'sales_order.paid': 'Paid in full',
  'sales_order.credit_approved': 'Credit sale approved',
  'sales_order.credit_declined': 'Credit sale declined',
  'sales_order.cleared': 'Cleared for release',
  'sales_invoice.issued': 'Tax invoice issued',
  'sales_order.closed': 'Order closed',
  'sales_order.cancelled': 'Order cancelled',
};

export default async function SalesOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['sales.view'], '/sales');
  const { id } = await params;
  const { status, error } = await searchParams;
  const o = await getSalesOrder(id);
  if (!o) notFound();
  const [trail, rights, viewer, canSeeCustomers] = await Promise.all([getSalesOrderAuditTrail(id), getSalesRights(o.branchId), requireUser(), allows('crm.view')]);
  const st = o.status as OrderStatus;
  const terms = o.paymentTerms as PaymentTerms;
  const canRecordPayment = (rights.quote || rights.billing) && PAYABLE_ORDER_STATUSES.includes(st);
  const canIssuePfi = rights.billing && PRO_FORMA_STATUSES.includes(st) && !(terms === 'PREPAID' && o.proFormas.some((p: (typeof o.proFormas)[number]) => p.status === 'ISSUED'));
  const canDecideCredit = rights.credit && o.creditNeedsApproval && o.confirmedById !== viewer.id && CANCELLABLE_ORDER_STATUSES.includes(st);
  const canClear = rights.confirm && o.clearance.ok;
  const latestPfi = o.proFormas[0] ?? null;
  const latestInvoice = o.invoices[0] ?? null;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  const steps: { label: string; done: boolean; hint?: string | null }[] = [
    { label: 'Confirmed', done: true, hint: `${o.confirmedBy.fullName} · ${formatDateOnly(o.createdAt)}` },
    { label: 'Pro-forma', done: o.proFormas.length > 0, hint: latestPfi?.number },
    { label: terms === 'CREDIT' ? 'Credit' : 'Paid', done: terms === 'CREDIT' ? !o.creditNeedsApproval : Number(o.amountPaid) >= Number(o.total), hint: terms === 'CREDIT' ? (o.creditNeedsApproval ? 'awaiting Finance' : 'approved') : `${naira(Number(o.amountPaid))} of ${naira(Number(o.total))}` },
    { label: 'Cleared', done: Boolean(o.clearedAt), hint: o.clearedById ? `${o.names.get(o.clearedById) ?? ''} · ${o.clearedAt ? formatDateOnly(o.clearedAt) : ''}` : null },
    { label: 'Released', done: ['RELEASED', 'DISPATCHED', 'DELIVERED', 'INVOICED', 'CLOSED'].includes(st) },
    { label: 'Dispatched', done: ['DISPATCHED', 'DELIVERED', 'INVOICED', 'CLOSED'].includes(st) },
    { label: 'Delivered', done: ['DELIVERED', 'INVOICED', 'CLOSED'].includes(st) },
    { label: 'Invoiced', done: ['INVOICED', 'CLOSED'].includes(st), hint: latestInvoice?.number },
  ];

  return (
    <div className="p-8">
      <BackLink href="/sales/orders" label="Back to Sales orders" />
      {status && BANNER[status] ? <div className="max-w-2xl"><FormFeedbackBanner kind="success" message={BANNER[status]} /></div> : null}
      {error ? <div className="max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="receipt">{o.number}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
            <CustomerLink id={o.customerId} name={o.customer.fullName} canView={canSeeCustomers} /> · {CHANNEL_LABEL[o.channel] ?? o.channel} · {PAYMENT_TERMS_LABEL[terms]}
            {o.quotation ? <> · from <LoadingLink href={`/sales/quotations/${o.quotation.id}`} className="text-[var(--ejo-primary)] hover:underline">{o.quotation.number}</LoadingLink></> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={o.status} label={ORDER_STATUS_LABEL[st]} className="px-3 py-1 text-sm" />
          {latestPfi ? <PrintMenu orgHref={`/print/pro-forma/${latestPfi.id}`} clientHref={`/print/pro-forma/${latestPfi.id}?variant=client`} clientLabel="Customer Copy" /> : null}
          {latestInvoice ? <PrintMenu orgHref={`/print/invoice/${latestInvoice.id}`} clientHref={`/print/invoice/${latestInvoice.id}?variant=client`} clientLabel="Customer Copy" /> : null}
        </div>
      </div>

      {o.creditNeedsApproval && st !== 'CANCELLED' ? <div className="mb-6 max-w-3xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-4 text-sm text-[var(--ejo-text)]"><span className="font-medium">Credit sale awaiting Finance:</span> {naira(Number(o.total))} against {naira(o.credit?.remaining ?? 0)} left on the dealer&apos;s credit limit.</div> : null}
      {o.cancelledReason ? <div className="mb-6 max-w-3xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5 p-4 text-sm text-[var(--ejo-text)]"><span className="font-medium">Cancelled:</span> {o.cancelledReason}</div> : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <div key={s.label} className={`rounded-[var(--ejo-radius-md)] border px-3 py-2 text-xs ${s.done ? 'border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'}`}>
            <p className="font-medium text-[var(--ejo-text)]">{s.done ? '✓' : `${i + 1}.`} {s.label}</p>
            {s.hint ? <p className="text-[var(--ejo-text-muted)]">{s.hint}</p> : null}
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <SectionCard icon="list" title="Lines" flush>
            <ResponsiveTable>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-4 py-2">Product</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Unit price</th><th className="px-4 py-2 text-right">Discount</th><th className="px-4 py-2 text-right">Line total</th></tr></thead>
                <tbody>
                  {o.lines.map((l: (typeof o.lines)[number]) => (
                    <tr key={l.id} className="border-b border-[var(--ejo-border)] last:border-0">
                      <td data-label="Product" className="px-4 py-2 text-[var(--ejo-text)]">{l.description}<div className="text-xs text-[var(--ejo-text-muted)]">{l.product.sku}{l.configuration ? `-${l.configuration.code}` : ''} · {l.product.source === 'ASSEMBLED' ? 'assembled on the line' : l.product.source === 'KIT' ? 'kit' : 'from stock'} · {l.fulfilledQuantity}/{l.quantity} fulfilled{l.notes ? ` · ${l.notes}` : ''}</div></td>
                      <td data-label="Qty" className="px-4 py-2 text-right">{l.quantity}</td>
                      <td data-label="Unit price" className="px-4 py-2 text-right">{naira(Number(l.unitPrice))}</td>
                      <td data-label="Discount" className="px-4 py-2 text-right">{Number(l.discountPercent)}%</td>
                      <td data-label="Line total" className="px-4 py-2 text-right font-medium">{naira(Number(l.lineTotal))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="text-sm">
                  <tr><td colSpan={4} className="px-4 py-1 text-right text-[var(--ejo-text-muted)]">Goods</td><td className="px-4 py-1 text-right">{naira(Number(o.subtotal))}</td></tr>
                  <tr><td colSpan={4} className="px-4 py-1 text-right text-[var(--ejo-text-muted)]">Discounts</td><td className="px-4 py-1 text-right">- {naira(Number(o.discountTotal))}</td></tr>
                  <tr><td colSpan={4} className="px-4 py-1 text-right text-[var(--ejo-text-muted)]">VAT 7.5%</td><td className="px-4 py-1 text-right">{naira(Number(o.taxTotal))}</td></tr>
                  <tr className="border-t border-[var(--ejo-border)] font-semibold"><td colSpan={4} className="px-4 py-2 text-right">Total</td><td className="px-4 py-2 text-right">{naira(Number(o.total))}</td></tr>
                  <tr><td colSpan={4} className="px-4 py-1 text-right text-[var(--ejo-text-muted)]">Paid (confirmed)</td><td className="px-4 py-1 text-right text-[var(--ejo-success)]">{naira(Number(o.amountPaid))}</td></tr>
                  <tr><td colSpan={4} className="px-4 py-1 text-right text-[var(--ejo-text-muted)]">Balance</td><td className="px-4 py-1 text-right">{naira(o.balance)}</td></tr>
                </tfoot>
              </table>
            </ResponsiveTable>
          </SectionCard>

          <SectionCard icon="receipt" title="Pro-forma invoices" flush>
            {o.proFormas.length === 0 ? <EmptyState compact icon="receipt" title="No pro-forma invoice yet">{rights.billing ? 'Issue one from the panel on the right.' : 'Billing issues it once the order is confirmed.'}</EmptyState> : (
              <ul className="divide-y divide-[var(--ejo-border)] text-sm">
                {o.proFormas.map((p: (typeof o.proFormas)[number]) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                    <span><span className="font-medium text-[var(--ejo-text)]">{p.number}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{naira(Number(p.total))} · issued {formatDateOnly(p.issuedAt)} by {o.names.get(p.issuedById) ?? ''}{p.dueDate ? ` · pay by ${formatDateOnly(p.dueDate)}` : ''}</span></span>
                    <span className="flex items-center gap-2"><StatusChip status={p.status} /><PrintMenu size="compact" align="right" orgHref={`/print/pro-forma/${p.id}`} clientHref={`/print/pro-forma/${p.id}?variant=client`} clientLabel="Customer Copy" /></span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon="money" title="Payments" description="Recorded by Sales or Billing, confirmed by Finance — never the same person" flush>
            {o.payments.length === 0 ? <EmptyState compact icon="money" title="No payments recorded">Record what the customer paid once the money shows.</EmptyState> : (
              <ul className="divide-y divide-[var(--ejo-border)] text-sm">
                {o.payments.map((p: (typeof o.payments)[number]) => {
                  const mayDecide = rights.confirm && p.status === 'PENDING' && p.recordedById !== viewer.id;
                  return (
                    <li key={p.id} className="px-4 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span><span className="font-medium text-[var(--ejo-text)]">{naira(Number(p.amount))}</span> — {PAYMENT_METHOD_LABEL[p.method] ?? p.method}<span className="block text-xs text-[var(--ejo-text-muted)]">{p.reference ? `Ref ${p.reference} · ` : ''}paid {formatDateOnly(p.paidAt)} · recorded by {p.recordedById ? o.names.get(p.recordedById) ?? 'staff' : 'the customer'}{p.confirmedById ? ` · ${p.status === 'CONFIRMED' ? 'confirmed' : 'rejected'} by ${o.names.get(p.confirmedById) ?? ''}` : ''}{p.rejectedReason ? ` — ${p.rejectedReason}` : ''}{p.proofNote ? ` · ${p.proofNote}` : ''}</span></span>
                        <StatusChip status={p.status} />
                      </div>
                      {mayDecide ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <form action={confirmSalesPaymentFormAction}><FormPendingOverlay /><input type="hidden" name="salesOrderId" value={o.id} /><input type="hidden" name="salesPaymentId" value={p.id} /><SubmitButton label="Confirm payment" pendingLabel="Confirming…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90" /></form>
                          <form action={rejectSalesPaymentFormAction} className="flex gap-2"><FormPendingOverlay /><input type="hidden" name="salesOrderId" value={o.id} /><input type="hidden" name="salesPaymentId" value={p.id} /><input name="reason" required className={`${INPUT} max-w-xs py-1.5 text-xs`} placeholder="Why not?" /><SubmitButton label="Reject" pendingLabel="Rejecting…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" /></form>
                        </div>
                      ) : rights.confirm && p.status === 'PENDING' ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">You recorded this payment, so someone else in Finance confirms it.</p> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard icon="truck" title="Release, dispatch, invoice and returns" flush>
            <ul className="divide-y divide-[var(--ejo-border)] text-sm">
              {o.releases.map((r: (typeof o.releases)[number]) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <span>Goods release note <LoadingLink href={`/warehouse/releases/${r.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{r.number}</LoadingLink><span className="block text-xs text-[var(--ejo-text-muted)]">{r._count.lines} {r._count.lines === 1 ? 'line' : 'lines'} · issued {formatDateOnly(r.issuedAt)}{r.dispatch ? <> · dispatch <LoadingLink href={`/warehouse/dispatches/${r.dispatch.id}`} className="hover:underline">{r.dispatch.number}</LoadingLink></> : null}</span></span>
                  <StatusChip status={r.status} />
                </li>
              ))}
              {o.buildOrders.map((b: (typeof o.buildOrders)[number]) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <span>Build order <LoadingLink href={`/production/build-orders/${b.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{b.number}</LoadingLink><span className="block text-xs text-[var(--ejo-text-muted)]">{b.quantity} × {b.configuration.product.name} — {b.configuration.name}</span></span>
                  <StatusChip status={b.status} />
                </li>
              ))}
              {o.dispatches.map((d: (typeof o.dispatches)[number]) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <span>Dispatch <LoadingLink href={`/warehouse/dispatches/${d.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{d.number}</LoadingLink><span className="block text-xs text-[var(--ejo-text-muted)]">{formatDateOnly(d.dispatchedAt)}{d.waybill ? ` · waybill ${d.waybill}` : ''}{d.deliveredAt ? ` · delivered ${formatDateOnly(d.deliveredAt)}` : ''}</span></span>
                  <StatusChip status={d.status} />
                </li>
              ))}
              {o.invoices.map((i: (typeof o.invoices)[number]) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <span>Tax invoice <span className="font-medium text-[var(--ejo-text)]">{i.number}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{naira(Number(i.total))} · issued {formatDateOnly(i.issuedAt)} by {o.names.get(i.issuedById) ?? ''}{i.exportReference ? ` · exported ${i.exportReference}` : ''}</span></span>
                  <span className="flex items-center gap-2"><StatusChip status={i.status} /><PrintMenu size="compact" align="right" orgHref={`/print/invoice/${i.id}`} clientHref={`/print/invoice/${i.id}?variant=client`} clientLabel="Customer Copy" /></span>
                </li>
              ))}
              {o.returns.map((r: (typeof o.returns)[number]) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <span>Return <LoadingLink href={`/sales/returns/${r.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{r.number}</LoadingLink><span className="block text-xs text-[var(--ejo-text-muted)]">{r.reason.slice(0, 120)}</span></span>
                  <StatusChip status={r.status} label={RETURN_STATUS_LABEL[r.status as ReturnStatus]} />
                </li>
              ))}
              {o.releases.length + o.buildOrders.length + o.dispatches.length + o.invoices.length + o.returns.length === 0 ? <li><EmptyState compact icon="truck" title="Nothing released yet">Once Finance clears the order, the release note appears here for the warehouse.</EmptyState></li> : null}
            </ul>
            {o.units.length ? <p className="px-4 py-2 text-xs text-[var(--ejo-text-muted)]">Serials on this order: {o.units.map((u: (typeof o.units)[number]) => u.serialNumber).join(', ')}</p> : null}
          </SectionCard>

          <SectionCard icon="history" title="Audit trail">
            <AuditTrail entries={trail.map((e: (typeof trail)[number]) => {
              const meta = (e.metadata ?? {}) as Record<string, unknown>;
              const parts = [typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : null, typeof meta.amount === 'number' ? naira(meta.amount) : null, typeof meta.releaseNote === 'string' ? `Release note ${meta.releaseNote}` : null, Array.isArray(meta.buildOrders) && meta.buildOrders.length ? `Build ${(meta.buildOrders as string[]).join(', ')}` : null, typeof meta.paymentTerms === 'string' && e.action === 'sales_order.confirmed' ? `${meta.paymentTerms.toLowerCase()} terms` : null].filter(Boolean);
              return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: parts.join(' · ') || null, dateLabel: formatDateTime(e.createdAt) };
            })} />
          </SectionCard>
        </div>

        <div className="space-y-4">
          <div className="space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Next step</h2>
            {canIssuePfi ? (
              <RevealPanel label="Issue pro-forma invoice" icon="receipt">
                <form action={issueProFormaFormAction} className="space-y-2"><FormPendingOverlay /><input type="hidden" name="salesOrderId" value={o.id} />
                  <div><label htmlFor="pfi-due" className={LABEL}>Pay by</label><input id="pfi-due" name="dueDate" type="date" className={INPUT} defaultValue={new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })} /></div>
                  <input name="notes" className={INPUT} placeholder="Note on the invoice (optional)" />
                  <SubmitButton label="Issue pro-forma invoice" pendingLabel="Issuing…" className={BTN} />
                </form>
              </RevealPanel>
            ) : null}
            {canRecordPayment ? (
              <RevealPanel label="Record payment" icon="money" open={error?.toLowerCase().includes('payment') || undefined}>
                <form action={recordSalesPaymentFormAction} className="space-y-2"><FormPendingOverlay /><input type="hidden" name="salesOrderId" value={o.id} />
                  <div><label htmlFor="pay-amount" className={LABEL}>Amount (₦)</label><input id="pay-amount" name="amount" inputMode="decimal" required className={INPUT} defaultValue={o.balance > 0 ? String(o.balance) : ''} /></div>
                  <div><label htmlFor="pay-method" className={LABEL}>Method</label><select id="pay-method" name="method" required className={INPUT} defaultValue="BANK_TRANSFER">{Object.entries(PAYMENT_METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <div><label htmlFor="pay-ref" className={LABEL}>Reference (teller, transfer or POS slip)</label><input id="pay-ref" name="reference" className={INPUT} /></div>
                  <div><label htmlFor="pay-date" className={LABEL}>Paid on</label><input id="pay-date" name="paidAt" type="date" className={INPUT} defaultValue={today} /></div>
                  <input name="proofNote" className={INPUT} placeholder="Proof note (optional)" />
                  <SubmitButton label="Record payment" pendingLabel="Recording…" className={BTN} />
                </form>
              </RevealPanel>
            ) : null}
            {canDecideCredit ? (
              <>
                <form action={approveCreditSaleFormAction}><FormPendingOverlay /><input type="hidden" name="salesOrderId" value={o.id} /><SubmitButton label="Approve credit sale" pendingLabel="Approving…" className={BTN} /></form>
                <form action={declineCreditSaleFormAction} className="space-y-2"><FormPendingOverlay /><input type="hidden" name="salesOrderId" value={o.id} /><input name="reason" required className={INPUT} placeholder="Why not?" /><SubmitButton label="Decline credit sale" pendingLabel="Declining…" className={BTN_LINE} /></form>
              </>
            ) : null}
            {rights.confirm && CANCELLABLE_ORDER_STATUSES.includes(st) ? (
              canClear ? (
                <form action={clearOrderForReleaseFormAction}><FormPendingOverlay /><input type="hidden" name="salesOrderId" value={o.id} /><SubmitButton label="Clear for release" pendingLabel="Clearing…" className={BTN} /><p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Issues the goods release note to the warehouse{o.lines.some((l: (typeof o.lines)[number]) => l.product.source === 'ASSEMBLED') ? ' and a build order for the assembled lines' : ''}.</p></form>
              ) : <p className="text-xs text-[var(--ejo-text-muted)]">{o.clearance.why}</p>
            ) : null}
            {rights.billing && st === 'DELIVERED' ? <form action={issueSalesInvoiceFormAction}><FormPendingOverlay /><input type="hidden" name="salesOrderId" value={o.id} /><SubmitButton label="Issue tax invoice" pendingLabel="Issuing…" className={BTN} /></form> : null}
            {rights.billing && st === 'INVOICED' ? <form action={closeSalesOrderFormAction}><FormPendingOverlay /><input type="hidden" name="salesOrderId" value={o.id} /><SubmitButton label="Close order" pendingLabel="Closing…" className={BTN_LINE} /></form> : null}
            {['IN_PRODUCTION', 'READY'].includes(st) ? <p className="text-xs text-[var(--ejo-text-muted)]">{st === 'IN_PRODUCTION' ? 'The line is building the assembled units; the warehouse picks when they are released to stock.' : 'The warehouse picks the serials against the release note and dispatches.'}</p> : null}
            {['RELEASED', 'DISPATCHED'].includes(st) ? <p className="text-xs text-[var(--ejo-text-muted)]">With the warehouse and the driver. Billing issues the tax invoice after delivery.</p> : null}
            {st === 'CLOSED' ? <p className="text-xs text-[var(--ejo-text-muted)]">This order is closed.</p> : null}
            {rights.quote && RETURNABLE_ORDER_STATUSES.includes(st) ? (
              <RevealPanel label="Request a return" icon="refund">
                <form action={requestSalesReturnFormAction} className="space-y-2"><FormPendingOverlay /><input type="hidden" name="salesOrderId" value={o.id} />
                  {o.units.length ? <div><label htmlFor="ret-unit" className={LABEL}>Serial (optional)</label><select id="ret-unit" name="finishedUnitId" className={INPUT} defaultValue=""><option value="">Not a specific serial</option>{o.units.map((u: (typeof o.units)[number]) => <option key={u.id} value={u.id}>{u.serialNumber} — {u.product.name}</option>)}</select></div> : null}
                  <textarea name="reason" required rows={3} className={INPUT} placeholder="Dead on arrival, wrong item, damaged in transit…" />
                  <SubmitButton label="Request return" pendingLabel="Requesting…" className={BTN_LINE} />
                </form>
              </RevealPanel>
            ) : null}
            {rights.approve && CANCELLABLE_ORDER_STATUSES.includes(st) ? (
              <details className="pt-2 text-xs"><summary className="cursor-pointer text-[var(--ejo-text-muted)]">Cancel this order</summary>
                <form action={cancelSalesOrderFormAction} className="mt-2 space-y-2"><FormPendingOverlay /><input type="hidden" name="salesOrderId" value={o.id} /><input name="reason" required className={INPUT} placeholder="Why?" /><SubmitButton label="Cancel order" pendingLabel="Cancelling…" className={BTN_LINE} /></form>
              </details>
            ) : null}
          </div>
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 text-sm">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Customer</h2>
            <p className="mt-1 text-[var(--ejo-text)]">{o.customer.fullName}</p>
            <p className="text-xs text-[var(--ejo-text-muted)]">{[o.customer.email, o.customer.phone].filter(Boolean).join(' · ')}</p>
            {o.deliveryAddress || o.customer.address ? <p className="text-xs text-[var(--ejo-text-muted)]">Deliver to: {o.deliveryAddress ?? o.customer.address}</p> : null}
            {o.customer.dealerAccount ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]"><LoadingLink href={`/sales/dealers/${o.customer.dealerAccount.id}`} className="text-[var(--ejo-primary)] hover:underline">Dealer account</LoadingLink> · credit {naira(Number(o.customer.dealerAccount.creditLimit))} / {o.customer.dealerAccount.creditDays} days{o.customer.dealerAccount.onHold ? ' · on hold' : ''}{o.credit ? ` · ${naira(o.credit.remaining)} left` : ''}</p> : null}
            {o.notes ? <p className="mt-2 whitespace-pre-line text-xs text-[var(--ejo-text-muted)]">{o.notes}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
