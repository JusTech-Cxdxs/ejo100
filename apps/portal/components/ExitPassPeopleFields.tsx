'use client';

import { useState } from 'react';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';

type Row = { key: number; kind: 'EMPLOYEE' | 'OTHER' };

/**
 * Everyone going out on one pass: employees (searchable — ID, designation
 * and department are filled in from their profile) and named non-staff
 * such as an intern. Starts with the requester when "for myself".
 */
export function ExitPassPeopleFields({
  me,
  search,
  loadDefaultOptions,
}: {
  me: { id: string; label: string };
  search: (q: string) => Promise<SearchableOption[]>;
  loadDefaultOptions: () => Promise<SearchableOption[]>;
}) {
  const [includeMe, setIncludeMe] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [next, setNext] = useState(1);
  const add = (kind: Row['kind']) => {
    setRows((r) => [...r, { key: next, kind }]);
    setNext((n) => n + 1);
  };
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-[var(--ejo-text)]">
        <input type="checkbox" className="h-4 w-4 accent-[var(--ejo-success)]" checked={includeMe} onChange={(e) => setIncludeMe(e.target.checked)} />
        I am going out ({me.label})
      </label>
      {includeMe ? <input type="hidden" name="employeeIds" value={me.id} /> : null}
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap items-start gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
          {row.kind === 'EMPLOYEE' ? (
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs text-[var(--ejo-text-muted)]">Employee</p>
              <SearchableSelect name="employeeIds" required search={search} loadDefaultOptions={loadDefaultOptions} defaultOptionsLabel="Staff" placeholder="Search by name or employee ID…" emptyMessage="No active staff match." minQueryLength={1} />
            </div>
          ) : (
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-[var(--ejo-text-muted)]">Name (not on the staff list)</p>
                <input name="otherName" required placeholder="e.g. Chidi Okafor" className={input} />
              </div>
              <div>
                <p className="mb-1 text-xs text-[var(--ejo-text-muted)]">Role</p>
                <input name="otherDesignation" placeholder="e.g. Intern (SIWES)" className={input} />
              </div>
            </div>
          )}
          <button type="button" onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))} className="mt-5 text-xs font-medium text-[var(--ejo-error)] hover:underline">
            Remove
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => add('EMPLOYEE')} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">+ Add employee</button>
        <button type="button" onClick={() => add('OTHER')} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]">+ Add someone not on staff (e.g. intern)</button>
      </div>
    </div>
  );
}
