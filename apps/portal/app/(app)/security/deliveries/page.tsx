import { listDeliveries } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityTable } from '@/components/SecurityTable';
import { DELIVERY_STATUS_LABEL, STATUS_CHIP } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

const TABS: [string, string][] = [['at_gate', 'At the gate'], ['expected', 'Expected'], ['received', 'Received'], ['left', 'Left'], ['cancelled', 'Cancelled'], ['all', 'All']];

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const { q, tab } = await searchParams;
  const { tab: current, counts, rows } = await listDeliveries(q, tab);
  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Deliveries</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">Suppliers at the gate: Security records arrival and departure; the Store confirms what it received.</p>
        </div>
        <LoadingLink href="/security/deliveries/new" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Delivery</LoadingLink>
      </div>
      <SecurityNav active="/security/deliveries" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([k, l]) => <LoadingLink key={k} href={`/security/deliveries?tab=${k}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={`rounded-full px-3 py-1 text-xs font-medium ${current === k ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{l} ({counts[k as keyof typeof counts]})</LoadingLink>)}
        <form className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <input type="hidden" name="tab" value={current} />
          <input name="q" defaultValue={q ?? ''} placeholder="Search DLV, supplier, reference, items, plate…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)] sm:w-72" />
        </form>
      </div>
      <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">{pluralize(rows.length, 'delivery', 'deliveries')}</p>
      <SecurityTable headers={['Number', 'Supplier', 'Items', 'Vehicle', 'Timeline', 'GRN', 'Status']} widths={['12%', '17%', '22%', '12%', '17%', '10%', '10%']} empty={rows.length ? null : 'No deliveries here.'}>
        {rows.map((d) => (
          <tr key={d.id}>
            <td><LoadingLink href={`/security/deliveries/${d.id}`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">{d.deliveryNumber}</LoadingLink></td>
            <td>{d.supplierName}{d.reference ? <span className="block text-xs text-[var(--ejo-text-muted)]">{d.reference}</span> : null}</td>
            <td className="text-xs">{d.items}</td>
            <td className="text-xs">{d.vehiclePlate ?? '—'}{d.driverName ? <span className="block text-[var(--ejo-text-muted)]">{d.driverName}</span> : null}</td>
            <td className="text-xs">
              {d.arrivedAt ? <span className="block">In {formatDateTimeCompact(d.arrivedAt)}</span> : d.expectedAt ? <span className="block">Expected {formatDateTimeCompact(d.expectedAt)}</span> : null}
              {d.receivedAt ? <span className="block">Received {formatDateTimeCompact(d.receivedAt)}</span> : null}
              {d.leftAt ? <span className="block">Left {formatDateTimeCompact(d.leftAt)}</span> : null}
            </td>
            <td className="text-xs">{d.goodsReceipt ? <LoadingLink href={`/inventory/goods-receipts/${d.goodsReceipt.id}`} className="text-[var(--ejo-primary)] hover:underline">{d.goodsReceipt.referenceNumber}</LoadingLink> : '—'}</td>
            <td><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[d.status] ?? 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>{DELIVERY_STATUS_LABEL[d.status]}</span></td>
          </tr>
        ))}
      </SecurityTable>
    </div>
  );
}
