import type { AssistSessionRow } from '@/lib/actions/assist';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { pluralize } from '@/lib/utils/pluralize';
import { StatusChip } from '@/components/ui';

/** Assisted sessions as a stacked list: readable on a phone, no sideways scrolling. */
export function AssistSessionList({ rows, show = 'both' }: { rows: AssistSessionRow[]; show?: 'both' | 'assistant' | 'colleague' }) {
  return (
    <ul className="divide-y divide-[var(--ejo-border)]">
      {rows.map((r) => (
        <li key={r.id} className="grid gap-x-6 gap-y-1 py-3 text-sm sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="font-medium text-[var(--ejo-text)]">
              {show === 'colleague' ? r.assistant : show === 'assistant' ? `${r.colleague} (${r.colleagueRole})` : <>{r.assistant} <span className="font-normal text-[var(--ejo-text-muted)]">helped</span> {r.colleague} <span className="font-normal text-[var(--ejo-text-muted)]">({r.colleagueRole})</span></>}
            </p>
            {r.reason ? <p className="truncate text-xs text-[var(--ejo-text-muted)]" title={r.reason}>Reason: {r.reason}</p> : null}
          </div>
          <div className="min-w-0 text-xs text-[var(--ejo-text-muted)]">
            <p>{formatDateTimeCompact(r.startedAt)}{r.endedAt ? ` · ${pluralize(r.minutes, 'minute')}` : ''}</p>
            <p>{r.ended ?? 'In progress'}</p>
          </div>
          <div className="flex items-start gap-2 sm:justify-end">
            {r.live ? <StatusChip tone="warning" label="In progress" /> : null}
            <span className="whitespace-nowrap rounded-full bg-[var(--ejo-bg)] px-2 py-0.5 text-xs font-medium text-[var(--ejo-text)] ring-1 ring-[var(--ejo-border)]">{pluralize(r.actions, 'action')} recorded</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
