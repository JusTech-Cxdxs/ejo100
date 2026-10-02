import { listIncidents } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityTable } from '@/components/SecurityTable';
import { INCIDENT_STATUS_LABEL, SEVERITY_LABEL, SEVERITY_CHIP, STATUS_CHIP } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';
import { LiveSearchInput } from '@/components/LiveSearchInput';

const TABS: [string, string][] = [['open', 'Open'], ['under_review', 'Under review'], ['closed', 'Closed'], ['all', 'All']];

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; severity?: string }> }) {
  const { q, tab, severity } = await searchParams;
  const { tab: current, counts, rows } = await listIncidents(q, tab, severity);
  const keep = (k: string) => `/security/incidents?tab=${k}${q ? `&q=${encodeURIComponent(q)}` : ''}${severity ? `&severity=${severity}` : ''}`;
  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Security incidents</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">Anything abnormal at the gate or on site — reported, followed up and closed by the Chief Security Officer.</p>
        </div>
        <LoadingLink href="/security/incidents/new" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Report an incident</LoadingLink>
      </div>
      <SecurityNav active="/security/incidents" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([k, l]) => <LoadingLink key={k} href={keep(k)} className={`rounded-full px-3 py-1 text-xs font-medium ${current === k ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{l} ({counts[k as keyof typeof counts]})</LoadingLink>)}
        <form className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <input type="hidden" name="tab" value={current} />
          <select name="severity" defaultValue={severity ?? ''} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)]">
            <option value="">Any severity</option>
            {Object.entries(SEVERITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <LiveSearchInput name="q" defaultValue={q ?? ''} placeholder="Search INC, type, place, people, plate…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)] sm:w-64" />
          <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-sm text-[var(--ejo-text)]">Filter</button>
        </form>
      </div>
      <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">{pluralize(rows.length, 'incident')}</p>
      <SecurityTable headers={['Number', 'When', 'Type', 'Severity', 'Where', 'Related', 'People', 'Status']} widths={['12%', '12%', '18%', '9%', '14%', '10%', '15%', '10%']} empty={rows.length ? null : 'No incidents here.'}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td><LoadingLink href={`/security/incidents/${r.id}`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">{r.incidentNumber}</LoadingLink></td>
            <td className="text-xs">{formatDateTimeCompact(r.occurredAt)}</td>
            <td>{r.type}</td>
            <td><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_CHIP[r.severity]}`}>{SEVERITY_LABEL[r.severity]}</span></td>
            <td className="text-xs">{r.location}</td>
            <td className="text-xs">{r.relatedNumber ?? '—'}</td>
            <td className="text-xs">Reported by {r.reportedBy.fullName}{r.assignedTo ? <span className="block text-[var(--ejo-text-muted)]">Assigned to {r.assignedTo.fullName}</span> : null}</td>
            <td><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[r.status] ?? ''}`}>{INCIDENT_STATUS_LABEL[r.status]}</span></td>
          </tr>
        ))}
      </SecurityTable>
    </div>
  );
}
