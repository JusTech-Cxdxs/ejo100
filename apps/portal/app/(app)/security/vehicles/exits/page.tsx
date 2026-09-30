import { listVehicleExits } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityTable } from '@/components/SecurityTable';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

export default async function VehicleExitsPage({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  const { q, kind } = await searchParams;
  const all = await listVehicleExits(q);
  const rows = all.filter((x) => (kind === 'job-card' ? x.jobCard : kind === 'vehicle-service' ? x.vehicleService : true));
  const tabs: [string, string, number][] = [['all', 'All', all.length], ['job-card', 'Job Cards', all.filter((x) => x.jobCard).length], ['vehicle-service', 'Vehicle Services', all.filter((x) => x.vehicleService).length]];
  const link = 'text-[var(--ejo-primary)] hover:underline';
  return (
    <div className="p-4 sm:p-8">
      <h1 className="mb-4 text-2xl font-bold text-[var(--ejo-text)]">Vehicle exit history</h1>
      <SecurityNav active="/security/vehicles" />
      <div className="mb-3 flex flex-wrap gap-2">
        {tabs.map(([key, l, n]) => (
          <LoadingLink key={key} href={`/security/vehicles/exits?kind=${key}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={`rounded-full px-3 py-1 text-xs font-medium ${(kind ?? 'all') === key ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{l} ({n})</LoadingLink>
        ))}
      </div>
      <form className="mb-4 flex max-w-xl gap-2">
        {kind ? <input type="hidden" name="kind" value={kind} /> : null}
        <input name="q" defaultValue={q ?? ''} placeholder="Search VX number, plate, Job Card, Vehicle Service, collector…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm text-[var(--ejo-text)]">Search</button>
      </form>
      <SecurityTable headers={['Exit', 'Left', 'Vehicle', 'Plate', 'Record', 'Customer', 'Collected by', '']} widths={['13%', '12%', '15%', '10%', '12%', '15%', '14%', '9%']} empty={rows.length ? null : q ? 'Nothing matches.' : 'No vehicles have left yet.'}>
        {rows.map((x) => (
          <tr key={x.id}>
            <td className="font-medium">{x.exitNumber}</td>
            <td className="text-xs">{formatDateTimeCompact(x.exitedAt)}</td>
            <td><LoadingLink href={`/workshop/vehicles/${x.vehicle.id}/edit`} className={link}>{[x.vehicle.make, x.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}</LoadingLink></td>
            <td className="font-medium">{x.vehicle.plateNumber ?? '—'}</td>
            <td>{x.jobCard ? <LoadingLink href={`/workshop/job-cards/${x.jobCard.id}`} className={link}>{x.jobCard.jobNumber}</LoadingLink> : x.vehicleService ? <LoadingLink href={`/workshop/vehicle-service/${x.vehicleService.id}`} className={link}>{x.vehicleService.serviceNumber}</LoadingLink> : '—'}</td>
            <td>{x.jobCard?.customer.fullName ?? x.vehicleService?.customer.fullName ?? '—'}</td>
            <td className="text-xs">{x.driverName ?? '—'}</td>
            <td><LoadingLink href={`/security/vehicles/exits/${x.id}`} className={`text-xs ${link}`}>Open</LoadingLink></td>
          </tr>
        ))}
      </SecurityTable>
    </div>
  );
}
