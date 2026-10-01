import { listContractorPasses } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityTable } from '@/components/SecurityTable';
import { CONTRACTOR_STATUS_LABEL, STATUS_CHIP, durationText, lagosDay } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

export default async function ContractorsPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const { q, tab } = await searchParams;
  const { tab: current, counts, rows, canDecide } = await listContractorPasses(q, tab);
  const tabs: [string, string][] = [['on_site', 'On site'], ['active', 'Active'], ...(canDecide ? [['to_decide', 'To approve'] as [string, string]] : []), ['upcoming', 'Upcoming'], ['ended', 'Ended'], ['all', 'All']];
  return (
    <div className="p-4 sm:p-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Contractors</h1>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">Outside teams working on site — approved by the Manager, signed in and out at the gate every day.</p>
        </div>
        <LoadingLink href="/security/contractors/new" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">+ Request a pass</LoadingLink>
      </div>
      <SecurityNav active="/security/contractors" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map(([k, l]) => <LoadingLink key={k} href={`/security/contractors?tab=${k}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={`rounded-full px-3 py-1 text-xs font-medium ${current === k ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{l} ({counts[k as keyof typeof counts]})</LoadingLink>)}
        <form className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <input type="hidden" name="tab" value={current} />
          <input name="q" defaultValue={q ?? ''} placeholder="Search CTR, company, work, area, name…" className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)] sm:w-72" />
        </form>
      </div>
      <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">{pluralize(rows.length, 'pass', 'passes')}</p>
      <SecurityTable headers={['Pass', 'Company', 'Work / area', 'Team', 'Days', 'Responsible', 'Status']} widths={['12%', '16%', '22%', '9%', '15%', '12%', '14%']} empty={rows.length ? null : 'No contractor passes here.'}>
        {rows.map((c) => (
          <tr key={c.id}>
            <td><LoadingLink href={`/security/contractors/${c.id}`} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">{c.passNumber}</LoadingLink></td>
            <td>{c.company}<span className="block text-xs text-[var(--ejo-text-muted)]">Lead: {c.leadName}</span></td>
            <td className="text-xs">{c.work}<span className="block text-[var(--ejo-text-muted)]">{c.workArea}</span></td>
            <td className="text-xs">{c.onSite ? `${c.onSite.workersPresent} of ${c.teamSize} in` : pluralize(c.teamSize, 'person', 'people')}</td>
            <td className="text-xs">{lagosDay(c.validFrom)}{lagosDay(c.validFrom) !== lagosDay(c.validUntil) ? ` → ${lagosDay(c.validUntil)}` : ''}{c.onSite ? <span className="block">In since {formatDateTimeCompact(c.onSite.signedInAt)}</span> : null}</td>
            <td className="text-xs">{c.host.fullName}</td>
            <td>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[c.state] ?? 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>{CONTRACTOR_STATUS_LABEL[c.state]}</span>
              {c.afterHours > 0 ? <span className="mt-1 block text-[11px] font-semibold text-[var(--ejo-error)]">{durationText(c.afterHours)} past 5 pm</span> : null}
            </td>
          </tr>
        ))}
      </SecurityTable>
    </div>
  );
}
