'use client';

import { useMemo, useState } from 'react';

export type ExplorerRole = { slug: string; label: string; summary: string; does: string[]; grants: { key: string; label: string; module: string; scope: string }[] };
export type ExplorerPermission = { key: string; label: string; module: string; holders: { label: string; scope: string }[] };
export type ExplorerChain = { name: string; steps: string[] };

const SCOPE_LABEL: Record<string, string> = { ALL: 'Everything', BRANCH: 'Their branch', DEPARTMENT: 'Their department', ASSIGNED: 'Jobs assigned to them', OWN: 'Their own' };
const SCOPE_TONE: Record<string, string> = {
  ALL: 'bg-[var(--ejo-primary)]/15 text-[var(--ejo-primary)]', BRANCH: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  DEPARTMENT: 'bg-purple-500/15 text-purple-600', ASSIGNED: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]', OWN: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
};
const card = 'rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]';
const Scope = ({ s }: { s: string }) => <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${SCOPE_TONE[s] ?? ''}`}>{SCOPE_LABEL[s] ?? s}</span>;

/**
 * Permissions, without sideways scrolling: By role (what a role does + every
 * permission it holds), By permission (who holds it, how far), and every
 * approval chain. One search filters all three.
 */
export function PermissionsExplorer({ roles, permissions, chains }: { roles: ExplorerRole[]; permissions: ExplorerPermission[]; chains: ExplorerChain[] }) {
  const [tab, setTab] = useState<'role' | 'permission' | 'chains'>('role');
  const [raw, setRaw] = useState('');
  const [pick, setPick] = useState(roles[0]?.slug ?? '');
  const q = raw.trim().toLowerCase();
  const has = (...t: string[]) => !q || t.some((x) => x.toLowerCase().includes(q));
  const roleList = useMemo(() => roles.filter((r) => has(r.label, r.summary, ...r.does, ...r.grants.map((g) => g.label))), [roles, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = roleList.find((r) => r.slug === pick) ?? roleList[0];
  const permList = useMemo(() => permissions.filter((p) => has(p.label, p.module, ...p.holders.map((h) => h.label))), [permissions, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const chainList = useMemo(() => chains.filter((c) => has(c.name, ...c.steps)), [chains, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = (items: { module: string }[]) => [...new Set(items.map((i) => i.module))];
  const tabBtn = (k: typeof tab, label: string, n: number) => (
    <button type="button" onClick={() => setTab(k)} className={`rounded-full px-3 py-1 text-xs font-medium ${tab === k ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{label} ({n})</button>
  );
  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-3 sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Search roles, permissions or approval steps — e.g. “receptionist”, “payment”, “exit pass”…" aria-label="Search permissions" className="w-full max-w-xl rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
          <div className="flex flex-wrap gap-2">{tabBtn('role', 'By role', roleList.length)}{tabBtn('permission', 'By permission', permList.length)}{tabBtn('chains', 'Approval chains', chainList.length)}</div>
        </div>
      </div>

      {tab === 'role' ? (
        roleList.length === 0 ? <p className="mt-6 text-sm text-[var(--ejo-text-muted)]">No role matches “{raw}”.</p> : (
          <div className="mt-4 grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
            <nav aria-label="Roles" className="flex flex-wrap gap-1.5 md:sticky md:top-20 md:block md:max-h-[calc(100vh-12rem)] md:space-y-1 md:self-start md:overflow-y-auto">
              {roleList.map((r) => (
                <button key={r.slug} type="button" onClick={() => setPick(r.slug)} className={`rounded-[var(--ejo-radius-md)] px-3 py-1.5 text-left text-sm md:block md:w-full ${current?.slug === r.slug ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)] md:border-0'}`}>
                  {r.label}<span className={`ml-1 text-[10px] ${current?.slug === r.slug ? 'text-white/80' : 'text-[var(--ejo-text-muted)]'}`}>{r.grants.length}</span>
                </button>
              ))}
            </nav>
            {current ? (
              <section className="min-w-0 space-y-4">
                <div className={`${card} p-5`}>
                  <h2 className="text-lg font-semibold text-[var(--ejo-text)]">{current.label}</h2>
                  <p className="text-sm text-[var(--ejo-text-muted)]">{current.summary}</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--ejo-text)]">{current.does.map((d) => <li key={d}>{d}</li>)}</ul>
                </div>
                <div className={`${card} p-5`}>
                  <h3 className="mb-2 text-sm font-semibold text-[var(--ejo-text)]">Permissions ({current.grants.length})</h3>
                  {groups(current.grants).map((m) => (
                    <div key={m} className="mb-3 last:mb-0">
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{m}</p>
                      <ul className="divide-y divide-[var(--ejo-border)]">
                        {current.grants.filter((g) => g.module === m).map((g) => <li key={g.key} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm"><span className="min-w-0 text-[var(--ejo-text)]">{g.label}</span><Scope s={g.scope} /></li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )
      ) : null}

      {tab === 'permission' ? (
        <div className="mt-4 space-y-5">
          {permList.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No permission matches “{raw}”.</p> : null}
          {groups(permList).map((m) => (
            <section key={m}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{m}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {permList.filter((p) => p.module === m).map((p) => (
                  <div key={p.key} className={`${card} p-4`}>
                    <p className="text-sm font-medium text-[var(--ejo-text)]">{p.label}</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {p.holders.length ? p.holders.map((h) => <li key={h.label} className="flex items-center gap-1 rounded-full border border-[var(--ejo-border)] px-2 py-0.5 text-[11px] text-[var(--ejo-text)]">{h.label}<Scope s={h.scope} /></li>) : <li className="text-xs text-[var(--ejo-text-muted)]">No role holds this by default.</li>}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {tab === 'chains' ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {chainList.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No approval chain matches “{raw}”.</p> : null}
          {chainList.map((c) => (
            <div key={c.name} className={`${card} p-4`}>
              <p className="text-sm font-semibold text-[var(--ejo-text)]">{c.name}</p>
              <ol className="mt-2 space-y-1">
                {c.steps.map((st, i) => <li key={st} className="flex gap-2 text-sm text-[var(--ejo-text)]"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--ejo-primary)]/15 text-[10px] font-semibold text-[var(--ejo-primary)]">{i + 1}</span>{st}</li>)}
              </ol>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
