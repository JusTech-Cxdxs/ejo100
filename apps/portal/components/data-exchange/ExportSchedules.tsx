'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { changeExportSchedule, scheduleExport, type ScheduleRow } from '@/lib/actions/export-schedules';
import { CADENCES, WEEKDAYS } from '@/lib/exports/schedule';

const field = 'mt-1 block w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'block text-xs font-medium text-[var(--ejo-text)]';
const btn = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] disabled:opacity-50';
const HOW_OFTEN = { DAILY: 'Every day', WEEKLY: 'Every week', MONTHLY: 'Every month' } as const;

/** Repeat this export: every day, a day of the week, or a day of the month. */
export function ScheduleExportForm({ exportId }: { exportId: string }) {
  const router = useRouter();
  const [cadence, setCadence] = useState<string>('WEEKLY');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="flex flex-wrap items-end gap-3" data-testid="schedule-export" onSubmit={(e) => {
      e.preventDefault();
      setNote(null);
      start(async () => {
        const r = await scheduleExport(exportId, { cadence, dayOfWeek, dayOfMonth }).catch(() => ({ ok: false as const, error: 'The schedule could not be saved. Try again.' }));
        if (r.ok) { setNote({ ok: true, text: `Scheduled: ${r.when.toLowerCase()}, first on ${r.nextRunOn}. You will be told each time it is ready.` }); router.refresh(); } else setNote({ ok: false, text: r.error });
      });
    }}>
      <label className={label}>How often
        <select value={cadence} onChange={(e) => setCadence(e.target.value)} className={field} aria-label="How often">{CADENCES.map((c) => <option key={c} value={c}>{HOW_OFTEN[c]}</option>)}</select>
      </label>
      {cadence === 'WEEKLY' ? (
        <label className={label}>On
          <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className={field} aria-label="Day of the week">{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select>
        </label>
      ) : null}
      {cadence === 'MONTHLY' ? (
        <label className={label}>On day
          <select value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} className={field} aria-label="Day of the month">{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}</select>
        </label>
      ) : null}
      <button type="submit" disabled={pending} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{pending ? 'Saving…' : 'Repeat this export'}</button>
      {note ? <p role={note.ok ? 'status' : 'alert'} className={`w-full text-xs ${note.ok ? 'text-[var(--ejo-text)]' : 'text-[var(--ejo-error)]'}`}>{note.text}</p> : null}
    </form>
  );
}

/** The person's own schedules, each with pause, resume and end. */
export function ScheduleList({ rows }: { rows: ScheduleRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const change = (id: string, to: 'PAUSED' | 'ACTIVE' | 'ENDED') => start(async () => {
    setError(null);
    const r = await changeExportSchedule(id, to).catch(() => ({ ok: false as const, error: 'Try again.' }));
    if (r.ok) router.refresh(); else setError(r.error);
  });
  return (
    <>
      {error ? <p role="alert" className="px-4 pt-3 text-sm text-[var(--ejo-error)]">{error}</p> : null}
      <ul className="divide-y divide-[var(--ejo-border)]" data-testid="export-schedules">
        {rows.map((s) => (
          <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm" data-testid="export-schedule" data-status={s.status}>
            <span className="min-w-0">
              <span className="font-medium text-[var(--ejo-text)]">{s.list}</span> <span className="text-xs uppercase text-[var(--ejo-text-muted)]">{s.format}</span> · {s.when}
              <span className="block break-words text-xs text-[var(--ejo-text-muted)]">{s.summary}</span>
              <span className="block text-xs text-[var(--ejo-text-muted)]">
                {s.status === 'ACTIVE' ? `Next on ${s.nextRunOn}` : s.status === 'PAUSED' ? `Paused${s.pausedReason ? `: ${s.pausedReason}` : ''}` : 'Ended'}
                {s.lastExportId ? <> · made {s.runs} {s.runs === 1 ? 'time' : 'times'} · <Link href={`/data-exchange/exports/${s.lastExportId}`} className="font-medium text-[var(--ejo-primary)] hover:underline">the latest</Link></> : ' · not made yet'}
              </span>
            </span>
            {s.status !== 'ENDED' ? (
              <span className="flex shrink-0 gap-2">
                {s.status === 'ACTIVE' ? <button type="button" className={btn} disabled={pending} onClick={() => change(s.id, 'PAUSED')}>Pause</button> : <button type="button" className={btn} disabled={pending} onClick={() => change(s.id, 'ACTIVE')}>Resume</button>}
                <button type="button" className={btn} disabled={pending} onClick={() => change(s.id, 'ENDED')}>End</button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
