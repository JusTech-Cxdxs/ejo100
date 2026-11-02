import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardPage } from '@/lib/authz/server';
import { getShipment } from '@/lib/actions/plant-kits';
import { PageHeader, SectionCard } from '@/components/ui';
import { AddKits } from '@/components/plant/ShipmentForm';
import { KitList } from '@/components/plant/KitList';
import { formatDateOnly, formatDateTimeCompact } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

/** One shipment: where it came from, the SAP numbers it is received against, and its kits. */
export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardPage('plant.view', `/plant/shipments/${id}`);
  const s = await getShipment(id);
  if (!s) notFound();
  const facts = [
    ['Supplier', s.supplier], ['Shipped from', s.origin], ['Arrived', formatDateOnly(s.arrivedAt)], ['Plant', s.branch],
    ['Bill of lading', s.billOfLading], ['Vessel', s.vessel], ['SAP purchase order (EBELN)', s.sapPurchaseOrder], ['SAP inbound delivery (VBELN)', s.sapInboundDelivery],
  ] as const;
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="truck" back={{ href: '/plant/shipments', label: 'Back to shipments' }} eyebrow={s.number} title={`Shipment from ${s.supplier}`} description={`Recorded by ${s.recordedBy} ${formatDateTimeCompact(s.createdAt)} · ${s.kits.length} ${s.kits.length === 1 ? 'kit' : 'kits'}`} />
      <SectionCard icon="truck" title="The shipment">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 pb-4 text-sm sm:grid-cols-4">
          {facts.map(([l, v]) => <div key={l}><dt className="text-xs text-[var(--ejo-text-muted)]">{l}</dt><dd className="break-words font-medium text-[var(--ejo-text)]">{v ?? '—'}</dd></div>)}
          <div className="col-span-2 sm:col-span-4"><dt className="text-xs text-[var(--ejo-text-muted)]">Containers</dt><dd className="break-words font-mono text-[var(--ejo-text)]">{s.containers.length ? s.containers.join(' · ') : '—'}</dd></div>
          {s.notes ? <div className="col-span-2 sm:col-span-4"><dt className="text-xs text-[var(--ejo-text-muted)]">Notes</dt><dd className="text-[var(--ejo-text)]">{s.notes}</dd></div> : null}
        </dl>
      </SectionCard>
      <SectionCard icon="boxes" title="Kits" flush actions={<Link href={`/plant/kits?q=${encodeURIComponent(s.number)}`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">All kits →</Link>}>
        <KitList rows={s.kits} empty="No kits on this shipment yet." />
      </SectionCard>
      {s.may.addKits ? (
        <SectionCard icon="plus" title="Add kits" description="A second packing list, or kits found later. Same checks: nothing is saved until every line is right.">
          <AddKits shipmentId={s.id} />
        </SectionCard>
      ) : null}
    </div>
  );
}
