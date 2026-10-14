'use client';

import { useRef, useState } from 'react';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';

type ComplaintRow = { key: string; value: string };

/**
 * Like ComplaintListInput (each row is an <input name="customerComplaints">),
 * but every row is optional: a visit can be just the periodic service.
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
            id={`service-complaint-${row.key}`}
            name="customerComplaints"
            value={row.value}
            onChange={(e) => updateRow(row.key, e.target.value)}
            placeholder={i === 0 ? 'e.g. AC not cooling well' : 'e.g. Brake pedal feels soft'}
            className="min-w-0 flex-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
          <RefineTextButton targetId={`service-complaint-${row.key}`} label={`complaint ${i + 1}`} compact />
          {rows.length > 1 || row.value ? (
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              aria-label={`Remove request ${i + 1}`}
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
        + Add another request
      </button>
      <p className="text-[11px] text-[var(--ejo-text-muted)]">
        Optional. Leave empty if the visit is only for the periodic service.
      </p>
    </div>
  );
}
