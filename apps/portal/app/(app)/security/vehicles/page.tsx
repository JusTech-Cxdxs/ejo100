import { listVehiclesClearedToLeave } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityTable } from '@/components/SecurityTable';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

export default async function ClearedToLeavePage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const { q, kind } = await searchParams;
  const all = await listVehiclesClearedToLeave();
  const term = (q ?? '').trim().toLowerCase();
  const matched = all.filter((v) => !term || [v.number, v.vehicle.plateNumber, v.vehicle.chassisNumber, v.customer, v.collectedBy, v.vehicle.make, v.vehicle.model].some((x) => (x ?? '').toLowerCase().includes(term)));
  const k = kind === 'job-card' ? 'JOB_CARD' : kind === 'vehicle-service' ? 'VEHICLE_SERVICE' : null;
  const rows = matched.filter((v) => !k || v.kind === k);
  const tabs: [string, string, number][] = [['all', 'All', matched.length], ['job-card', 'Job Cards', matched.filter((v) => v.kind === 'JOB_CARD').length], ['vehicle-service', 'Vehicle Services', matched.filter((v) => v.kind === 'VEHICLE_SERVICE').length]];
  const link = 'text-[var(--ejo-primary)] hover:underline';
  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Vehicles cleared to leave</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">{pluralize(all.length, 'vehicle')} released by the Workshop and waiting at the gate. A vehicle not on this list has not been released.</p>
        </div>
        <LoadingLink href="/security/vehicles/exits" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Exit history</LoadingLink>
      </div>
      <SecurityNav active="/security/vehicles" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map(([key, l, n]) => (
          <LoadingLink key={key} href={`/security/vehicles?kind=${key}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={`rounded-full px-3 py-1 text-xs font-medium ${(k === null ? 'all' : kind) === key ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{l} ({n})</LoadingLink>
        ))}
        <form className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          {kind ? <input type="hidden" name="kind" value={kind} /> : null}
          <input name="q" defaultValue={q ?? ''} placeholder="Search plate, VIN, JC / SV, customer, collector…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)] sm:w-80" />
        </form>
      </div>
      <SecurityTable headers={['Record', 'Vehicle', 'Plate / VIN', 'Customer', 'Released', 'Collected by', '']} widths={['13%', '17%', '17%', '17%', '13%', '12%', '11%']} empty={rows.length ? null : term || k ? 'No vehicles match.' : 'No vehicles waiting to leave.'}>
        {rows.map((v) => (
          <tr key={`${v.kind}-${v.id}`}>
            <td><LoadingLink href={v.kind === 'JOB_CARD' ? `/workshop/job-cards/${v.id}` : `/workshop/vehicle-service/${v.id}`} className={`font-medium ${link}`}>{v.number}</LoadingLink>{v.cancelled ? <span className="block text-xs text-[var(--ejo-text-muted)]">handed back</span> : null}</td>
            <td>{[v.vehicle.make, v.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}</td>
            <td><span className="font-medium">{v.vehicle.plateNumber ?? '—'}</span>{v.vehicle.chassisNumber ? <span className="block text-xs text-[var(--ejo-text-muted)]">{v.vehicle.chassisNumber}</span> : null}</td>
            <td>{v.customer}</td>
            <td className="text-xs">{v.releasedAt ? formatDateTimeCompact(v.releasedAt) : '—'}</td>
            <td className="text-xs">{v.collectedBy ?? '—'}</td>
            <td><LoadingLink href={`/security/vehicles/release/${v.kind === 'JOB_CARD' ? 'job-card' : 'vehicle-service'}/${v.id}`} className="inline-block rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90">Confirm exit</LoadingLink></td>
          </tr>
        ))}
      </SecurityTable>
    </div>
  );
}
