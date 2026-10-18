import { guardAnyPage, allows } from '@/lib/authz/server';
import { listPriceLists } from '@/lib/actions/pricing';
import { LoadingLink } from '@/components/LoadingLink';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { PageHeader, HeaderAction, StatusChip, ResponsiveTable, EmptyState } from '@/components/ui';
import { formatDateOnly } from '@/lib/utils/format-date';
import { CHANNEL_LABEL, TIER_LABEL } from '@/lib/sales-core';
import { PRICE_LIST_STATUS_LABEL } from '@/lib/pricing-core';
import { CHIP } from '@/components/sales/ui';

/** Price lists per channel and dealer tier; the active one prices every new quotation for that channel. */
export default async function PriceListsPage({ searchParams }: { searchParams: Promise<{ channel?: string; error?: string }> }) {
  await guardAnyPage(['sales.view'], '/sales');
  const { channel, error } = await searchParams;
  const [lists, canManage] = await Promise.all([listPriceLists({ channel }), allows('sales.pricing.manage')]);
  const filter = channel && CHANNEL_LABEL[channel] ? channel : null;
  return (
    <div className="p-8">
      <PageHeader icon="tag" back={{ href: '/sales', label: 'Back to Sales' }} title="Price lists" description="One active list per channel (and per dealer tier). Activating a new list retires the previous one; the dealer lists go out to dealers every working morning as the price broadcast." actions={canManage ? <HeaderAction href="/sales/price-lists/new">New price list</HeaderAction> : null} />
      {error ? <div className="max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        <LoadingLink href="/sales/price-lists" className={CHIP(!filter)}>All</LoadingLink>
        {Object.entries(CHANNEL_LABEL).map(([v, l]) => <LoadingLink key={v} href={`/sales/price-lists?channel=${v}`} className={CHIP(filter === v)}>{l}</LoadingLink>)}
      </div>
      {lists.length === 0 ? <EmptyState icon="tag" title="No price lists yet">{canManage ? 'Create one with "New price list", add prices, then activate it.' : 'The Commercial Director sets up price lists.'}</EmptyState> : (
        <ResponsiveTable className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-3 py-2">Price list</th><th className="px-3 py-2">Channel · tier</th><th className="px-3 py-2">Effective</th><th className="px-3 py-2 text-right">Prices</th><th className="px-3 py-2 text-right">Broadcasts</th><th className="px-3 py-2">Status</th></tr></thead>
            <tbody>
              {lists.map((l: (typeof lists)[number]) => (
                <tr key={l.id} className="border-b border-[var(--ejo-border)] align-top last:border-0">
                  <td className="px-3 py-2"><LoadingLink href={`/sales/price-lists/${l.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{l.name}</LoadingLink><div className="text-xs text-[var(--ejo-text-muted)]">{l.number} · {l.createdBy.fullName}</div></td>
                  <td data-label="Channel" className="px-3 py-2 text-xs text-[var(--ejo-text)]">{CHANNEL_LABEL[l.channel] ?? l.channel}{l.tier ? ` · ${TIER_LABEL[l.tier]}` : ''}</td>
                  <td data-label="Effective" className="px-3 py-2 text-xs text-[var(--ejo-text-muted)]">{formatDateOnly(l.effectiveFrom)}{l.effectiveTo ? ` – ${formatDateOnly(l.effectiveTo)}` : ''}</td>
                  <td data-label="Prices" className="px-3 py-2 text-right">{l._count.items}</td>
                  <td data-label="Broadcasts" className="px-3 py-2 text-right">{l._count.broadcasts}</td>
                  <td data-label="Status" className="px-3 py-2"><StatusChip status={l.status} label={PRICE_LIST_STATUS_LABEL[l.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
