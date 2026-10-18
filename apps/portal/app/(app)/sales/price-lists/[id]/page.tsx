import { guardAnyPage, allows } from '@/lib/authz/server';
import { notFound } from 'next/navigation';
import { getPriceList, searchCatalogueProductOptions, listCatalogueProductOptions, broadcastSentToday } from '@/lib/actions/pricing';
import { setPriceListItemFormAction, removePriceListItemFormAction, activatePriceListFormAction, retirePriceListFormAction, publishPriceBroadcastFormAction } from '@/lib/actions/pricing-form-handlers';
import { SearchableSelect } from '@/components/SearchableSelect';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { RevealPanel } from '@/components/ui/RevealPanel';
import { BackLink, PageTitle, StatusChip, SectionCard, ResponsiveTable, EmptyState } from '@/components/ui';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';
import { naira, CHANNEL_LABEL, TIER_LABEL } from '@/lib/sales-core';
import { PRICE_LIST_STATUS_LABEL, type PriceChange } from '@/lib/pricing-core';
import { INPUT, LABEL, BTN, BTN_LINE, BTN_SMALL } from '@/components/sales/ui';

const BANNER: Record<string, string> = {
  created: 'Price list created as a draft. Add the prices, then activate it.',
  item_saved: 'Price saved.',
  item_removed: 'Line removed.',
  activated: 'Price list activated — quotations for this channel now price from it.',
  retired: 'Price list retired.',
  broadcast_published: 'Today\'s dealer prices are published. Dealers with an email address are being emailed.',
};

export default async function PriceListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardAnyPage(['sales.view'], '/sales');
  const { id } = await params;
  const { status, error } = await searchParams;
  const list = await getPriceList(id);
  if (!list) notFound();
  const [canManage, sentToday] = await Promise.all([allows('sales.pricing.manage'), broadcastSentToday(id)]);
  const editable = canManage && list.status !== 'RETIRED';
  return (
    <div className="p-8">
      <BackLink href="/sales/price-lists" label="Back to Price lists" />
      {status && BANNER[status] ? <div className="max-w-2xl"><FormFeedbackBanner kind="success" message={BANNER[status]} /></div> : null}
      {error ? <div className="max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="tag">{list.name}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{list.number} · {CHANNEL_LABEL[list.channel] ?? list.channel}{list.tier ? ` · ${TIER_LABEL[list.tier]}` : ''} · {list.currency} · effective {formatDateOnly(list.effectiveFrom)}{list.effectiveTo ? ` – ${formatDateOnly(list.effectiveTo)}` : ''} · by {list.createdBy.fullName}{list.approvedByName ? ` · activated by ${list.approvedByName}` : ''}</p>
        </div>
        <StatusChip status={list.status} label={PRICE_LIST_STATUS_LABEL[list.status]} className="px-3 py-1 text-sm" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <SectionCard icon="list" title="Prices" description={`${list.items.length} ${list.items.length === 1 ? 'line' : 'lines'} · per unit, before VAT`} flush>
            {list.items.length === 0 ? <EmptyState compact icon="tag" title="No prices yet">{editable ? 'Add a product with the panel on the right.' : null}</EmptyState> : (
              <ResponsiveTable>
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-left text-xs text-[var(--ejo-text-muted)]"><th className="px-4 py-2">Product</th><th className="px-4 py-2">Configuration</th><th className="px-4 py-2 text-right">From qty</th><th className="px-4 py-2 text-right">Unit price</th>{editable ? <th className="px-4 py-2" /> : null}</tr></thead>
                  <tbody>
                    {list.items.map((i: (typeof list.items)[number]) => (
                      <tr key={i.id} className="border-b border-[var(--ejo-border)] last:border-0">
                        <td data-label="Product" className="px-4 py-2 text-[var(--ejo-text)]">{i.product.name}<div className="text-xs text-[var(--ejo-text-muted)]">{i.product.sku}</div></td>
                        <td data-label="Configuration" className="px-4 py-2 text-xs text-[var(--ejo-text)]">{i.configuration ? `${i.configuration.name} (${i.configuration.code})` : 'Any'}</td>
                        <td data-label="From qty" className="px-4 py-2 text-right">{i.minQuantity}</td>
                        <td data-label="Unit price" className="px-4 py-2 text-right font-medium">{naira(Number(i.unitPrice))}</td>
                        {editable ? <td className="px-4 py-2 text-right"><form action={removePriceListItemFormAction}><FormPendingOverlay /><input type="hidden" name="priceListId" value={list.id} /><input type="hidden" name="itemId" value={i.id} /><SubmitButton label="Remove" pendingLabel="…" className={BTN_SMALL} /></form></td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTable>
            )}
          </SectionCard>
          <SectionCard icon="megaphone" title="Broadcast history" description="Each time these prices went out to dealers" flush>
            {list.broadcasts.length === 0 ? <EmptyState compact icon="megaphone" title="Not broadcast yet">{list.channel === 'DEALER' ? 'The dealer price broadcast goes out every working morning at 8:00, or on demand.' : 'Only dealer price lists are broadcast.'}</EmptyState> : (
              <ul className="divide-y divide-[var(--ejo-border)] text-sm">
                {list.broadcasts.map((b: (typeof list.broadcasts)[number]) => {
                  const changes = ((b.changes as { changes?: PriceChange[] } | null)?.changes ?? []).slice(0, 6);
                  return (
                    <li key={b.id} className="px-4 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-[var(--ejo-text)]">{b.number}</span><span className="text-xs text-[var(--ejo-text-muted)]">{formatDateTime(b.publishedAt)} · {b.publishedByName} · {b.recipientsCount} {b.recipientsCount === 1 ? 'dealer' : 'dealers'}{b.emailed ? ' · emailed' : ''}</span></div>
                      <p className="text-xs text-[var(--ejo-text)]">{b.summary}</p>
                      {changes.length ? <p className="text-xs text-[var(--ejo-text-muted)]">{changes.map((c) => `${c.label}: ${c.from !== null ? naira(c.from) : 'new'} → ${c.to !== null ? naira(c.to) : 'removed'}`).join(' · ')}</p> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>
        <div className="space-y-4">
          {editable ? (
            <RevealPanel label="Add or re-price a product" icon="plus" open={Boolean(error)}>
              <form action={setPriceListItemFormAction} className="space-y-3"><FormPendingOverlay /><input type="hidden" name="priceListId" value={list.id} />
                <div><label htmlFor="pl-product" className={LABEL}>Product / configuration</label><SearchableSelect id="pl-product" name="product" required placeholder="Search products…" search={searchCatalogueProductOptions} loadDefaultOptions={listCatalogueProductOptions} defaultOptionsLabel="Catalogue" /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><label htmlFor="pl-price" className={LABEL}>Unit price (₦, before VAT)</label><input id="pl-price" name="unitPrice" inputMode="decimal" required className={INPUT} /></div>
                  <div><label htmlFor="pl-min" className={LABEL}>From quantity</label><input id="pl-min" name="minQuantity" type="number" min={1} step={1} className={INPUT} defaultValue={1} /></div>
                </div>
                <SubmitButton label="Save price" pendingLabel="Saving…" className={BTN} />
              </form>
            </RevealPanel>
          ) : null}
          <div className="space-y-3 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Next step</h2>
            {canManage && list.status === 'DRAFT' ? <form action={activatePriceListFormAction}><FormPendingOverlay /><input type="hidden" name="priceListId" value={list.id} /><SubmitButton label="Activate price list" pendingLabel="Activating…" className={BTN} /><p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Retires the current active {CHANNEL_LABEL[list.channel]?.toLowerCase()}{list.tier ? ` ${TIER_LABEL[list.tier]}` : ''} list, if any.</p></form> : null}
            {canManage && list.status === 'ACTIVE' && list.channel === 'DEALER' ? <form action={publishPriceBroadcastFormAction}><FormPendingOverlay /><input type="hidden" name="priceListId" value={list.id} /><SubmitButton label="Publish today's dealer prices" pendingLabel="Publishing…" className={sentToday ? BTN_LINE : BTN} /><p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{sentToday ? 'Already published today — publishing again sends a second broadcast with the changes since.' : 'Records the broadcast with what changed and emails every dealer of this tier who takes it.'}</p></form> : null}
            {canManage && list.status !== 'RETIRED' ? <details className="pt-2 text-xs"><summary className="cursor-pointer text-[var(--ejo-text-muted)]">Retire this price list</summary><form action={retirePriceListFormAction} className="mt-2"><FormPendingOverlay /><input type="hidden" name="priceListId" value={list.id} /><SubmitButton label="Retire" pendingLabel="Retiring…" className={BTN_LINE} /></form></details> : null}
            {list.status === 'RETIRED' ? <p className="text-xs text-[var(--ejo-text-muted)]">Retired lists are kept for the record and cannot change.</p> : null}
            {!canManage ? <p className="text-xs text-[var(--ejo-text-muted)]">The Commercial Director (pricing) activates lists and publishes the dealer prices.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
