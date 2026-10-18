import { guardAnyPage } from '@/lib/authz/server';
import { listDealerAccounts, getDealerRights, searchCustomersToOnboard } from '@/lib/actions/dealers';
import { onboardDealerFormAction } from '@/lib/actions/dealers-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { SearchableSelect } from '@/components/SearchableSelect';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { RevealPanel } from '@/components/ui/RevealPanel';
import { PageHeader, StatusChip, ResponsiveTable, EmptyState } from '@/components/ui';
import { naira, CHANNEL_LABEL, TIER_LABEL } from '@/lib/sales-core';
import { INPUT, LABEL, BTN } from '@/components/sales/ui';

/** Dealer and distributor accounts: tier, territory, credit and hold; onboard a customer as a dealer. */
export default async function DealersPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string }> }) {
  await guardAnyPage(['sales.view'], '/sales');
  const { q, error } = await searchParams;
  const [dealers, rights] = await Promise.all([listDealerAccounts({ q }), getDealerRights()]);
  return (
    <div className="p-8">
      <PageHeader icon="handshake" back={{ href: '/sales', label: 'Back to Sales' }} title="Dealers" description="Customers who buy to resell: dealers (tier 1–3), wholesalers and distributors such as TD Africa. The tier sets the price list they get; Finance sets credit limits and can hold an account." />
      {error ? <div className="max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <form className="mb-4 flex gap-2" action="/sales/dealers">
            <LiveSearchInput type="search" name="q" defaultValue={q ?? ''} placeholder="Search dealers by name, email, phone or territory…" className={`${INPUT} max-w-md`} />
            <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
          </form>
          {dealers.length === 0 ? <EmptyState icon="handshake" title="No dealers yet">{rights.manage ? 'Onboard a customer as a dealer from the panel.' : 'The Sales Manager onboards dealers.'}</EmptyState> : (
            <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-3 py-2">Dealer</th><th className="px-3 py-2">Channel · tier</th><th className="px-3 py-2">Territory</th><th className="px-3 py-2 text-right">Credit limit</th><th className="px-3 py-2">Broadcast</th><th className="px-3 py-2">Status</th></tr></thead>
                <tbody>
                  {dealers.map((d: (typeof dealers)[number]) => (
                    <tr key={d.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                      <td className="px-3 py-2"><LoadingLink href={`/sales/dealers/${d.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{d.customer.fullName}</LoadingLink><div className="text-xs text-[var(--ejo-text-muted)]">{[d.customer.email, d.customer.phone].filter(Boolean).join(' · ')}</div></td>
                      <td data-label="Channel" className="px-3 py-2 text-xs text-[var(--ejo-text)]">{CHANNEL_LABEL[d.channel] ?? d.channel}{d.tier ? ` · ${TIER_LABEL[d.tier]}` : ''}</td>
                      <td data-label="Territory" className="px-3 py-2 text-xs text-[var(--ejo-text)]">{d.territory ?? '—'}</td>
                      <td data-label="Credit limit" className="px-3 py-2 text-right text-[var(--ejo-text)]">{naira(Number(d.creditLimit))}{d.creditDays ? <div className="text-xs text-[var(--ejo-text-muted)]">{d.creditDays} days</div> : null}</td>
                      <td data-label="Broadcast" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{d.receivesPriceBroadcast ? 'Daily prices' : 'Off'}</td>
                      <td data-label="Status" className="px-3 py-2">{d.onHold ? <StatusChip status="ON_HOLD" label="On hold" /> : <StatusChip status="ACTIVE" label="Active" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
        </div>
        {rights.manage ? (
          <RevealPanel label="Onboard a dealer" icon="user-plus" open={Boolean(error)}>
            <form action={onboardDealerFormAction} className="space-y-3">
              <FormPendingOverlay />
              <div><label htmlFor="dealer-customer" className={LABEL}>Customer</label><SearchableSelect id="dealer-customer" name="customerId" required placeholder="Search customers…" search={searchCustomersToOnboard} /><p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Register the business under Customers first if it is not there yet.</p></div>
              <div><label htmlFor="dealer-channel" className={LABEL}>Channel</label><select id="dealer-channel" name="channel" required className={INPUT} defaultValue="DEALER">{Object.entries(CHANNEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div><label htmlFor="dealer-tier" className={LABEL}>Tier (dealers)</label><select id="dealer-tier" name="tier" className={INPUT} defaultValue="TIER_2">{Object.entries(TIER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div><label htmlFor="dealer-territory" className={LABEL}>Territory</label><input id="dealer-territory" name="territory" className={INPUT} placeholder="Computer Village, Ikeja" /></div>
              <label className="flex items-center gap-2 text-sm text-[var(--ejo-text)]"><input type="checkbox" name="receivesPriceBroadcast" defaultChecked /> Send the daily dealer price broadcast</label>
              <SubmitButton label="Onboard dealer" pendingLabel="Saving…" className={BTN} />
            </form>
          </RevealPanel>
        ) : null}
      </div>
    </div>
  );
}
