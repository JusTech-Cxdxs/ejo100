'use client';

import { useRef, useState } from 'react';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';

type ComplaintRow = { key: string; value: string };

/**
 * Numbered complaint list for a new Job Card. Each row is its own
 * <input name="complaints">, read with formData.getAll('complaints').
 * Rows use stable keys, not the index, because rows can be removed.
 */
export function ComplaintListInput({ initial }: { initial?: string[] } = {}) {
  const [rows, setRows] = useState<ComplaintRow[]>(() => (initial?.length ? initial.map((value, i) => ({ key: `c${i}`, value })) : [{ key: 'c0', value: '' }]));
  const nextId = useRef(initial?.length || 1);

  function addRow() {
    setRows((prev) => [...prev, { key: `c${nextId.current++}`, value: '' }]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function updateRow(key: string, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, value } : r)));
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={row.key} className="flex min-w-0 items-center gap-2">
          <span className="w-5 shrink-0 text-xs font-medium text-[var(--ejo-text-muted)]">{i + 1}.</span>
          <input
            id={`complaint-${row.key}`}
            name="complaints"
            required={i === 0}
            value={row.value}
            onChange={(e) => updateRow(row.key, e.target.value)}
            placeholder={i === 0 ? 'e.g. Fan not working' : 'e.g. AC not working'}
            className="w-0 min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
          <RefineTextButton targetId={`complaint-${row.key}`} label={`complaint ${i + 1}`} compact />
          {rows.length > 1 ? (
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              aria-label={`Remove complaint ${i + 1}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ejo-radius-md)] text-lg text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-error)]"
            >
              &times;
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="inline-flex min-h-10 items-center text-xs font-medium text-[var(--ejo-primary)] hover:underline"
      >
        + Add another complaint
      </button>
    </div>
  );
}
