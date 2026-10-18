import { guardAnyPage, allows } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getDealerAccount, getDealerAuditTrail, getDealerRights } from '@/lib/actions/dealers';
import { updateDealerAccountFormAction, setDealerCreditFormAction, holdDealerFormAction, releaseDealerHoldFormAction } from '@/lib/actions/dealers-form-handlers';
import { humanizeAction } from '@/lib/humanize-action';
import { LoadingLink } from '@/components/LoadingLink';
import { AuditTrail } from '@/components/AuditTrail';
import { CustomerLink } from '@/components/CustomerLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { RevealPanel } from '@/components/ui/RevealPanel';
import { BackLink, PageTitle, StatusChip, SectionCard, StatTile, ResponsiveTable, EmptyState } from '@/components/ui';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';
import { naira, CHANNEL_LABEL, TIER_LABEL, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_TERMS_LABEL, type OrderStatus, type PaymentTerms } from '@/lib/sales-core';
import { INPUT, LABEL, BTN, BTN_LINE } from '@/components/sales/ui';

const BANNER: Record<string, string> = { onboarded: 'Dealer onboarded.', updated: 'Dealer account saved.', credit_set: 'Credit terms set.', held: 'Account on hold — no credit sales until it is released.', hold_released: 'Hold released.' };
const ACTION_LABEL: Record<string, string> = { 'dealer_account.onboarded': 'Onboarded as a dealer', 'dealer_account.updated': 'Account edited', 'dealer_account.credit_set': 'Credit terms set', 'dealer_account.held': 'Put on hold', 'dealer_account.hold_released': 'Hold released' };

export default async function DealerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['sales.view'], '/sales');
  const { id } = await params;
  const { status, error } = await searchParams;
  const d = await getDealerAccount(id);
  if (!d) notFound();
  const [trail, rights, canSeeCustomers] = await Promise.all([getDealerAuditTrail(id), getDealerRights(), allows('crm.view')]);
  return (
    <div className="p-8">
      <BackLink href="/sales/dealers" label="Back to Dealers" />
      {status && BANNER[status] ? <div className="max-w-2xl"><FormFeedbackBanner kind="success" message={BANNER[status]} /></div> : null}
      {error ? <div className="max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="handshake">{d.customer.fullName}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{CHANNEL_LABEL[d.channel] ?? d.channel}{d.tier ? ` · ${TIER_LABEL[d.tier]}` : ''}{d.territory ? ` · ${d.territory}` : ''} · <CustomerLink id={d.customerId} name="customer record" canView={canSeeCustomers} /></p>
        </div>
        {d.onHold ? <StatusChip status="ON_HOLD" label="On hold" className="px-3 py-1 text-sm" /> : <StatusChip status="ACTIVE" label="Active" className="px-3 py-1 text-sm" />}
      </div>
      {d.onHold ? <div className="mb-6 max-w-3xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-warning)]/40 bg-[var(--ejo-warning)]/5 p-4 text-sm text-[var(--ejo-text)]"><span className="font-medium">On hold:</span> {d.holdReason ?? 'no reason given'} — orders go on prepaid terms until Finance releases the hold.</div> : null}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon="receipt" label="Ordered" value={naira(d.statement.ordered)} hint="All orders except cancelled" />
        <StatTile icon="money" label="Paid" value={naira(d.statement.paid)} hint="Confirmed by Finance" tone="success" />
        <StatTile icon="clock" label="Outstanding on credit" value={naira(d.statement.outstanding)} tone={d.statement.outstanding ? 'warning' : 'neutral'} />
        <StatTile icon="percent" label="Credit remaining" value={naira(d.statement.creditRemaining)} hint={`Limit ${naira(Number(d.creditLimit))} · ${d.creditDays} days`} tone="info" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <SectionCard icon="receipt" title="Statement — orders" flush>
            {d.orders.length === 0 ? <EmptyState compact icon="receipt" title="No orders yet" /> : (
              <ResponsiveTable>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-4 py-2">Order</th><th className="px-4 py-2">Terms</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Paid</th><th className="px-4 py-2">Status</th></tr></thead>
                  <tbody>
                    {d.orders.map((o: (typeof d.orders)[number]) => (
                      <tr key={o.id} className="border-b border-[var(--ejo-border)] last:border-0">
                        <td className="px-4 py-2"><LoadingLink href={`/sales/orders/${o.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{o.number}</LoadingLink><div className="text-xs text-[var(--ejo-text-muted)]">{formatDateOnly(o.createdAt)}</div></td>
                        <td data-label="Terms" className="px-4 py-2 text-xs">{PAYMENT_TERMS_LABEL[o.paymentTerms as PaymentTerms]}</td>
                        <td data-label="Total" className="px-4 py-2 text-right">{naira(Number(o.total))}</td>
                        <td data-label="Paid" className="px-4 py-2 text-right">{naira(Number(o.amountPaid))}</td>
                        <td data-label="Status" className="px-4 py-2"><StatusChip status={o.status} label={ORDER_STATUS_LABEL[o.status as OrderStatus]} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            )}
          </SectionCard>
          <SectionCard icon="money" title="Statement — confirmed payments" flush>
            {d.payments.length === 0 ? <EmptyState compact icon="money" title="No confirmed payments yet" /> : (
              <ul className="divide-y divide-[var(--ejo-border)] text-sm">
                {d.payments.map((p: (typeof d.payments)[number]) => <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2"><span><span className="font-medium text-[var(--ejo-text)]">{naira(Number(p.amount))}</span> — {PAYMENT_METHOD_LABEL[p.method] ?? p.method}<span className="block text-xs text-[var(--ejo-text-muted)]"><LoadingLink href={`/sales/orders/${p.salesOrder.id}`} className="hover:underline">{p.salesOrder.number}</LoadingLink>{p.reference ? ` · ${p.reference}` : ''}</span></span><span className="text-xs text-[var(--ejo-text-muted)]">{formatDateOnly(p.paidAt)}</span></li>)}
              </ul>
            )}
          </SectionCard>
          <SectionCard icon="history" title="Audit trail">
            <AuditTrail entries={trail.map((e: (typeof trail)[number]) => { const meta = (e.metadata ?? {}) as Record<string, unknown>; const parts = [typeof meta.reason === 'string' ? `Reason: ${meta.reason}` : null, typeof meta.channel === 'string' ? `${meta.channel}${typeof meta.tier === 'string' ? ` ${meta.tier}` : ''}`.toLowerCase() : null].filter(Boolean); return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: parts.join(' · ') || null, dateLabel: formatDateTime(e.createdAt) }; })} />
          </SectionCard>
        </div>
        <div className="space-y-4">
          <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 text-sm">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Account</h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <dt className="text-[var(--ejo-text-muted)]">Contact</dt><dd className="text-[var(--ejo-text)]">{[d.customer.email, d.customer.phone].filter(Boolean).join(' · ') || '—'}</dd>
              <dt className="text-[var(--ejo-text-muted)]">Price broadcast</dt><dd className="text-[var(--ejo-text)]">{d.receivesPriceBroadcast ? 'Daily' : 'Off'}</dd>
              <dt className="text-[var(--ejo-text-muted)]">Onboarded</dt><dd className="text-[var(--ejo-text)]">{d.approvedByName ?? '—'}{d.approvedAt ? ` · ${formatDateOnly(d.approvedAt)}` : ''}</dd>
            </dl>
          </div>
          {rights.manage ? (
            <RevealPanel label="Edit channel, tier and territory" icon="settings">
              <form action={updateDealerAccountFormAction} className="space-y-3"><FormPendingOverlay /><input type="hidden" name="dealerAccountId" value={d.id} />
                <div><label htmlFor="channel" className={LABEL}>Channel</label><select id="channel" name="channel" className={INPUT} defaultValue={d.channel}>{Object.entries(CHANNEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div><label htmlFor="tier" className={LABEL}>Tier (dealers)</label><select id="tier" name="tier" className={INPUT} defaultValue={d.tier ?? 'TIER_2'}>{Object.entries(TIER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div><label htmlFor="territory" className={LABEL}>Territory</label><input id="territory" name="territory" className={INPUT} defaultValue={d.territory ?? ''} /></div>
                <label className="flex items-center gap-2 text-sm text-[var(--ejo-text)]"><input type="checkbox" name="receivesPriceBroadcast" defaultChecked={d.receivesPriceBroadcast} /> Send the daily dealer price broadcast</label>
                <SubmitButton label="Save" pendingLabel="Saving…" className={BTN_LINE} />
              </form>
            </RevealPanel>
          ) : null}
          {rights.credit ? (
            <>
              <RevealPanel label="Set credit limit and days" icon="money">
                <form action={setDealerCreditFormAction} className="space-y-3"><FormPendingOverlay /><input type="hidden" name="dealerAccountId" value={d.id} />
                  <div><label htmlFor="creditLimit" className={LABEL}>Credit limit (₦)</label><input id="creditLimit" name="creditLimit" inputMode="decimal" className={INPUT} defaultValue={String(Number(d.creditLimit))} /></div>
                  <div><label htmlFor="creditDays" className={LABEL}>Credit days</label><input id="creditDays" name="creditDays" type="number" min={0} className={INPUT} defaultValue={String(d.creditDays)} /></div>
                  <SubmitButton label="Set credit terms" pendingLabel="Saving…" className={BTN} />
                </form>
              </RevealPanel>
              {d.onHold ? (
                <form action={releaseDealerHoldFormAction}><FormPendingOverlay /><input type="hidden" name="dealerAccountId" value={d.id} /><SubmitButton label="Release hold" pendingLabel="Releasing…" className={BTN} /></form>
              ) : (
                <details className="text-xs"><summary className="cursor-pointer text-[var(--ejo-text-muted)]">Put the account on hold</summary>
                  <form action={holdDealerFormAction} className="mt-2 space-y-2"><FormPendingOverlay /><input type="hidden" name="dealerAccountId" value={d.id} /><input name="reason" required className={INPUT} placeholder="Why? (overdue balance, bounced cheque…)" /><SubmitButton label="Hold account" pendingLabel="Holding…" className={BTN_LINE} /></form>
                </details>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
