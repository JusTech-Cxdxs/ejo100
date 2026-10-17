'use client';

import { useState, type ReactNode } from 'react';

/**
 * A long list of checkboxes (who works a team, who may see something) with a
 * search box on top. Rows that do not match are hidden, never removed, so
 * every ticked box is still sent with the form. "Ticked first" keeps the
 * current choice in view.
 */
export function SearchableChecklist({ items, searchLabel, emptyLabel = 'Nobody matches.', maxHeight = 'max-h-80' }: {
  items: { key: string; text: string; checked: boolean; render: ReactNode }[];
  searchLabel: string;
  emptyLabel?: string;
  maxHeight?: string;
}) {
  const [q, setQ] = useState('');
  const [onlyTicked, setOnlyTicked] = useState(false);
  const needle = q.trim().toLowerCase();
  const sorted = [...items].sort((a, b) => Number(b.checked) - Number(a.checked) || a.text.localeCompare(b.text));
  const visible = (i: { text: string; checked: boolean }) => (!needle || i.text.toLowerCase().includes(needle)) && (!onlyTicked || i.checked);
  const shown = sorted.filter(visible).length;
  return (
    <div className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ejo-border)] p-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchLabel} aria-label={searchLabel} className="min-h-10 min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 text-sm text-[var(--ejo-text)]" />
        <label className="inline-flex min-h-10 items-center gap-1.5 text-xs text-[var(--ejo-text-muted)]"><input type="checkbox" checked={onlyTicked} onChange={(e) => setOnlyTicked(e.target.checked)} className="h-4 w-4 accent-[var(--ejo-primary)]" />Already chosen</label>
      </div>
      <div className={`${maxHeight} space-y-1 overflow-y-auto p-2`}>
        {sorted.map((i) => <div key={i.key} hidden={!visible(i)}>{i.render}</div>)}
        {shown === 0 ? <p className="px-1 py-2 text-sm text-[var(--ejo-text-muted)]">{emptyLabel}</p> : null}
      </div>
    </div>
  );
}
