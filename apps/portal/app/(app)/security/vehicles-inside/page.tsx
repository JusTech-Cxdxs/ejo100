import { listVehiclesInside } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityTable } from '@/components/SecurityTable';
import { VEHICLE_TYPE_LABEL } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

const TABS = [['all', 'All'], ['visitor', 'Visitor vehicles'], ['workshop', 'Workshop vehicles'], ['cleared', 'Cleared, not yet out']] as const;
const STAGE: Record<string, string> = { VISITOR: 'Visitor', WORKSHOP: 'In the workshop', CLEARED: 'Cleared to leave' };

export default async function VehiclesInsidePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const all = await listVehiclesInside();
  const t = TABS.some(([k]) => k === type) ? type! : 'all';
  const rows = all.filter((r) => t === 'all' || r.stage === t.toUpperCase());
  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Vehicles in the compound</h1>
      <p className="mb-4 mt-1 text-sm text-[var(--ejo-text-muted)]">{pluralize(all.length, 'vehicle')} inside right now.</p>
      <SecurityNav active="/security" />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map(([k, l]) => {
          const n = k === 'all' ? all.length : all.filter((r) => r.stage === k.toUpperCase()).length;
          return <LoadingLink key={k} href={`/security/vehicles-inside?type=${k}`} className={`rounded-full px-3 py-1 text-xs font-medium ${t === k ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{l} ({n})</LoadingLink>;
        })}
      </div>
      <SecurityTable headers={['Status', 'Record', 'Vehicle', 'Plate', 'Customer / visitor', 'Since', '']} widths={['14%', '14%', '18%', '12%', '20%', '14%', '8%']} empty={rows.length ? null : 'No vehicles here.'}>
        {rows.map((r) => (
          <tr key={`${r.kind}-${r.id}`}>
            <td className="text-xs font-medium">{STAGE[r.stage]}</td>
            <td className="font-medium">{r.number}</td>
            <td>{r.kind === 'VISITOR' ? VEHICLE_TYPE_LABEL[r.description] ?? 'Vehicle' : r.description}</td>
            <td className="font-medium">{r.plate ?? '—'}</td>
            <td>{r.who}</td>
            <td className="text-xs">{r.since ? formatDateTimeCompact(r.since) : '—'}</td>
            <td><LoadingLink href={r.href} className="text-xs text-[var(--ejo-primary)] hover:underline">{r.stage === 'CLEARED' ? 'Release' : 'Open'}</LoadingLink></td>
          </tr>
        ))}
      </SecurityTable>
    </div>
  );
}
