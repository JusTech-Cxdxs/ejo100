import { guardAnyPage, allows } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getQuotation, getQuotationAuditTrail, getSalesRights } from '@/lib/actions/sales';
import { searchQuotationProductOptions } from '@/lib/actions/pricing';
import { requireUser } from '@/lib/actions/workshop';
import { humanizeAction } from '@/lib/humanize-action';
import {
  updateQuotationFormAction, sendQuotationFormAction, approveQuotationDiscountFormAction, rejectQuotationDiscountFormAction, acceptQuotationFormAction, declineQuotationFormAction, cancelQuotationFormAction, convertQuotationFormAction,
} from '@/lib/actions/sales-form-handlers';
import { QuotationEditor } from '@/components/sales/QuotationEditor';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { AuditTrail } from '@/components/AuditTrail';
import { CustomerLink } from '@/components/CustomerLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';
import { BackLink, PageTitle, StatusChip, SectionCard, ResponsiveTable } from '@/components/ui';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';
import { naira, canApproveDiscount, discountLevelLabel, QUOTATION_STATUS_LABEL, CHANNEL_LABEL, TIER_LABEL, OFFICER_DISCOUNT_LIMIT_PERCENT, type QuotationStatus } from '@/lib/sales-core';
import { INPUT, LABEL, BTN, BTN_LINE } from '@/components/sales/ui';

const BANNER: Record<string, string> = {
  created: 'Draft quotation saved. Check the lines, then send it to the customer.',
  saved: 'Draft saved.',
  sent: 'Marked as sent to the customer.',
  discount_approval_requested: 'The discount is beyond the officer\'s limit — sent for approval. The approvers have been notified.',
  discount_approved: 'Discount approved — the quotation is marked as sent.',
  discount_rejected: 'Sent back to draft — the person who prepared it has been notified.',
  accepted: 'Accepted by the customer. Convert it to a sales order when ready.',
  declined: 'Recorded as declined.',
  cancelled: 'Quotation cancelled.',
};
const ACTION_LABEL: Record<string, string> = {
  'quotation.created': 'Quotation prepared',
  'quotation.updated': 'Lines edited',
  'quotation.sent': 'Sent to the customer',
  'quotation.discount_approval_requested': 'Sent for discount approval',
  'quotation.discount_approved': 'Discount approved',
  'quotation.discount_rejected': 'Discount sent back',
  'quotation.accepted': 'Accepted by the customer',
  'quotation.declined': 'Declined by the customer',
  'quotation.expired': 'Expired',
  'quotation.converted': 'Converted to a sales order',
  'quotation.cancelled': 'Cancelled',
};

export default async function QuotationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string; edit?: string }> }) {
  await guardAnyPage(['sales.view'], '/sales');
  const { id } = await params;
  const { status, error, edit } = await searchParams;
  const q = await getQuotation(id);
  if (!q) notFound();
  const [trail, rights, viewer, canSeeCustomers] = await Promise.all([getQuotationAuditTrail(id), getSalesRights(q.branchId), requireUser(), allows('crm.view')]);
  const own = q.preparedById === viewer.id;
  const editing = edit === '1' && q.status === 'DRAFT' && rights.quote;
  const mayApprove = q.status === 'PENDING_DISCOUNT_APPROVAL' && !own && canApproveDiscount(q.approval.level, { approve: rights.approve, approveLarge: rights.approveLarge });
  const steps: { label: string; done: boolean; who?: string | null; at?: Date | null }[] = [
    { label: 'Draft', done: true, who: q.preparedBy.fullName, at: q.createdAt },
    ...(q.approval.needsApproval || q.discountApproverId ? [{ label: 'Discount approved', done: Boolean(q.discountApprovedAt), who: q.approverName, at: q.discountApprovedAt }] : []),
    { label: 'Sent', done: Boolean(q.sentAt), at: q.sentAt },
    { label: 'Accepted', done: ['ACCEPTED', 'CONVERTED'].includes(q.status) },
    { label: 'Sales order', done: Boolean(q.salesOrder), who: q.salesOrder?.number },
  ];
  const tier = q.customer.dealerAccount?.channel === 'DEALER' ? q.customer.dealerAccount.tier : null;
  const validUntil = q.validUntil ? new Date(q.validUntil).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) : '';

  return (
    <div className="p-8">
      <BackLink href="/sales/quotations" label="Back to Quotations" />
      {status && BANNER[status] ? <div className="max-w-2xl"><FormFeedbackBanner kind="success" message={BANNER[status]} /></div> : null}
      {error ? <div className="max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="file">{q.number}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">
            <CustomerLink id={q.customerId} name={q.customer.fullName} canView={canSeeCustomers} /> · {CHANNEL_LABEL[q.channel] ?? q.channel}{tier ? ` (${TIER_LABEL[tier]})` : ''}
            {q.priceList ? <> · priced from <LoadingLink href={`/sales/price-lists/${q.priceList.id}`} className="text-[var(--ejo-primary)] hover:underline">{q.priceList.name}</LoadingLink></> : ' · no active price list for this channel'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={q.status} label={QUOTATION_STATUS_LABEL[q.status as QuotationStatus]} className="px-3 py-1 text-sm" />
          <PrintMenu orgHref={`/print/quotation/${q.id}`} clientHref={`/print/quotation/${q.id}?variant=client`} clientLabel="Customer Copy" />
        </div>
      </div>

      {q.status === 'DRAFT' && q.discountRejectedReason ? <div className="mb-6 max-w-3xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-4 text-sm text-[var(--ejo-text)]"><span className="font-medium">Sent back:</span> {q.discountRejectedReason}</div> : null}
      {q.status === 'SENT' && q.expired ? <div className="mb-6 max-w-3xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-error)]/40 bg-[var(--ejo-error)]/5 p-4 text-sm text-[var(--ejo-text)]">This quotation passed its valid-until date ({formatDateOnly(q.validUntil as Date)}). Prepare a new one if the customer still wants the goods.</div> : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {steps.map((s, i) => (
          <div key={s.label} className={`rounded-[var(--ejo-radius-md)] border px-3 py-2 text-xs ${s.done ? 'border-[var(--ejo-success)]/40 bg-[var(--ejo-success)]/5' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)]'}`}>
            <p className="font-medium text-[var(--ejo-text)]">{s.done ? '✓' : `${i + 1}.`} {s.label}</p>
            {s.done && s.who ? <p className="text-[var(--ejo-text-muted)]">{s.who}</p> : null}
            {s.done && s.at ? <p className="text-[var(--ejo-text-muted)]">{formatDateOnly(s.at)}</p> : null}
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {editing ? (
            <form action={updateQuotationFormAction} className="space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-primary)]/40 bg-[var(--ejo-surface)] p-6">
              <FormPendingOverlay />
              <input type="hidden" name="quotationId" value={q.id} />
              <QuotationEditor customerId={q.customerId} customerLabel={q.customer.fullName} searchProducts={searchQuotationProductOptions}
                initialLines={q.lines.map((l: (typeof q.lines)[number]) => ({ key: l.id, product: `${l.productId}|${l.configurationId ?? ''}|${Number(l.unitPrice)}`, label: l.description, unitPrice: String(Number(l.unitPrice)), quantity: String(l.quantity), discountPercent: String(Number(l.discountPercent)), notes: l.notes ?? '' }))} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label htmlFor="validUntil" className={LABEL}>Valid until</label><input id="validUntil" name="validUntil" type="date" defaultValue={validUntil} className={INPUT} /></div>
                <div className="sm:col-span-2"><div className="flex items-center justify-between"><label htmlFor="quotation-notes" className={LABEL}>Notes for the customer</label><RefineTextButton targetId="quotation-notes" /></div><textarea id="quotation-notes" name="notes" rows={3} className={INPUT} defaultValue={q.notes ?? ''} /></div>
              </div>
              <div className="flex gap-2">
                <SubmitButton label="Save draft" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90" />
                <LoadingLink href={`/sales/quotations/${q.id}`} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">Cancel</LoadingLink>
              </div>
            </form>
          ) : (
            <SectionCard icon="list" title="Lines" description={`${q.lines.length} ${q.lines.length === 1 ? 'line' : 'lines'} · VAT ${Number(q.taxRatePercent)}%`} flush>
              <ResponsiveTable>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-4 py-2">Product</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Unit price</th><th className="px-4 py-2 text-right">Discount</th><th className="px-4 py-2 text-right">Line total</th></tr></thead>
                  <tbody>
                    {q.lines.map((l: (typeof q.lines)[number]) => (
                      <tr key={l.id} className="border-b border-[var(--ejo-border)] last:border-0">
                        <td data-label="Product" className="px-4 py-2 text-[var(--ejo-text)]">{l.description}<div className="text-xs text-[var(--ejo-text-muted)]">{l.product.sku}{l.configuration ? `-${l.configuration.code}` : ''} · {l.product.source === 'ASSEMBLED' ? 'assembled on the line' : l.product.source === 'KIT' ? 'kit' : 'from stock'}{l.notes ? ` · ${l.notes}` : ''}</div></td>
                        <td data-label="Qty" className="px-4 py-2 text-right">{l.quantity}</td>
                        <td data-label="Unit price" className="px-4 py-2 text-right">{naira(Number(l.unitPrice))}</td>
                        <td data-label="Discount" className={`px-4 py-2 text-right ${Number(l.discountPercent) > OFFICER_DISCOUNT_LIMIT_PERCENT ? 'font-medium text-[var(--ejo-warning)]' : ''}`}>{Number(l.discountPercent)}%</td>
                        <td data-label="Line total" className="px-4 py-2 text-right font-medium">{naira(Number(l.lineTotal))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="text-sm">
                    <tr><td colSpan={4} className="px-4 py-1 text-right text-[var(--ejo-text-muted)]">Goods</td><td className="px-4 py-1 text-right">{naira(Number(q.subtotal))}</td></tr>
                    <tr><td colSpan={4} className="px-4 py-1 text-right text-[var(--ejo-text-muted)]">Discounts ({q.approval.overallPercent}%)</td><td className="px-4 py-1 text-right">- {naira(Number(q.discountTotal))}</td></tr>
                    <tr><td colSpan={4} className="px-4 py-1 text-right text-[var(--ejo-text-muted)]">VAT {Number(q.taxRatePercent)}%</td><td className="px-4 py-1 text-right">{naira(Number(q.taxTotal))}</td></tr>
                    <tr className="border-t border-[var(--ejo-border)] font-semibold"><td colSpan={4} className="px-4 py-2 text-right">Total</td><td className="px-4 py-2 text-right">{naira(Number(q.total))}</td></tr>
                  </tfoot>
                </table>
              </ResponsiveTable>
              <div className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-3">
                <div><p className="text-xs text-[var(--ejo-text-muted)]">Valid until</p><p className="text-[var(--ejo-text)]">{q.validUntil ? formatDateOnly(q.validUntil) : '—'}</p></div>
                <div><p className="text-xs text-[var(--ejo-text-muted)]">Prepared by</p><p className="text-[var(--ejo-text)]">{q.preparedBy.fullName} · {q.branch.name}</p></div>
                <div><p className="text-xs text-[var(--ejo-text-muted)]">Discount approval</p><p className="text-[var(--ejo-text)]">{q.approval.needsApproval ? `${discountLevelLabel(q.approval.level)}${q.approverName ? ` — ${q.approverName}` : ''}` : 'Not needed'}</p></div>
                {q.notes ? <div className="sm:col-span-3"><p className="text-xs text-[var(--ejo-text-muted)]">Notes</p><p className="whitespace-pre-line text-[var(--ejo-text)]">{q.notes}</p></div> : null}
              </div>
            </SectionCard>
          )}

          <SectionCard icon="history" title="Audit trail">
            <AuditTrail entries={trail.map((e: (typeof trail)[number]) => {
              const meta = (e.metadata ?? {}) as Record<string, unknown>;
              const parts = [typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : null, typeof meta.level === 'string' ? `Needs: ${discountLevelLabel(meta.level as never)}` : null, typeof meta.salesOrder === 'string' ? `Order ${meta.salesOrder}` : null, typeof meta.total === 'number' ? naira(meta.total) : null].filter(Boolean);
              return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: parts.join(' · ') || null, dateLabel: formatDateTime(e.createdAt) };
            })} />
          </SectionCard>
        </div>

        <div className="space-y-4">
          <div className="space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Next step</h2>
            {q.status === 'DRAFT' && rights.quote ? (
              <>
                {!editing ? <LoadingLink href={`/sales/quotations/${q.id}?edit=1`} className={`block text-center ${BTN_LINE}`}>Edit lines</LoadingLink> : null}
                <form action={sendQuotationFormAction}><FormPendingOverlay /><input type="hidden" name="quotationId" value={q.id} /><SubmitButton label={q.approval.needsApproval ? `Send for ${discountLevelLabel(q.approval.level)} approval` : 'Send to customer'} pendingLabel="Sending…" className={BTN} /></form>
                <p className="text-xs text-[var(--ejo-text-muted)]">{q.approval.needsApproval ? `A line carries ${q.approval.maxLinePercent}% (${q.approval.overallPercent}% overall) — beyond the officer's ${OFFICER_DISCOUNT_LIMIT_PERCENT}%.` : 'Marks the quotation as sent; print or email the customer copy.'}</p>
              </>
            ) : null}
            {q.status === 'PENDING_DISCOUNT_APPROVAL' && !mayApprove ? <p className="text-xs text-[var(--ejo-text-muted)]">Waiting on the {discountLevelLabel(q.approval.level)}.{own ? ' You prepared this quotation, so someone else approves its discount.' : ''}</p> : null}
            {mayApprove ? (
              <>
                <form action={approveQuotationDiscountFormAction}><FormPendingOverlay /><input type="hidden" name="quotationId" value={q.id} /><SubmitButton label="Approve discount" pendingLabel="Approving…" className={BTN} /></form>
                <form action={rejectQuotationDiscountFormAction} className="space-y-2"><FormPendingOverlay /><input type="hidden" name="quotationId" value={q.id} /><input name="reason" required className={INPUT} placeholder="What should change?" /><SubmitButton label="Send back" pendingLabel="Sending…" className={BTN_LINE} /></form>
              </>
            ) : null}
            {q.status === 'SENT' && rights.quote ? (
              <>
                <form action={acceptQuotationFormAction}><FormPendingOverlay /><input type="hidden" name="quotationId" value={q.id} /><SubmitButton label="Accept" pendingLabel="Recording…" className={BTN} /></form>
                <form action={declineQuotationFormAction} className="space-y-2"><FormPendingOverlay /><input type="hidden" name="quotationId" value={q.id} /><input name="reason" className={INPUT} placeholder="Why the customer declined (optional)" /><SubmitButton label="Declined by the customer" pendingLabel="Recording…" className={BTN_LINE} /></form>
              </>
            ) : null}
            {q.status === 'ACCEPTED' && rights.quote ? (
              <form action={convertQuotationFormAction}><FormPendingOverlay /><input type="hidden" name="quotationId" value={q.id} /><SubmitButton label="Convert to sales order" pendingLabel="Converting…" className={BTN} /><p className="mt-2 text-xs text-[var(--ejo-text-muted)]">{q.customer.dealerAccount && Number(q.customer.dealerAccount.creditLimit) > 0 && !q.customer.dealerAccount.onHold ? 'The dealer has credit: the order goes on credit terms (Finance approves if it exceeds what is left).' : 'Prepaid: Billing issues a pro-forma invoice and Finance confirms the payment before release.'}</p></form>
            ) : null}
            {q.status === 'CONVERTED' && q.salesOrder ? <LoadingLink href={`/sales/orders/${q.salesOrder.id}`} className={`block text-center ${BTN}`}>Open sales order {q.salesOrder.number}</LoadingLink> : null}
            {['DECLINED', 'EXPIRED', 'CANCELLED'].includes(q.status) ? <p className="text-xs text-[var(--ejo-text-muted)]">This quotation is closed.</p> : null}
            {['DRAFT', 'PENDING_DISCOUNT_APPROVAL', 'SENT', 'ACCEPTED'].includes(q.status) && rights.quote ? (
              <details className="pt-2 text-xs"><summary className="cursor-pointer text-[var(--ejo-text-muted)]">Cancel this quotation</summary>
                <form action={cancelQuotationFormAction} className="mt-2 space-y-2"><FormPendingOverlay /><input type="hidden" name="quotationId" value={q.id} /><input name="reason" required className={INPUT} placeholder="Why?" /><SubmitButton label="Cancel quotation" pendingLabel="Cancelling…" className={BTN_LINE} /></form>
              </details>
            ) : null}
          </div>
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 text-sm">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Customer</h2>
            <p className="mt-1 text-[var(--ejo-text)]">{q.customer.fullName}</p>
            <p className="text-xs text-[var(--ejo-text-muted)]">{[q.customer.email, q.customer.phone].filter(Boolean).join(' · ')}</p>
            {q.customer.address ? <p className="text-xs text-[var(--ejo-text-muted)]">{q.customer.address}</p> : null}
            {q.customer.dealerAccount ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]"><LoadingLink href={`/sales/dealers/${q.customer.dealerAccount.id}`} className="text-[var(--ejo-primary)] hover:underline">Dealer account</LoadingLink> · credit {naira(Number(q.customer.dealerAccount.creditLimit))}{q.customer.dealerAccount.onHold ? ' · on hold' : ''}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
