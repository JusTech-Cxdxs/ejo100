'use client';

import { useState } from 'react';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';

type Row = { key: number; kind: 'EMPLOYEE' | 'OTHER' };
const CLOSE_HOUR = 17; // work ends 5 pm

/**
 * Request an exit pass — nothing pre-filled; each answer shows only the
 * next thing needed. Registered staff are picked by name (their ID,
 * designation and department come from their profile); anyone not on the
 * staff list is just a name.
 */
export function ExitPassForm({ me, action, search, loadDefaultOptions }: { me: { id: string; name: string }; action: (f: FormData) => Promise<void>; search: (q: string) => Promise<SearchableOption[]>; loadDefaultOptions: () => Promise<SearchableOption[]> }) {
  const [who, setWho] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [next, setNext] = useState(1);
  const [leaveWhen, setLeaveWhen] = useState('');
  const [leaveTime, setLeaveTime] = useState('');
  const [returning, setReturning] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  const add = (kind: Row['kind']) => { setRows((r) => [...r, { key: next, kind }]); setNext((n) => n + 1); };
  const needOthers = who === 'WITH_OTHERS' || who === 'OTHERS';

  // Past closing time? Worked out from the planned leaving time (or now).
  let lateNote: string | null = null;
  const total = Number(hours || 0) * 60 + Number(minutes || 0);
  if (returning === 'yes' && total > 0) {
    const start = new Date();
    if (leaveWhen === 'LATER' && leaveTime) { const [h, m] = leaveTime.split(':').map(Number); start.setHours(h!, m!, 0, 0); }
    const back = new Date(start.getTime() + total * 60000);
    if (back.getHours() > CLOSE_HOUR || (back.getHours() === CLOSE_HOUR && back.getMinutes() > 0) || back.getDate() !== start.getDate()) {
      lateNote = 'That runs past 5 pm closing — if you will not be back before work ends, choose "No return".';
    }
  }

  return (
    <form action={action} className="space-y-5">
      <FormPendingOverlay />
      <input type="hidden" name="me" value={me.id} />
      <div>
        <label className={label}>Who is going out?</label>
        <select name="who" required value={who} onChange={(e) => setWho(e.target.value)} className={input}>
          <option value="" disabled>Choose…</option>
          <option value="ME">Just me ({me.name})</option>
          <option value="WITH_OTHERS">Me and others</option>
          <option value="OTHERS">Others — not me</option>
        </select>
      </div>
      {needOthers ? (
        <div className="space-y-2">
          <p className={label}>{who === 'OTHERS' ? 'Who is going out' : 'Who is going with you'}</p>
          {rows.map((row, i) => (
            <div key={row.key} className="flex items-start gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
              <span className="mt-2.5 w-5 shrink-0 text-xs text-[var(--ejo-text-muted)]">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                {row.kind === 'EMPLOYEE' ? (
                  <SearchableSelect name="employeeIds" required search={search} loadDefaultOptions={loadDefaultOptions} defaultOptionsLabel="Staff" placeholder="Search staff by name or ID…" emptyMessage="No active staff match." minQueryLength={1} />
                ) : (
                  <input name="otherName" required placeholder="Full name (not on the staff list)" className={input} />
                )}
              </div>
              <button type="button" onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))} className="mt-2.5 shrink-0 text-xs font-medium text-[var(--ejo-error)]">Remove</button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => add('EMPLOYEE')} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-xs font-medium text-[var(--ejo-text)]">+ Add a staff member</button>
            <button type="button" onClick={() => add('OTHER')} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-xs font-medium text-[var(--ejo-text)]">+ Add someone not on staff</button>
          </div>
        </div>
      ) : null}
      {who && (!needOthers || rows.length > 0) ? (
        <>
          <div><label className={label}>Reason for going out</label><textarea name="reason" required rows={3} className={input} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>When are you leaving?</label>
              <select name="leaveWhen" required value={leaveWhen} onChange={(e) => setLeaveWhen(e.target.value)} className={input}>
                <option value="" disabled>Choose…</option>
                <option value="NOW">As soon as it is approved</option>
                <option value="LATER">At a set time today</option>
              </select>
            </div>
            {leaveWhen === 'LATER' ? <div><label className={label}>Leaving at</label><input name="leaveTime" type="time" required value={leaveTime} onChange={(e) => setLeaveTime(e.target.value)} className={input} /></div> : null}
          </div>
          <div>
            <label className={label}>Coming back today?</label>
            <select name="returning" required value={returning} onChange={(e) => setReturning(e.target.value)} className={input}>
              <option value="" disabled>Choose…</option>
              <option value="yes">Return — coming back</option>
              <option value="no">No return</option>
            </select>
          </div>
          {returning === 'yes' ? (
            <div>
              <label className={label}>How long will {who === 'ME' ? 'you' : 'they'} be out?</label>
              <div className="grid grid-cols-2 gap-3">
                <select name="outHours" required value={hours} onChange={(e) => setHours(e.target.value)} className={input}>
                  <option value="" disabled>Hours…</option>
                  {Array.from({ length: 10 }, (_, h) => <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'}</option>)}
                </select>
                <select name="outMinutes" required value={minutes} onChange={(e) => setMinutes(e.target.value)} className={input}>
                  <option value="" disabled>Minutes…</option>
                  {[0, 15, 30, 45].map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
              {lateNote ? <p className="mt-2 text-xs text-[var(--ejo-warning)]">{lateNote}</p> : null}
            </div>
          ) : null}
          {returning ? <SubmitButton label="Submit for approval" pendingLabel="Submitting…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-3 text-sm font-medium text-white hover:opacity-90 sm:w-auto" /> : null}
        </>
      ) : null}
    </form>
  );
}
