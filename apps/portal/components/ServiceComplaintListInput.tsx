'use client';

import { useRef, useState } from 'react';

type ComplaintRow = { key: string; value: string };

/**
 * The same real, proven pattern as Job Card's own ComplaintListInput
 * — each row a real, separately-submitted <input name="customerComplaints">,
 * read server-side via formData.getAll('customerComplaints'), no
 * hidden JSON-encoding needed. Deliberately its own component rather
 * than reused directly: every row here is genuinely optional (Job
 * Card's own version requires its first row; a Vehicle Service
 * visit that's purely the primary periodic service, with nothing
 * else requested, is a real, valid case this module has to support).
 */
export function ServiceComplaintListInput() {
  const [rows, setRows] = useState<ComplaintRow[]>([{ key: 'c0', value: '' }]);
  const nextId = useRef(1);

  function addRow() {
    setRows((prev) => [...prev, { key: `c${nextId.current++}`, value: '' }]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev.map((r) => ({ ...r, value: '' }))));
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
            name="customerComplaints"
            value={row.value}
            onChange={(e) => updateRow(row.key, e.target.value)}
            placeholder={i === 0 ? 'e.g. AC not cooling well' : 'e.g. Brake pedal feels soft'}
            className="flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
          {rows.length > 1 || row.value ? (
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              aria-label={`Remove request ${i + 1}`}
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
        + Add another request
      </button>
      <p className="text-[11px] text-[var(--ejo-text-muted)]">
        Genuinely optional — leave empty if this visit is purely the primary service, with nothing else
        requested.
      </p>
    </div>
  );
}
