'use client';

import { useState } from 'react';

export type FormattedAuditEntry = {
  id: string;
  actionLabel: string;
  userName: string | null;
  detail: string | null;
  dateLabel: string;
};

const COLLAPSED_COUNT = 8;

export function AuditTrail({ entries }: { entries: FormattedAuditEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? entries : entries.slice(0, COLLAPSED_COUNT);
  const hiddenCount = entries.length - visible.length;

  return (
    <div>
      <ol className="mt-3 space-y-3">
        {visible.map((entry) => (
          <li key={entry.id} className="flex items-start gap-3 text-sm">
            <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ejo-primary)]" />
            <div>
              <p className="text-[var(--ejo-text)]">
                <span className="font-medium">{entry.actionLabel}</span>
                {entry.userName ? ` — ${entry.userName}` : ''}
              </p>
              {entry.detail ? <p className="text-xs text-[var(--ejo-text)]">{entry.detail}</p> : null}
              <p className="text-xs text-[var(--ejo-text-muted)]">{entry.dateLabel}</p>
            </div>
          </li>
        ))}
      </ol>
      {entries.length > COLLAPSED_COUNT ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 text-xs font-medium text-[var(--ejo-primary)] hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${entries.length} entries (${hiddenCount} more)`}
        </button>
      ) : null}
    </div>
  );
}
