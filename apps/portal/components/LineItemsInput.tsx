'use client';

import { useRef, useState } from 'react';

type Row = { key: string; value: string };

/**
 * One item per line, with "+ Add" and ✕ — the same proven pattern as the
 * Job Card / Vehicle Service request lists. Every row is its own
 * <input name={name}>, read on the server with formData.getAll(name).
 * Reusable anywhere a clean list is clearer than a paragraph (what a
 * warranty covers, what it excludes, its conditions…).
 */
export function LineItemsInput({
  name,
  initialItems = [],
  placeholder,
  addLabel = '+ Add another',
  required = false,
}: {
  name: string;
  initialItems?: string[];
  placeholder?: string;
  addLabel?: string;
  required?: boolean;
}) {
  const nextId = useRef(initialItems.length + 1);
  const [rows, setRows] = useState<Row[]>(
    initialItems.length > 0 ? initialItems.map((value, i) => ({ key: `r${i}`, value })) : [{ key: 'r0', value: '' }],
  );
  const filled = rows.filter((r) => r.value.trim()).length;

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={row.key} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-xs font-medium text-[var(--ejo-text-muted)]">{i + 1}.</span>
          <input
            name={name}
            value={row.value}
            required={required && i === 0}
            onChange={(e) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, value: e.target.value } : r)))}
            placeholder={placeholder}
            className="min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
          {rows.length > 1 || row.value ? (
            <button
              type="button"
              onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== row.key) : prev.map((r) => ({ ...r, value: '' }))))}
              aria-label={`Remove item ${i + 1}`}
              className="shrink-0 rounded-[var(--ejo-radius-md)] px-2 py-1 text-sm text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-error)]"
            >
              &times;
            </button>
          ) : null}
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setRows((prev) => [...prev, { key: `r${nextId.current++}`, value: '' }])} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">
          {addLabel}
        </button>
        <span className="text-[11px] text-[var(--ejo-text-muted)]">
          {filled} {filled === 1 ? 'item' : 'items'}
        </span>
      </div>
    </div>
  );
}
