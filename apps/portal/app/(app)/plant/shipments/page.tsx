import Link from 'next/link';
import { allows, guardPage } from '@/lib/authz/server';
import { listShipments } from '@/lib/actions/plant-kits';
import { EmptyState, HeaderAction, PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { formatDateOnly } from '@/lib/utils/format-date';

export const dynamic = 'force-dynamic';

/** Shipments of kits, newest first: search by number, supplier, bill of lading, container or SAP number. */
export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await guardPage('plant.view', '/plant/shipments');
  const sp = await searchParams;
  const [rows, receive] = await Promise.all([listShipments(sp.q), allows('plant.kit.receive')]);
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="truck" back={{ href: '/plant', label: 'Back to the plant' }} title="Shipments of kits" description="Each bill of lading as it arrived, with its kits and what is still open." actions={receive ? <HeaderAction href="/plant/shipments/new" icon="plus">Record a shipment</HeaderAction> : undefined} />
      <form className="flex flex-wrap gap-2" action="/plant/shipments">
        <LiveSearchInput name="q" defaultValue={sp.q ?? ''} placeholder="Shipment, supplier, bill of lading, container, SAP order…" className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
      </form>
      <SectionCard icon="truck" title={`${rows.length} ${rows.length === 1 ? 'shipment' : 'shipments'}`} flush>
        {rows.length === 0 ? <div className="p-4"><EmptyState compact icon="truck" title="No shipment matches.">{receive ? 'Record a shipment as it arrives: its kits come from the packing list.' : 'Shipments appear here as the kit inspectors record them.'}</EmptyState></div> : (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <Link href={`/plant/shipments/${r.id}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{r.number}</Link> · {r.supplier}
                  <span className="block text-xs text-[var(--ejo-text-muted)]">{[r.billOfLading ? `B/L ${r.billOfLading}` : null, r.origin, r.branch, `arrived ${formatDateOnly(r.arrivedAt)}`].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusChip tone="neutral">{r.kits} {r.kits === 1 ? 'kit' : 'kits'}</StatusChip>
                  {r.open ? <StatusChip tone="info">{r.open} at arrival</StatusChip> : null}
                  {r.released ? <StatusChip tone="success">{r.released} released</StatusChip> : null}
                  {r.issues ? <StatusChip tone="warning">{r.issues} open {r.issues === 1 ? 'issue' : 'issues'}</StatusChip> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
