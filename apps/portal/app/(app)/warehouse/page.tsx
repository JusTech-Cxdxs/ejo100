import { allows, guardAnyPage } from '@/lib/authz/server';
import { getWarehouseHome } from '@/lib/actions/warehouse';
import { OrgTrail } from '@/components/OrgTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, NavCard, StatTile, SectionCard, EmptyState, type IconName } from '@/components/ui';
import { FG_LOCATION_KIND_LABEL, type FgLocationKind } from '@/lib/warehouse-core';
import { LINK } from '@/components/warehouse/forms';

const FAMILY_LABEL: Record<string, string> = {
  LAPTOP: 'Laptops', DESKTOP: 'Desktops', ALL_IN_ONE: 'All-in-ones', TABLET: 'Tablets', MONITOR: 'Monitors', SMART_BOARD: 'Smart Boards', SERVER: 'Servers', INVERTER: 'Inverters',
  BATTERY: 'Batteries', SOLAR_PANEL: 'Solar panels', SOLAR_KIT: 'Solar kits', GENERATOR: 'Generators', TELEVISION: 'Televisions', FAN: 'Fans', STABILISER: 'Stabilisers',
  AIR_CONDITIONER: 'Air conditioners', REFRIGERATOR: 'Refrigerators', MICROWAVE: 'Microwaves', ACCESSORY: 'Accessories', OTHER: 'Other',
};

/** The Warehouses home: finished units in stock by family and location, what is waiting, and the areas this person may open. */
export default async function WarehousePage() {
  await guardAnyPage(['warehouse.view'], '/warehouse');
  const [h, canFg, canParts, canDispatch, canManage, canStore] = await Promise.all([getWarehouseHome(), allows('warehouse.fg.operate'), allows('warehouse.parts.operate'), allows('warehouse.dispatch'), allows('warehouse.manage'), allows('store.view')]);
  const sections: { name: string; href: string; desc: string; icon: IconName; show: boolean; badge?: number }[] = [
    { name: 'Finished goods', href: '/warehouse/finished-goods', icon: 'package', desc: 'Every unit by serial, product, location and status.', show: true },
    { name: 'Goods release notes', href: '/warehouse/releases', icon: 'clipboard', desc: 'Orders cleared by Finance: pick the serials and release them.', show: true, badge: h.toPick },
    { name: 'Dispatches', href: '/warehouse/dispatches', icon: 'truck', desc: 'Vehicle, driver and waybill for released goods; delivery confirmation.', show: true },
    { name: 'Receive finished products', href: '/warehouse/receive', icon: 'download', desc: 'Imported tablets, monitors, iPower and iTEC units booked in by serial against a purchase order.', show: canFg || canManage },
    { name: 'Incoming QC', href: '/warehouse/incoming-qc', icon: 'check', desc: 'Sample, test and pass or fail each goods receipt of components.', show: true, badge: h.awaitingQc },
    { name: 'Stock transfers', href: '/warehouse/transfers', icon: 'road', desc: 'Move units between locations and branches, with dispatch and receipt.', show: true, badge: h.transfersOpen },
    { name: 'Locations', href: '/warehouse/locations', icon: 'pin', desc: 'Stores, showroom floor, consignment and quarantine locations.', show: true },
    { name: 'Adjustments', href: '/warehouse/adjustments', icon: 'sliders', desc: 'Quarantined units waiting for the Warehouse Manager: scrap or return to stock.', show: true, badge: h.quarantine },
    { name: 'Components store', href: '/inventory', icon: 'layers', desc: 'The parts warehouse: components, goods receipts, bins and reorder levels.', show: canStore },
  ];
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader
        hero
        live
        icon="boxes"
        eyebrow="Module · Warehouses"
        title="Warehouses"
        description={<>Finished goods by serial, the components store, transfers, picking, release and dispatch. <span className="block text-xs"><OrgTrail area="Warehouse" /></span></>}
      />

      <div className="ejo-stagger mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile icon="package" label="Units in stock" value={h.inStock} hint="Finished, by serial" href="/warehouse/finished-goods" tone="success" />
        <StatTile icon="tag" label="Reserved or picked" value={h.reserved + h.picked} hint={`${h.reserved} reserved · ${h.picked} picked or released`} href="/warehouse/finished-goods?status=RESERVED" tone="info" />
        <StatTile icon="clipboard" label="Releases to pick" value={h.toPick} hint="Cleared by Finance" href="/warehouse/releases?status=ISSUED" tone={h.toPick ? 'warning' : 'neutral'} />
        <StatTile icon="truck" label="Dispatched today" value={h.dispatchedToday} hint="Left the warehouse" href="/warehouse/dispatches" tone="brand" />
        <StatTile icon="check" label="Receipts awaiting QC" value={h.awaitingQc} hint="Components not yet inspected" href="/warehouse/incoming-qc" tone={h.awaitingQc ? 'warning' : 'neutral'} />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <SectionCard icon="bars" title="In stock by family" description="Finished units ready to sell, by product family.">
          {h.byFamily.length === 0 ? <EmptyState compact icon="package" title="No finished units in stock yet." /> : (
            <ul className="divide-y divide-[var(--ejo-border)] text-sm">
              {h.byFamily.map((f) => (
                <li key={f.key} className="flex items-center justify-between py-2">
                  <LoadingLink href={`/warehouse/finished-goods?family=${f.key}`} className={LINK}>{FAMILY_LABEL[f.key] ?? f.key}</LoadingLink>
                  <span className="font-semibold text-[var(--ejo-text)]">{f.count}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard icon="pin" title="In stock by location" description="Where the units are held.">
          {h.byLocation.length === 0 ? <EmptyState compact icon="pin" title="No locations yet." action={canManage ? <LoadingLink href="/warehouse/locations" className={LINK}>Add the first location</LoadingLink> : undefined} /> : (
            <ul className="divide-y divide-[var(--ejo-border)] text-sm">
              {h.byLocation.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-2">
                  <span>
                    <LoadingLink href={`/warehouse/finished-goods?locationId=${l.id}`} className={LINK}>{l.name}</LoadingLink>
                    <span className="ml-2 text-xs text-[var(--ejo-text-muted)]">{FG_LOCATION_KIND_LABEL[l.kind as FgLocationKind]} · {l.branch}</span>
                  </span>
                  <span className="font-semibold text-[var(--ejo-text)]">{l.count}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="ejo-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sections.filter((s) => s.show).map((s) => (
          <NavCard key={s.href} href={s.href} icon={s.icon} title={s.name} description={s.desc} badge={s.badge ? String(s.badge) : undefined} />
        ))}
      </div>
      {!canDispatch && !canParts && !canFg && !canManage ? <p className="mt-6 text-xs text-[var(--ejo-text-muted)]">You can see the warehouses; the warehouse teams record the movements.</p> : null}
    </div>
  );
}
