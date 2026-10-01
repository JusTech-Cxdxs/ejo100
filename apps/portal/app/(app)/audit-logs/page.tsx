import { canSeeAuditLogs, getAuditLogPage, listAuditUsers } from '@/lib/actions/audit-logs';
import { LoadingLink } from '@/components/LoadingLink';
import { formatDateTime } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';

const KINDS: [string, string][] = [['all', 'Everything'], ['business', 'Business events'], ['data', 'Data changes'], ['api', 'API requests']];
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
  const [{ kind, rows, nextCursor }, users] = await Promise.all([getAuditLogPage(sp), listAuditUsers()]);
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
        <div><label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Who</label>
          <select name="userId" defaultValue={sp.userId ?? ''} className={input}><option value="">Anyone</option>{users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}</select></div>
        <div><label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">From</label><input type="date" name="from" defaultValue={sp.from ?? ''} className={input} /></div>
        <div><label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">To</label><input type="date" name="to" defaultValue={sp.to ?? ''} className={input} /></div>
        <div className="min-w-0 flex-1"><label className="mb-1 block text-xs text-[var(--ejo-text-muted)]">Search</label><input name="q" defaultValue={sp.q ?? ''} placeholder="e.g. job_card, Visit, a record id…" className={`${input} w-full`} /></div>
        <button type="submit" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-1.5 text-sm font-medium text-white">Filter</button>
        <LoadingLink href="/audit-logs" className="px-2 py-1.5 text-sm text-[var(--ejo-text-muted)] hover:underline">Clear</LoadingLink>
      </form>
      <p className="mb-2 text-xs text-[var(--ejo-text-muted)]">{pluralize(rows.length, 'entry', 'entries')} on this page{sp.cursor ? ' (older)' : ''}</p>
      <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
        {rows.length === 0 ? <p className="p-6 text-sm text-[var(--ejo-text-muted)]">Nothing matches.</p> : (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {rows.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${KIND_CHIP[r.kind]}`}>{r.kind}</span>
                    {r.url ? <LoadingLink href={r.url} className="text-sm font-medium text-[var(--ejo-text)] hover:underline">{r.title}</LoadingLink> : <span className="text-sm font-medium text-[var(--ejo-text)]">{r.title}</span>}
                    {r.detail ? <span className="block text-xs text-[var(--ejo-text-muted)]">{r.detail}</span> : null}
                  </div>
                  <span className="shrink-0 text-right text-[11px] text-[var(--ejo-text-muted)]">{formatDateTime(r.at)}<span className="block">{r.who} · {r.area}</span></span>
                </div>
                {r.changes.length ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-[var(--ejo-primary)]">What changed ({pluralize(r.changes.length, 'field')})</summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-left text-[var(--ejo-text-muted)]"><th className="py-1 pr-3">Field</th><th className="pr-3">Before</th><th>After</th></tr></thead>
                        <tbody>{r.changes.map((c) => <tr key={c.field} className="border-t border-[var(--ejo-border)] align-top"><td className="py-1 pr-3 text-[var(--ejo-text)]">{c.field}</td><td className="break-all pr-3 text-[var(--ejo-text-muted)]">{c.before}</td><td className="break-all text-[var(--ejo-text)]">{c.after}</td></tr>)}</tbody>
                      </table>
                    </div>
                  </details>
                ) : null}
                {r.record || r.ip ? <p className="mt-1 text-[10px] text-[var(--ejo-text-muted)]">{r.record ? `Record ${r.record}` : ''}{r.record && r.ip ? ' · ' : ''}{r.ip ? `IP ${r.ip}` : ''}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {sp.cursor ? <LoadingLink href={keep({ cursor: undefined })} className="text-[var(--ejo-primary)] hover:underline">← Back to newest</LoadingLink> : null}
        {nextCursor ? <LoadingLink href={keep({ cursor: nextCursor })} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-1.5 font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Older →</LoadingLink> : null}
      </div>
    </div>
  );
}
