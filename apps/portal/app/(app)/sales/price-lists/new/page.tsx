import { guardAnyPage, allows } from '@/lib/authz/server';
import { createPriceListFormAction } from '@/lib/actions/pricing-form-handlers';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { PageHeader } from '@/components/ui';
import { CHANNEL_LABEL, TIER_LABEL } from '@/lib/sales-core';
import { INPUT, LABEL, BTN } from '@/components/sales/ui';

/** A new DRAFT price list: name, channel (tier for dealers), effective date. Prices are added on its page. */
export default async function NewPriceListPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await guardAnyPage(['sales.view'], '/sales');
  const { error } = await searchParams;
  const canManage = await allows('sales.pricing.manage');
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  return (
    <div className="p-8">
      <PageHeader icon="tag" back={{ href: '/sales/price-lists', label: 'Back to Price lists' }} title="New price list" description="Create the list as a draft, add the prices, then activate it. Activation retires the previous active list of the same channel and tier." />
      {error ? <div className="max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {!canManage ? <p className="text-sm text-[var(--ejo-text-muted)]">Only the Commercial Director (pricing) creates price lists.</p> : (
        <form action={createPriceListFormAction} className="max-w-xl space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <FormPendingOverlay />
          <div><label htmlFor="name" className={LABEL}>Name</label><input id="name" name="name" required className={INPUT} placeholder="Dealer Tier 1 — October 2026" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="channel" className={LABEL}>Channel</label><select id="channel" name="channel" required className={INPUT} defaultValue="DEALER">{Object.entries(CHANNEL_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label htmlFor="tier" className={LABEL}>Tier (dealer lists only)</label><select id="tier" name="tier" className={INPUT} defaultValue="TIER_1">{Object.entries(TIER_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label htmlFor="effectiveFrom" className={LABEL}>Effective from</label><input id="effectiveFrom" name="effectiveFrom" type="date" required className={INPUT} defaultValue={today} /></div>
            <div><label htmlFor="currency" className={LABEL}>Currency</label><input id="currency" name="currency" className={INPUT} defaultValue="NGN" maxLength={3} /></div>
          </div>
          <SubmitButton label="Create price list" pendingLabel="Creating…" className={BTN} />
        </form>
      )}
    </div>
  );
}
