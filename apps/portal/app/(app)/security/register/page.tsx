import { searchSecurityRecords } from '@/lib/actions/security';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { SecurityTable } from '@/components/SecurityTable';
import { VISIT_STATUS_LABEL, EXIT_PASS_STATUS_LABEL, ROAD_TEST_STATUS_LABEL, STATUS_CHIP } from '@/lib/security-rules';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

const TYPES = [['', 'Everything'], ['VISIT', 'Visits'], ['EXIT_PASS', 'Exit passes'], ['ROAD_TEST', 'Road tests'], ['VEHICLE_EXIT', 'Vehicle exits']] as const;
const TYPE_LABEL: Record<string, string> = { VISIT: 'Visit', EXIT_PASS: 'Exit pass', ROAD_TEST: 'Road test', VEHICLE_EXIT: 'Vehicle exit' };

/** The Security register — every visit, exit pass and vehicle exit. */
export default async function SecurityRegisterPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const { q, type } = await searchParams;
  const t = TYPES.some(([k]) => k === type) ? type : '';
  const rows = await searchSecurityRecords(q, t || undefined);
  const statusLabel = (r: (typeof rows)[number]) => (r.type === 'VISIT' ? VISIT_STATUS_LABEL[r.status] : r.type === 'EXIT_PASS' ? EXIT_PASS_STATUS_LABEL[r.status] : r.type === 'ROAD_TEST' ? ROAD_TEST_STATUS_LABEL[r.status] : 'Left');
  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Security register</h1>
      <p className="mb-4 mt-1 text-sm text-[var(--ejo-text-muted)]">Every visit (VIS / VP), exit pass (EP), road test (RT) and vehicle exit (VX) — search by any number, name or plate.</p>
      <SecurityNav active="/security/register" />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q ?? ''} placeholder="Search VIS, VP, EP, RT or VX number, name, company, plate…" className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
        <select name="type" defaultValue={t} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]">
          {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm text-[var(--ejo-text)]">Search</button>
      </form>
      <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">{pluralize(rows.length, 'record')}</p>
      <SecurityTable headers={['Type', 'Number', 'Who / what', 'Details', 'When', 'Status', '']} widths={['10%', '16%', '18%', '26%', '12%', '11%', '7%']} empty={rows.length ? null : q ? 'Nothing matches.' : 'No records yet.'}>
        {rows.map((r) => (
          <tr key={`${r.type}-${r.id}`}>
            <td className="text-xs font-medium">{TYPE_LABEL[r.type]}</td>
            <td className="text-xs font-medium">{r.number}</td>
            <td>{r.title}</td>
            <td className="text-xs text-[var(--ejo-text-muted)]">{r.detail}</td>
            <td className="text-xs">{r.at.getTime() > 0 ? formatDateTimeCompact(r.at) : '—'}</td>
            <td><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[r.status] ?? 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]'}`}>{statusLabel(r)}</span></td>
            <td><LoadingLink href={r.href} className="text-xs text-[var(--ejo-primary)] hover:underline">Open</LoadingLink></td>
          </tr>
        ))}
      </SecurityTable>
    </div>
  );
}
