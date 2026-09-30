import { listRoadTests, getSecurityRoles } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityTable } from '@/components/SecurityTable';
import { ROAD_TEST_STATUS_LABEL, STATUS_CHIP, durationText, roadTestOverdueMinutes } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

const TABS = [['out', 'Out now'], ['approved', 'Approved — ready to go'], ['to_decide', 'To approve'], ['all', 'All']] as const;

export default async function RoadTestsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tab, q } = await searchParams;
  const roles = await getSecurityRoles();
  const scope = (TABS.some(([k]) => k === tab) ? tab : 'out') as (typeof TABS)[number][0];
  const rows = await listRoadTests(scope, q);
  const now = new Date();
  const link = 'text-[var(--ejo-primary)] hover:underline';
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Road tests</h1>
      <p className="mb-4 mt-1 text-sm text-[var(--ejo-text-muted)]">Workshop vehicles leaving for a road test — requested on the Job Card / Vehicle Service, approved by the Manager, timed and odometer-read out and back by Security.</p>
      <SecurityNav active="/security/road-tests" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.filter(([k]) => k !== 'to_decide' || roles.isManager || roles.isMaster).map(([k, l]) => (
          <LoadingLink key={k} href={`/security/road-tests?tab=${k}`} className={`rounded-full px-3 py-1 text-xs font-medium ${scope === k ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{l}</LoadingLink>
        ))}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="tab" value={scope} />
          <input name="q" defaultValue={q ?? ''} placeholder="Search RT number, plate, JC / SV, driver…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)]" />
        </form>
      </div>
      <SecurityTable headers={['Permit', 'Record', 'Vehicle', 'Driver', 'Checking', 'Out / back', 'Km', 'Status']} widths={['12%', '11%', '15%', '12%', '18%', '13%', '7%', '12%']} empty={rows.length ? null : 'No road tests here.'}>
        {rows.map((r) => {
          const over = roadTestOverdueMinutes(r, now);
          return (
            <tr key={r.id}>
              <td><LoadingLink href={`/security/road-tests/${r.id}`} className={`font-medium ${link}`}>{r.permitNumber}</LoadingLink></td>
              <td>{r.jobCard ? <LoadingLink href={`/workshop/job-cards/${r.jobCard.id}`} className={link}>{r.jobCard.jobNumber}</LoadingLink> : r.vehicleService ? <LoadingLink href={`/workshop/vehicle-service/${r.vehicleService.id}`} className={link}>{r.vehicleService.serviceNumber}</LoadingLink> : '—'}</td>
              <td>{[r.vehicle.make, r.vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}<span className="block text-xs font-medium">{r.vehicle.plateNumber}</span></td>
              <td>{r.driver.fullName}</td>
              <td className="text-xs">{r.purpose}{r.route ? <span className="block text-[var(--ejo-text-muted)]">{r.route}</span> : null}</td>
              <td className="text-xs">{r.gateOutAt ? formatDateTimeCompact(r.gateOutAt) : `Planned ${durationText(r.expectedDurationMinutes)}`}{r.gateInAt ? <span className="block">back {formatDateTimeCompact(r.gateInAt)}</span> : null}</td>
              <td className="text-xs">{r.startOdometer !== null && r.endOdometer !== null ? (r.endOdometer - r.startOdometer).toLocaleString('en-NG') : '—'}</td>
              <td>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[r.status] ?? ''}`}>{ROAD_TEST_STATUS_LABEL[r.status]}</span>
                {over > 0 ? <span className="mt-1 block text-[11px] font-semibold text-[var(--ejo-error)]">Late {durationText(over)}</span> : null}
              </td>
            </tr>
          );
        })}
      </SecurityTable>
    </div>
  );
}
