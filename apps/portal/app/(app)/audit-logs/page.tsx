import { canSeeAuditLogs, getAuditLogPage, listAuditUsers } from '@/lib/actions/audit-logs';
import { searchStaffOptions, loadStaffOptions } from '@/lib/actions/security';
import { SearchableSelect } from '@/components/SearchableSelect';
import { LinkedText } from '@/components/LinkedText';
import { LoadingLink } from '@/components/LoadingLink';
import { pluralize } from '@/lib/utils/pluralize';
import { LiveSearchInput } from '@/components/LiveSearchInput';

const KINDS: [string, string][] = [['all', 'Everything'], ['business', 'Business events'], ['data', 'Data changes'], ['api', 'API requests']];
const AREA_DOT: Record<string, string> = { Workshop: 'bg-[var(--ejo-primary)]', Store: 'bg-[var(--ejo-info)]', Warranty: 'bg-[var(--ejo-warning)]', Security: 'bg-[var(--ejo-error)]', Scheduling: 'bg-purple-500', System: 'bg-[var(--ejo-text-muted)]' };
const timeOf = (d: Date) => new Date(d).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' });
function groupByDay<T extends { at: Date }>(rows: T[]): [string, T[]][] {
  const ymd = (d: Date) => new Date(new Date(d).getTime() + 3600000).toISOString().slice(0, 10);
  const today = ymd(new Date());
  const yesterday = ymd(new Date(Date.now() - 86400000));
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = ymd(r.at);
    const label = k === today ? 'Today' : k === yesterday ? 'Yesterday' : new Date(r.at).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(r);
  }
  return [...groups.entries()];
}
const KIND_CHIP: Record<string, string> = { Business: 'bg-[var(--ejo-primary)]/15 text-[var(--ejo-primary)]', 'Data change': 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]', API: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]' };

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string; userId?: string; from?: string; to?: string; cursor?: string }> }) {
  const sp = await searchParams;
  // Refused on the server — typing the address directly does not get round it.
  if (!(await canSeeAuditLogs())) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Audit Logs</h1>
        <p className="mt-3 max-w-xl text-sm text-[var(--ejo-text-muted)]">The full audit trail is for the Master Admin and Administrators. Each record&apos;s own history is on its page.</p>
      </div>
    );
  }
  const [{ kind, rows, nextCursor, refLinks }, users] = await Promise.all([getAuditLogPage(sp), listAuditUsers()]);
  const whoLabel = users.find((u) => u.id === sp.userId)?.fullName;
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ kind: kind === 'all' ? undefined : kind, q: sp.q, userId: sp.userId, from: sp.from, to: sp.to, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return `/audit-logs${s ? `?${s}` : ''}`;
  };
  const input = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-1.5 text-sm text-[var(--ejo-text)]';
  return (
    <div className="w-full p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Audit Logs</h1>
      <p className="mb-4 mt-1 text-sm text-[var(--ejo-text-muted)]">Everything that happened, newest first — business events in plain words, every data change with its before and after, and every API request. Nothing here can be edited or deleted.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {KINDS.map(([k, l]) => <LoadingLink key={k} href={keep({ kind: k === 'all' ? undefined : k, cursor: undefined })} className={`rounded-full px-3 py-1 text-xs font-medium ${kind === k ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{l}</LoadingLink>)}
      </div>
      <form className="mb-4 flex flex-wrap items-end gap-2">
        {kind !== 'all' ? <input type="hidden" name="kind" value={kind} /> : null}
        <div className="w-full sm:w-64"><label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Who (type a name or employee ID)</label>
          <SearchableSelect name="userId" search={searchStaffOptions} loadDefaultOptions={loadStaffOptions} defaultOptionsLabel="Staff" placeholder="Anyone" emptyMessage="No staff match." minQueryLength={1} defaultValue={sp.userId} defaultLabel={whoLabel} /></div>
        <div><label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">From</label><input type="date" name="from" defaultValue={sp.from ?? ''} className={input} /></div>
        <div><label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">To</label><input type="date" name="to" defaultValue={sp.to ?? ''} className={input} /></div>
        <div className="min-w-0 flex-1"><label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Search</label><LiveSearchInput name="q" defaultValue={sp.q ?? ''} placeholder="Search a number (JC-2026-000013), a name or an action…" className={`${input} w-full`} /></div>
        <button type="submit" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-1.5 text-sm font-medium text-white">Filter</button>
        <LoadingLink href="/audit-logs" className="px-2 py-1.5 text-sm text-[var(--ejo-text-muted)] hover:underline">Clear</LoadingLink>
      </form>
      <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">{pluralize(rows.length, 'entry', 'entries')} on this page{sp.cursor ? ' (older)' : ''}</p>
      {rows.length === 0 ? <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 text-sm text-[var(--ejo-text-muted)]">Nothing matches.</div> : (
        <div className="space-y-5">
          {groupByDay(rows).map(([day, items]) => (
            <section key={day}>
              <h2 className="sticky top-0 z-10 mb-2 bg-[var(--ejo-bg)] py-1 text-xs font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{day}</h2>
              <ul className="divide-y divide-[var(--ejo-border)] overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
                {items.map((r) => (
                  <li key={r.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 px-4 py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                    <span className="pt-0.5 text-xs tabular-nums text-[var(--ejo-text-muted)]">{timeOf(r.at)}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${AREA_DOT[r.area] ?? 'bg-[var(--ejo-text-muted)]'}`} title={r.area} />
                        <LinkedText text={r.title} links={refLinks} className="text-sm font-medium text-[var(--ejo-text)]" />
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${KIND_CHIP[r.kind]}`}>{r.kind}</span>
                      </div>
                      {r.detail ? <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]"><LinkedText text={r.detail} links={refLinks} /></p> : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {r.records.map((x) => <LoadingLink key={x.url + x.label} href={x.url} className="rounded-full border border-[var(--ejo-border)] px-2 py-0.5 text-[var(--ejo-primary)] hover:bg-[var(--ejo-bg)]">{x.label} →</LoadingLink>)}
                        <span className="text-[var(--ejo-text-muted)]">by {r.who} · {r.area}{r.ip ? ` · IP ${r.ip}` : ''}</span>
                      </div>
                      {r.changes.length ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-[var(--ejo-primary)]">What changed ({pluralize(r.changes.length, 'field')})</summary>
                          <div className="mt-2 overflow-x-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
                            <table className="w-full text-xs">
                              <thead className="bg-[var(--ejo-bg)]"><tr className="text-left text-[var(--ejo-text-muted)]"><th className="px-2 py-1">Field</th><th className="px-2">Before</th><th className="px-2">After</th></tr></thead>
                              <tbody>{r.changes.map((c) => <tr key={c.field} className="border-t border-[var(--ejo-border)] align-top"><td className="px-2 py-1 text-[var(--ejo-text)]">{c.field}</td><td className="break-all px-2 text-[var(--ejo-error)]/80 line-through decoration-1">{c.before}</td><td className="break-all px-2 text-[var(--ejo-success)]">{c.after}</td></tr>)}</tbody>
                            </table>
                          </div>
                        </details>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {sp.cursor ? <LoadingLink href={keep({ cursor: undefined })} className="text-[var(--ejo-primary)] hover:underline">← Back to newest</LoadingLink> : null}
        {nextCursor ? <LoadingLink href={keep({ cursor: nextCursor })} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-1.5 font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Older →</LoadingLink> : null}
      </div>
    </div>
  );
}
