import { guardAnyPage } from '@/lib/authz/server';
import { listFinishedUnits, listFgLocations } from '@/lib/actions/warehouse';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, EmptyState, ResponsiveTable, StatusChip, SectionCard } from '@/components/ui';
import { UNIT_STATUSES, UNIT_STATUS_LABEL, UNIT_STATUS_TONE, type UnitStatus } from '@/lib/warehouse-core';
import { Banners, INPUT, LINK, TABLE_WRAP, TD, TD_MUTED, TH, day } from '@/components/warehouse/forms';

const FAMILIES = ['LAPTOP', 'DESKTOP', 'ALL_IN_ONE', 'TABLET', 'MONITOR', 'SMART_BOARD', 'SERVER', 'INVERTER', 'BATTERY', 'SOLAR_PANEL', 'SOLAR_KIT', 'GENERATOR', 'TELEVISION', 'FAN', 'STABILISER', 'AIR_CONDITIONER', 'REFRIGERATOR', 'MICROWAVE', 'ACCESSORY', 'OTHER'];
const human = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Every finished unit by serial, with filters by family, product, location and status, and totals per product. */
export default async function FinishedGoodsPage({ searchParams }: { searchParams: Promise<{ q?: string; family?: string; productId?: string; locationId?: string; status?: string; error?: string }> }) {
  await guardAnyPage(['warehouse.view'], '/warehouse/finished-goods');
  const sp = await searchParams;
  const [{ units, totals }, locations] = await Promise.all([listFinishedUnits({ q: sp.q, family: sp.family, productId: sp.productId, locationId: sp.locationId, status: sp.status }), listFgLocations({ includeRetired: true })]);
  const filtered = Boolean(sp.q || sp.family || sp.productId || sp.locationId || sp.status);
  const total = totals.reduce((s, t) => s + t.count, 0);
  return (
    <div className="p-8">
      <PageHeader icon="package" back={{ href: '/warehouse', label: 'Back to Warehouses' }} title="Finished goods" description={filtered ? `${total} ${total === 1 ? 'unit matches' : 'units match'} the filters.` : `${total} ${total === 1 ? 'unit' : 'units'} on hand (in stock, reserved, picked, released or in quarantine).`} />
      <Banners status={undefined} error={sp.error} map={{}} />

      <form method="get" className="mb-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_200px_170px_auto]">
        <LiveSearchInput name="q" defaultValue={sp.q ?? ''} placeholder="Search by serial or product…" className={INPUT} aria-label="Search by serial or product" />
        <select name="family" defaultValue={sp.family ?? ''} className={INPUT} aria-label="Family"><option value="">Every family</option>{FAMILIES.map((f) => <option key={f} value={f}>{human(f)}</option>)}</select>
        <select name="locationId" defaultValue={sp.locationId ?? ''} className={INPUT} aria-label="Location"><option value="">Every location</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.isActive ? '' : ' (retired)'}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ''} className={INPUT} aria-label="Status"><option value="">On hand</option>{UNIT_STATUSES.map((s) => <option key={s} value={s}>{UNIT_STATUS_LABEL[s]}</option>)}</select>
        <div className="flex gap-2">
          <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">Filter</button>
          {filtered ? <LoadingLink href="/warehouse/finished-goods" className="rounded-[var(--ejo-radius-md)] px-3 py-2 text-sm text-[var(--ejo-text-muted)] hover:underline">Clear</LoadingLink> : null}
        </div>
        {sp.productId ? <input type="hidden" name="productId" value={sp.productId} /> : null}
      </form>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {units.length === 0 ? (
            <EmptyState icon="package" title={filtered ? 'No units match.' : 'No finished units yet.'}>{filtered ? 'Try fewer filters.' : 'Units arrive here from the production line (release to finished goods) and from receiving imported products.'}</EmptyState>
          ) : (
            <ResponsiveTable className={TABLE_WRAP}>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--ejo-border)]"><th className={TH}>Serial</th><th className={TH}>Product</th><th className={TH}>Configuration</th><th className={TH}>Location</th><th className={TH}>Status</th><th className={TH}>Received</th></tr></thead>
                <tbody>
                  {units.map((u) => (
                    <tr key={u.id} className="border-b border-[var(--ejo-border)] last:border-0">
                      <td className={`${TD} font-mono`}><LoadingLink href={`/warehouse/finished-goods/${u.id}`} className={LINK}>{u.serialNumber}</LoadingLink></td>
                      <td data-label="Product" className={TD}>{u.product.name}<span className="block text-xs text-[var(--ejo-text-muted)]">{u.product.sku} · {human(u.product.family)}</span></td>
                      <td data-label="Configuration" className={TD_MUTED}>{u.configuration?.name ?? '—'}</td>
                      <td data-label="Location" className={TD_MUTED}>{u.location.name}<span className="block text-xs">{u.location.branch.name}</span></td>
                      <td data-label="Status" className={TD}><StatusChip status={u.status} label={UNIT_STATUS_LABEL[u.status as UnitStatus]} tone={UNIT_STATUS_TONE[u.status as UnitStatus]} /></td>
                      <td data-label="Received" className={TD_MUTED}>{day(u.receivedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
          {units.length >= 300 ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Showing the 300 most recently changed — narrow the filters to see the rest.</p> : null}
        </div>
        <SectionCard icon="bars" title="Totals per product" description={filtered ? 'Within the filters.' : 'On hand.'}>
          {totals.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">Nothing to count.</p> : (
            <ul className="divide-y divide-[var(--ejo-border)] text-sm">
              {totals.map((t) => (
                <li key={t.productId} className="flex items-center justify-between gap-2 py-2">
                  <LoadingLink href={`/warehouse/finished-goods?productId=${t.productId}${sp.status ? `&status=${sp.status}` : ''}`} className={LINK}>{t.name}<span className="block text-xs text-[var(--ejo-text-muted)]">{t.sku}</span></LoadingLink>
                  <span className="font-semibold text-[var(--ejo-text)]">{t.count}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
