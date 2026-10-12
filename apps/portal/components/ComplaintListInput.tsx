'use client';

import { useRef, useState } from 'react';

type ComplaintRow = { key: string; value: string };

/**
 * Numbered complaint list for a new Job Card. Each row is its own
 * <input name="complaints">, read with formData.getAll('complaints').
 * Rows use stable keys, not the index, because rows can be removed.
 */
export function ComplaintListInput() {
  const [rows, setRows] = useState<ComplaintRow[]>([{ key: 'c0', value: '' }]);
  const nextId = useRef(1);

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
        <div key={row.key} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-xs font-medium text-[var(--ejo-text-muted)]">{i + 1}.</span>
          <input
            name="complaints"
            required={i === 0}
            value={row.value}
            onChange={(e) => updateRow(row.key, e.target.value)}
            placeholder={i === 0 ? 'e.g. Fan not working' : 'e.g. AC not working'}
            className="flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
          {rows.length > 1 ? (
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              aria-label={`Remove complaint ${i + 1}`}
              className="shrink-0 rounded-[var(--ejo-radius-md)] px-2 py-1 text-sm text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-error)]"
            >
              &times;
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="text-xs font-medium text-[var(--ejo-primary)] hover:underline"
      >
        + Add another complaint
      </button>
    </div>
  );
}
