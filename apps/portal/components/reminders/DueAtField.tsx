'use client';

import { useId, useRef } from 'react';

/** Lagos is UTC+1 all year. */
const LAGOS_MS = 3_600_000;
const pad = (n: number) => String(n).padStart(2, '0');
function lagosValue(d: Date): string {
  const l = new Date(d.getTime() + LAGOS_MS);
  return `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}T${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}`;
}
/** Today's (Lagos) date + days, at hh:mm Lagos. */
function at(daysAhead: number, hh: number, mm = 0): string {
  const today = lagosValue(new Date()).slice(0, 10);
  const base = new Date(`${today}T${pad(hh)}:${pad(mm)}:00+01:00`);
  return lagosValue(new Date(base.getTime() + daysAhead * 86_400_000));
}
function nextMonday(): string {
  const l = new Date(Date.now() + LAGOS_MS);
  const day = l.getUTCDay();
  return at(((8 - day) % 7) || 7, 9);
}

/**
 * The reminder's date and time (Lagos), with quick choices. A plain
 * datetime-local input underneath, so it works with the keyboard and on
 * every phone's own picker.
 */
export function DueAtField({ defaultValue, name = 'dueAt' }: { defaultValue: string; name?: string }) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const set = (v: string) => {
    if (!ref.current) return;
    ref.current.value = v;
    ref.current.focus();
  };
  const chips: [string, () => string][] = [
    ['In 1 hour', () => lagosValue(new Date(Date.now() + 3_600_000))],
    ['This afternoon (3 pm)', () => at(0, 15)],
    ['Tomorrow 9 am', () => at(1, 9)],
    ['Next Monday 9 am', nextMonday],
  ];
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">When (Lagos time)</label>
      <input
        ref={ref}
        id={id}
        name={name}
        type="datetime-local"
        required
        defaultValue={defaultValue}
        className="min-h-11 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]"
      />
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Quick times">
        {chips.map(([label, value]) => (
          <button
            key={label}
            type="button"
            onClick={() => set(value())}
            className="min-h-9 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-3 text-xs font-medium text-[var(--ejo-text-muted)] transition-colors hover:border-[var(--ejo-primary)]/60 hover:text-[var(--ejo-primary)]"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
