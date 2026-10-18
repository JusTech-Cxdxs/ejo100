import { allows, guardAnyPage } from '@/lib/authz/server';
import { getProcurementHome } from '@/lib/actions/procurement';
import { OrgTrail } from '@/components/OrgTrail';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, NavCard, StatTile, SectionCard, EmptyState, StatusChip, type IconName } from '@/components/ui';
import { PO_STATUS_LABEL, PO_STATUS_TONE, SHIPMENT_STATUS_LABEL, SHIPMENT_STATUS_TONE, shipmentOverdue, type PurchaseOrderStatus, type ShipmentStatus } from '@/lib/procurement-core';
import { LINK, amount, day } from '@/components/warehouse/forms';

/** Procurement home: what is waiting for approval, what is open with suppliers, what is on the water, and the areas this person may open. */
export default async function ProcurementPage() {
  await guardAnyPage(['procurement.view'], '/procurement');
  const [h, canRaise, canManage, canApprove, canStore] = await Promise.all([getProcurementHome(), allows('procurement.requisition.raise'), allows('procurement.po.manage'), allows('procurement.requisition.approve'), allows('store.view')]);
  const sections: { name: string; href: string; desc: string; icon: IconName; badge?: number }[] = [
    { name: 'Requisitions', href: '/procurement/requisitions', icon: 'clipboard', desc: 'What the line, the warehouse and the showroom need bought, and its approval.', badge: h.awaiting },
    { name: 'Purchase orders', href: '/procurement/orders', icon: 'cart', desc: 'Orders to suppliers at home and abroad: currency, terms, approval and receipts.', badge: h.openPos },
    { name: 'Shipments', href: '/procurement/shipments', icon: 'truck', desc: 'Containers and airfreight from booking to customs clearance and arrival.', badge: h.inTransit + h.atCustoms },
    { name: 'Suppliers', href: '/procurement/suppliers', icon: 'handshake', desc: 'Who we buy from, their terms, lead times and open orders.' },
    { name: 'Supplier claims', href: '/procurement/claims', icon: 'alert', desc: 'Shortages, damage and component failures charged back to the supplier.', badge: h.claimsOpen },
    ...(canStore ? [{ name: 'Components store', href: '/inventory', icon: 'layers' as IconName, desc: 'Goods receipts, stock on hand and reorder suggestions the requisitions come from.' }] : []),
  ];
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader hero live icon="cart" eyebrow="Module · Procurement" title="Procurement" description={<>From requisition to supplier, shipment and receipt. <span className="block text-xs"><OrgTrail area="Procurement" /></span></>} />

      <div className="ejo-stagger mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon="clipboard" label="Requisitions awaiting approval" value={h.awaiting} hint={canApprove ? 'Waiting on you' : 'With the Head of Procurement'} href="/procurement/requisitions?status=SUBMITTED" tone={h.awaiting ? 'warning' : 'neutral'} />
        <StatTile icon="cart" label="Open purchase orders" value={h.openPos} hint="Raised, sent or partly received" href="/procurement/orders?status=open" tone="brand" />
        <StatTile icon="truck" label="Shipments on the way" value={h.inTransit + h.atCustoms} hint={h.atCustoms ? `${h.atCustoms} at customs` : 'Booked, at sea or at port'} href="/procurement/shipments?status=open" tone={h.atCustoms ? 'warning' : 'info'} />
        <StatTile icon="calendar" label="Receipts due this week" value={h.dueThisWeek} hint="Orders expected in the next 7 days" href="/procurement/orders?status=open" tone="success" />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <SectionCard icon="cart" title="Open purchase orders" description="Most recently changed first.">
          {h.recentPos.length === 0 ? <EmptyState compact icon="cart" title="No open purchase orders." action={canManage ? <LoadingLink href="/procurement/orders/new" className={LINK}>Raise one</LoadingLink> : undefined} /> : (
            <ul className="divide-y divide-[var(--ejo-border)] text-sm">
              {h.recentPos.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                  <span><LoadingLink href={`/procurement/orders/${o.id}`} className={LINK}>{o.number}</LoadingLink><span className="block text-xs text-[var(--ejo-text-muted)]">{o.supplier.name} · {amount(o.total, o.currency)}{o.expectedDate ? ` · expected ${day(o.expectedDate)}` : ''}</span></span>
                  <StatusChip status={o.status} label={PO_STATUS_LABEL[o.status as PurchaseOrderStatus]} tone={PO_STATUS_TONE[o.status as PurchaseOrderStatus]} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard icon="truck" title="Shipments on the way" description="Soonest arrival first.">
          {h.dueShipments.length === 0 ? <EmptyState compact icon="truck" title="Nothing on the way." /> : (
            <ul className="divide-y divide-[var(--ejo-border)] text-sm">
              {h.dueShipments.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <span><LoadingLink href={`/procurement/shipments/${s.id}`} className={LINK}>{s.number}</LoadingLink><span className="block text-xs text-[var(--ejo-text-muted)]">{s.purchaseOrder.number} · {s.purchaseOrder.supplier.name} · {s.mode.toLowerCase()}{s.eta ? ` · ETA ${day(s.eta)}` : ''}{shipmentOverdue({ status: s.status as ShipmentStatus, eta: s.eta }) ? ' · overdue' : ''}</span></span>
                  <StatusChip status={s.status} label={SHIPMENT_STATUS_LABEL[s.status as ShipmentStatus]} tone={SHIPMENT_STATUS_TONE[s.status as ShipmentStatus]} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="ejo-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => <NavCard key={s.href} href={s.href} icon={s.icon} title={s.name} description={s.desc} badge={s.badge ? String(s.badge) : undefined} />)}
      </div>
      {!canRaise && !canManage ? <p className="mt-6 text-xs text-[var(--ejo-text-muted)]">You can follow procurement; Procurement raises and approves the records.</p> : null}
    </div>
  );
}
