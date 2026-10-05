'use client';

import { Fragment, useMemo, useState } from 'react';

type Scope = 'ALL' | 'BRANCH' | 'DEPARTMENT' | 'ASSIGNED' | 'OWN';
export type MatrixRow = { key: string; module: string; label: string; scopes: (Scope | null)[] };

const SCOPE_LABEL: Record<Scope, string> = { ALL: 'Everything', BRANCH: 'Branch', DEPARTMENT: 'Department', ASSIGNED: 'Assigned', OWN: 'Own' };
const SCOPE_TONE: Record<Scope, string> = {
  ALL: 'bg-[var(--ejo-primary)]/15 text-[var(--ejo-primary)]', BRANCH: 'bg-[var(--ejo-info)]/15 text-[var(--ejo-info)]',
  DEPARTMENT: 'bg-purple-500/15 text-purple-600', ASSIGNED: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]', OWN: 'bg-[var(--ejo-text-muted)]/15 text-[var(--ejo-text-muted)]',
};

/**
 * The permission matrix: sticky role header and permission column, instant
 * search across permissions, modules and roles (typing a role name narrows the
 * columns to that role). Data comes from the server catalogue — this only
 * displays it.
 */
export function PermissionsMatrix({ roles, rows }: { roles: string[]; rows: MatrixRow[] }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const roleHits = useMemo(() => roles.map((r, i) => (r.toLowerCase().includes(term) ? i : -1)).filter((i) => i >= 0), [roles, term]);
  const cols = term && roleHits.length > 0 ? roleHits : roles.map((_, i) => i);
  const shown = useMemo(() => {
    if (!term) return rows;                                                   // no search: everything
    if (roleHits.length) return rows.filter((r) => roleHits.some((i) => r.scopes[i])); // a role: what it can do
    return rows.filter((r) => `${r.label} ${r.module}`.toLowerCase().includes(term));  // otherwise: by name / area
  }, [rows, term, roleHits]);
  const modules = [...new Set(shown.map((r) => r.module))];
  return (
    <div className="mt-4">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a permission, an area (e.g. Store) or a role (e.g. Receptionist)…"
        aria-label="Search permissions and roles"
        className="w-full max-w-xl rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
      />
      <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
        {term ? (roleHits.length ? `Showing what ${cols.map((i) => roles[i]).join(', ')} can do — ${shown.length} ${shown.length === 1 ? 'permission' : 'permissions'}.` : `${shown.length} ${shown.length === 1 ? 'permission matches' : 'permissions match'}.`) : `${rows.length} permissions · ${roles.length} roles.`}
      </p>
      <div className="mt-2 max-h-[70vh] overflow-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-[16rem] border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-left font-semibold text-[var(--ejo-text)]">Permission</th>
              {cols.map((i) => <th key={roles[i]} className="sticky top-0 z-20 whitespace-nowrap border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-2 text-left font-medium text-[var(--ejo-text-muted)]">{roles[i]}</th>)}
            </tr>
          </thead>
          <tbody>
            {modules.length === 0 ? <tr><td colSpan={cols.length + 1} className="px-3 py-6 text-center text-sm text-[var(--ejo-text-muted)]">Nothing matches “{q.trim()}”.</td></tr> : null}
            {modules.map((m) => (
              <Fragment key={m}>
                <tr><td colSpan={cols.length + 1} className="sticky left-0 border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)]/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{m}</td></tr>
                {shown.filter((r) => r.module === m).map((r) => (
                  <tr key={r.key} className="hover:bg-[var(--ejo-bg)]/60">
                    <td className="sticky left-0 z-10 border-b border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 py-1.5 text-[var(--ejo-text)]">{r.label}</td>
                    {cols.map((i) => {
                      const s = r.scopes[i];
                      return <td key={i} className="border-b border-[var(--ejo-border)] px-2 py-1.5">{s ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SCOPE_TONE[s]}`}>{SCOPE_LABEL[s]}</span> : <span className="text-[var(--ejo-text-muted)]">—</span>}</td>;
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
