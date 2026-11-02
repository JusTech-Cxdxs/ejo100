import Link from 'next/link';
import { EmptyState, StatusChip } from '@/components/ui';
import type { KitRow } from '@/lib/actions/plant-kits';
import { KIT_STATUS_WORDS, type KitStatus } from '@/lib/plant/kits';

export const KIT_TONE: Record<KitStatus, 'info' | 'warning' | 'success' | 'neutral' | 'brand' | 'error'> = {
  ARRIVED: 'neutral', INSPECTING: 'info', SUBMITTED: 'brand', ON_HOLD: 'warning', RELEASED: 'success', REJECTED: 'error', CANCELLED: 'neutral',
};

/** Kits as a list: number, VIN, model, cases, open issues, and where each one is. */
export function KitList({ rows, empty, showShipment = false }: { rows: KitRow[]; empty: string; showShipment?: boolean }) {
  if (!rows.length) return <div className="p-4"><EmptyState compact icon="boxes" title={empty} /></div>;
  return (
    <ul className="divide-y divide-[var(--ejo-border)]">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-sm" data-kit={r.number}>
          <span className="min-w-0">
            <Link href={`/plant/kits/${r.id}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{r.number}</Link> · <span className="font-mono">{r.vin}</span> · {r.modelCode} {r.kitType}
            <span className="block text-xs text-[var(--ejo-text-muted)]">{[r.engineNumber ? `engine ${r.engineNumber}` : null, r.lotNumber ? `lot ${r.lotNumber}` : null, r.casesExpected !== null ? `${r.casesReceived ?? '?'} of ${r.casesExpected} cases` : r.casesReceived !== null ? `${r.casesReceived} cases` : null, showShipment ? `shipment ${r.shipment.number}` : null, r.branch].filter(Boolean).join(' · ')}</span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            {r.stoppingIssues ? <StatusChip tone="error">{r.stoppingIssues} stopping the line</StatusChip> : null}
            {r.openIssues > r.stoppingIssues ? <StatusChip tone="warning">{r.openIssues - r.stoppingIssues} open {r.openIssues - r.stoppingIssues === 1 ? 'issue' : 'issues'}</StatusChip> : null}
            <StatusChip tone={KIT_TONE[r.status]}>{r.status === 'RELEASED' && r.releasedWithShortages ? 'Released with shortages' : KIT_STATUS_WORDS[r.status]}</StatusChip>
          </span>
        </li>
      ))}
    </ul>
  );
}
