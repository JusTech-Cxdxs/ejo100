import { requireCustomer } from '@/lib/customer-portal/session';
import { loadDealerAccount } from '@/lib/customer-portal/data';
import { loadDealerPrices } from '@/lib/customer-portal/zinox-data';
import { fmtDate, fmtDateTime, naira } from '@/lib/customer-portal/format';
import { Badge, Card, EmptyState, KeyValue, Notice, PageHero, SectionTitle } from '@/components/customer/ui';

export const metadata = { title: 'Prices' };

const TIER: Record<string, string> = { TIER_1: 'Tier 1', TIER_2: 'Tier 2', TIER_3: 'Tier 3' };

/** Dealers only: the active price list for their channel and tier, and the latest daily broadcast with what changed. */
export default async function PricesPage() {
  const me = await requireCustomer();
  const dealer = await loadDealerAccount(me.id);
  if (!dealer) {
    return (
      <div className="space-y-6">
        <PageHero eyebrow="Prices" icon="chart" title="Dealer prices" />
        <EmptyState icon="lock" title="For dealers and distributors" text="Dealer price lists are published to approved dealer accounts. If you resell our products, ask your account manager about a dealer account." />
      </div>
    );
  }
  const prices = await loadDealerPrices(me.id);
  const list = prices?.list ?? null;
  const broadcast = prices?.broadcast ?? null;
  return (
    <div className="space-y-6">
      <PageHero eyebrow="Prices" icon="chart" title="Your dealer prices" subtitle={`${dealer.channel === 'DISTRIBUTOR' ? 'Distributor' : 'Dealer'}${dealer.tier ? ` · ${TIER[dealer.tier] ?? dealer.tier}` : ''}${dealer.territory ? ` · ${dealer.territory}` : ''}. Prices are published every working day at 08:00 and apply until the next broadcast.`} />
      {dealer.onHold ? <Notice tone="attention" icon="alert">Your account is on hold — orders are paused until it is released. Please contact your account manager.</Notice> : null}
      {broadcast ? (
        <Card className="p-4 sm:p-5">
          <SectionTitle icon="megaphone" title={`Latest broadcast · ${broadcast.number}`} action={<span className="text-xs text-[var(--ejo-text-muted)]">{fmtDateTime(broadcast.publishedAt)}</span>} />
          <p className="text-sm text-[var(--ejo-text)]">{broadcast.summary}</p>
          {broadcast.changes.length ? (
            <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
              {broadcast.changes.map((c, i) => (
                <li key={`${c.product}-${i}`} className="flex items-center justify-between gap-3 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[var(--ejo-text)]">{c.product}</span>
                  <span className="shrink-0 text-xs text-[var(--ejo-text-muted)]">{c.from !== null ? naira(c.from) : '—'} → <span className="font-semibold text-[var(--ejo-text)]">{c.to !== null ? naira(c.to) : '—'}</span></span>
                  {c.from !== null && c.to !== null ? <Badge tone={c.to > c.from ? 'attention' : c.to < c.from ? 'success' : 'neutral'}>{c.to > c.from ? 'up' : c.to < c.from ? 'down' : 'same'}</Badge> : null}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">No price changes in this broadcast.</p>}
        </Card>
      ) : null}
      {list ? (
        <Card className="p-4 sm:p-5">
          <SectionTitle icon="chart" title={`${list.name} · ${list.number}`} action={<span className="text-xs text-[var(--ejo-text-muted)]">Effective {fmtDate(list.effectiveFrom)} · {list.currency}</span>} />
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KeyValue label="Products priced">{list.items.length}</KeyValue>
            <KeyValue label="Credit limit">{naira(dealer.creditLimit)}</KeyValue>
            <KeyValue label="Credit days">{dealer.creditDays}</KeyValue>
            <KeyValue label="Daily broadcast">{dealer.receivesPriceBroadcast ? 'On' : 'Off'}</KeyValue>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-[var(--ejo-text-muted)]"><th className="py-1 pr-3">Product</th><th className="py-1 pr-3">SKU</th><th className="py-1 pr-3 text-right">From qty</th><th className="py-1 text-right">Unit price</th></tr></thead>
              <tbody>
                {list.items.map((i, idx) => (
                  <tr key={`${i.sku}-${i.configuration ?? ''}-${i.minQuantity}-${idx}`} className="border-t border-[var(--ejo-border)]">
                    <td className="py-1.5 pr-3 text-[var(--ejo-text)]">{i.product}{i.configuration ? <span className="text-xs text-[var(--ejo-text-muted)]"> · {i.configuration}</span> : null}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs text-[var(--ejo-text-muted)]">{i.sku}</td>
                    <td className="py-1.5 pr-3 text-right text-[var(--ejo-text-muted)]">{i.minQuantity}</td>
                    <td className="py-1.5 text-right font-semibold text-[var(--ejo-text)]">{naira(i.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState icon="chart" title="No active price list for your tier yet" text="As soon as the pricing committee publishes a list for your channel and tier, it appears here and in the daily broadcast." />
      )}
    </div>
  );
}
