'use client';

import { useRef, useState } from 'react';

type HotlineRow = { key: string; value: string };

/**
 * A real business commonly has more than one hotline — Hotline 1,
 * Hotline 2, and so on, each its own real, separately-submitted
 * `<input name="hotlines">` (the server reads them all via
 * `formData.getAll('hotlines')`), the same proven shape as a Job
 * Card's own Complaints list. Uses a stable generated key per row,
 * not the array index, so removing a row from the middle never
 * confuses which input holds which value or focus.
 */
export function HotlineListInput({ initialValues }: { initialValues: string[] }) {
  const [rows, setRows] = useState<HotlineRow[]>(() => (initialValues.length > 0 ? initialValues.map((v, i) => ({ key: `h${i}`, value: v })) : [{ key: 'h0', value: '' }]));
  const nextId = useRef(rows.length);

  function addRow() {
    setRows((prev) => [...prev, { key: `h${nextId.current++}`, value: '' }]);
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
          <span className="w-16 shrink-0 text-xs font-medium text-[var(--ejo-text-muted)]">Hotline {i + 1}</span>
          <input
            name="hotlines"
            value={row.value}
            onChange={(e) => updateRow(row.key, e.target.value)}
            placeholder="e.g. +234 800 000 0000"
            className="flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
          {rows.length > 1 ? (
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              aria-label={`Remove hotline ${i + 1}`}
              className="shrink-0 rounded-[var(--ejo-radius-md)] px-2 py-1 text-sm text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)] hover:text-[var(--ejo-error)]"
            >
              &times;
            </button>
          ) : null}
        </div>
      ))}
      <button type="button" onClick={addRow} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">
        + Add another hotline
      </button>
    </div>
  );
}
