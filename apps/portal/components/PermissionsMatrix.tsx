'use client';

import { useMemo, useState } from 'react';

export type MatrixRow = { key: string; module: string; label: string; cells: (string | null)[] };
const SCOPE_LABEL: Record<string, string> = { ALL: 'All branches', BRANCH: 'Their branch', DEPARTMENT: 'Their department', ASSIGNED: 'Jobs assigned to them', OWN: 'Their own' };
const SCOPE_TONE: Record<string, string> = {
  ALL: 'bg-[var(--ejo-primary)]/15 text-[var(--ejo-primary)]', BRANCH: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  DEPARTMENT: 'bg-purple-500/15 text-purple-600', ASSIGNED: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]', OWN: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
};
const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]';

function Mark({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded bg-[var(--ejo-warning)]/30 px-0.5 text-[var(--ejo-text)]">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}
const Scope = ({ s }: { s: string }) => <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${SCOPE_TONE[s]}`}>{SCOPE_LABEL[s]}</span>;

/**
 * Who can do what — no horizontal scrolling anywhere.
 *  • By role: pick a role (list stays put) → everything it can do, by area, with reach.
 *  • By permission: each permission with the roles that hold it (wrapping chips).
 * The search / view bar stays fixed while the content scrolls.
 */
export function PermissionsMatrix({ roles, rows }: { roles: string[]; rows: MatrixRow[] }) {
  const [view, setView] = useState<'role' | 'permission'>('role');
  const [raw, setRaw] = useState('');
  const [picked, setPicked] = useState(0);
  const q = raw.trim().toLowerCase();
  const counts = useMemo(() => roles.map((_, i) => rows.filter((r) => r.cells[i]).length), [roles, rows]);
  const roleList = useMemo(() => roles.map((name, i) => ({ name, i })).filter((r) => !q || r.name.toLowerCase().includes(q) || rows.some((x) => x.cells[r.i] && (x.label.toLowerCase().includes(q) || x.module.toLowerCase().includes(q)))), [q, roles, rows]);
  const current = roleList.some((r) => r.i === picked) ? picked : roleList[0]?.i ?? 0;
  const roleMatchesName = !!q && roles[current]!.toLowerCase().includes(q);
  const lineMatch = (r: MatrixRow) => !q || roleMatchesName || r.label.toLowerCase().includes(q) || r.module.toLowerCase().includes(q);
  const has = rows.filter((r) => r.cells[current] && lineMatch(r));
  const hasNot = rows.filter((r) => !r.cells[current] && lineMatch(r));
  const permRows = rows.filter((r) => !q || r.label.toLowerCase().includes(q) || r.module.toLowerCase().includes(q) || roles.some((n, i) => r.cells[i] && n.toLowerCase().includes(q)));
  const byModule = <T extends MatrixRow>(xs: T[]) => [...new Set(xs.map((x) => x.module))].map((m) => [m, xs.filter((x) => x.module === m)] as const);

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)]/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <input type="search" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Search a role, permission or area — e.g. “receptionist”, “payment”, “Security”…" aria-label="Search roles and permissions" className="min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2 text-sm text-[var(--ejo-text)] sm:max-w-xl" />
          <div role="tablist" className="flex rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-0.5 text-xs">
            {(['role', 'permission'] as const).map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded px-3 py-1.5 font-medium ${view === v ? 'bg-[var(--ejo-primary)] text-white' : 'text-[var(--ejo-text)]'}`}>{v === 'role' ? 'By role' : 'By permission'}</button>
            ))}
          </div>
        </div>
      </div>

      {view === 'role' ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label="Roles" className={`${card} self-start p-2 lg:sticky lg:top-20`}>
            {roleList.length === 0 ? <p className="p-2 text-xs text-[var(--ejo-text-muted)]">No role matches.</p> : null}
            {roleList.map((r) => (
              <button key={r.name} type="button" onClick={() => setPicked(r.i)} className={`flex w-full items-center justify-between rounded-[var(--ejo-radius-md)] px-3 py-2 text-left text-sm ${current === r.i ? 'bg-[var(--ejo-primary)]/10 font-semibold text-[var(--ejo-primary)]' : 'text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]'}`}>
                <span className="min-w-0 truncate"><Mark text={r.name} q={q} /></span>
                <span className="ml-2 shrink-0 text-[11px] text-[var(--ejo-text-muted)]">{counts[r.i]}</span>
              </button>
            ))}
          </nav>
          <section className="min-w-0 space-y-4">
            <div className={`${card} p-4`}>
              <h2 className="text-base font-semibold text-[var(--ejo-text)]">{roles[current]}</h2>
              <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">Can do {counts[current]} of {rows.length} things{q ? ` — showing those matching “${raw.trim()}”` : ''}. Every employee can also request their own exit pass.</p>
              {has.length === 0 ? <p className="mt-3 text-sm text-[var(--ejo-text-muted)]">Nothing here matches.</p> : null}
              <div className="mt-3 space-y-4">
                {byModule(has).map(([m, xs]) => (
                  <div key={m}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]"><Mark text={m} q={q} /></p>
                    <ul className="mt-1 divide-y divide-[var(--ejo-border)]">
                      {xs.map((r) => <li key={r.key} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm text-[var(--ejo-text)]"><span className="min-w-0"><Mark text={r.label} q={q} /></span><Scope s={r.cells[current]!} /></li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            {hasNot.length ? (
              <details className={`${card} p-4`}>
                <summary className="cursor-pointer text-sm font-medium text-[var(--ejo-text)]">Not included ({hasNot.length})</summary>
                <ul className="mt-2 space-y-1 text-xs text-[var(--ejo-text-muted)]">{hasNot.map((r) => <li key={r.key}>{r.module} — {r.label}</li>)}</ul>
              </details>
            ) : null}
          </section>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {permRows.length === 0 ? <p className={`${card} p-6 text-center text-sm text-[var(--ejo-text-muted)]`}>Nothing matches “{raw}”.</p> : null}
          {byModule(permRows).map(([m, xs]) => (
            <section key={m} className={`${card} p-4`}>
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]"><Mark text={m} q={q} /></h2>
              <ul className="mt-2 divide-y divide-[var(--ejo-border)]">
                {xs.map((r) => (
                  <li key={r.key} className="py-2">
                    <p className="text-sm text-[var(--ejo-text)]"><Mark text={r.label} q={q} /></p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {roles.map((n, i) => (r.cells[i] ? <span key={n} className="inline-flex items-center gap-1 rounded-full border border-[var(--ejo-border)] px-2 py-0.5 text-[11px] text-[var(--ejo-text)]"><Mark text={n} q={q} /> <Scope s={r.cells[i]!} /></span> : null))}
                      {r.cells.every((c) => !c) ? <span className="text-[11px] text-[var(--ejo-text-muted)]">Given through assigned work or added on the Roles page</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
