'use client';

import { useState } from 'react';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];
const dLabel = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`);

export type AppointmentDefaults = {
  appointmentId: string;
  ownerId: string;
  title: string;
  agenda: string | null;
  date: string;
  time: string;
  duration: number;
  roomId: string | null;
  location: string | null;
  participants: { id: string; fullName: string }[];
  visitors: { names: string[]; organisation: string | null; phone: string | null } | null;
};

/**
 * Book (or change) an appointment — step by step, nothing pre-filled when
 * new. Visitors from outside become a Security booking automatically.
 */
export function AppointmentForm({
  owners,
  rooms,
  action,
  search,
  loadDefaultOptions,
  defaults,
}: {
  owners: { id: string; fullName: string; mine: boolean }[];
  rooms: { id: string; name: string; capacity: number | null; location: string | null }[];
  action: (f: FormData) => Promise<void>;
  search: (q: string) => Promise<SearchableOption[]>;
  loadDefaultOptions: () => Promise<SearchableOption[]>;
  defaults?: AppointmentDefaults;
}) {
  const [where, setWhere] = useState(defaults ? (defaults.roomId ? 'ROOM' : 'OTHER') : '');
  const [hasVisitors, setHasVisitors] = useState(defaults ? (defaults.visitors ? 'yes' : 'no') : '');
  const [count, setCount] = useState(defaults?.visitors?.names.length ?? 1);
  const [people, setPeople] = useState<{ key: number; id?: string; label?: string }[]>(defaults?.participants.map((p, i) => ({ key: i, id: p.id, label: p.fullName })) ?? []);
  const [next, setNext] = useState(1000);
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  const n = Math.min(30, Math.max(1, count || 1));
  return (
    <form action={action} className="space-y-5">
      <FormPendingOverlay />
      {defaults ? <input type="hidden" name="appointmentId" value={defaults.appointmentId} /> : null}
      {owners.length === 1 && !defaults ? (
        <>
          <input type="hidden" name="ownerId" value={owners[0]!.id} />
          <p className="text-sm text-[var(--ejo-text)]">Calendar: <span className="font-medium">{owners[0]!.fullName}</span></p>
        </>
      ) : (
        <div>
          <label className={label}>Whose calendar</label>
          <select name="ownerId" required defaultValue={defaults?.ownerId ?? ''} className={input}>
            <option value="" disabled>Choose…</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.fullName}{o.mine ? ' (mine)' : ''}</option>)}
          </select>
        </div>
      )}
      <div><label className={label}>Title</label><input name="title" required defaultValue={defaults?.title ?? ''} placeholder="e.g. Supplier meeting — ABC Motors" className={input} /></div>
      <div><label className={label}>Agenda (optional)</label><textarea name="agenda" rows={2} defaultValue={defaults?.agenda ?? ''} className={input} /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className={label}>Date</label><input name="date" type="date" required defaultValue={defaults?.date ?? ''} className={input} /></div>
        <div><label className={label}>Start time</label><input name="time" type="time" required defaultValue={defaults?.time ?? ''} className={input} /></div>
        <div>
          <label className={label}>Duration</label>
          <select name="duration" required defaultValue={defaults ? String(defaults.duration) : ''} className={input}>
            <option value="" disabled>Choose…</option>
            {(defaults && !DURATIONS.includes(defaults.duration) ? [...DURATIONS, defaults.duration].sort((a, b) => a - b) : DURATIONS).map((m) => <option key={m} value={m}>{dLabel(m)}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={label}>Where</label>
        <select name="where" required value={where} onChange={(e) => setWhere(e.target.value)} className={input}>
          <option value="" disabled>Choose…</option>
          <option value="ROOM" disabled={rooms.length === 0}>A meeting room{rooms.length === 0 ? ' (none set up yet)' : ''}</option>
          <option value="OTHER">Somewhere else</option>
        </select>
      </div>
      {where === 'ROOM' ? (
        <div>
          <label className={label}>Meeting room</label>
          <select name="roomId" required defaultValue={defaults?.roomId ?? ''} className={input}>
            <option value="" disabled>Choose…</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}{r.capacity ? ` — seats ${r.capacity}` : ''}{r.location ? ` · ${r.location}` : ''}</option>)}
          </select>
        </div>
      ) : where === 'OTHER' ? (
        <div><label className={label}>Location</label><input name="location" required defaultValue={defaults?.location ?? ''} placeholder="e.g. MD's office, site visit at Apapa, video call" className={input} /></div>
      ) : null}
      <div className="space-y-2">
        <p className={label}>Staff taking part (optional)</p>
        {people.map((p, i) => (
          <div key={p.key} className="flex items-start gap-2">
            <span className="mt-2.5 w-5 shrink-0 text-xs text-[var(--ejo-text-muted)]">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              <SearchableSelect name="participantIds" required search={search} loadDefaultOptions={loadDefaultOptions} defaultOptionsLabel="Staff" placeholder="Search staff by name…" emptyMessage="No active staff match." minQueryLength={1} defaultValue={p.id} defaultLabel={p.label} />
            </div>
            <button type="button" onClick={() => setPeople((x) => x.filter((y) => y.key !== p.key))} className="mt-2.5 shrink-0 text-xs font-medium text-[var(--ejo-error)]">Remove</button>
          </div>
        ))}
        <button type="button" onClick={() => { setPeople((x) => [...x, { key: next }]); setNext((k) => k + 1); }} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-xs font-medium text-[var(--ejo-text)]">+ Add a staff member</button>
      </div>
      <div>
        <label className={label}>Any visitors from outside?</label>
        <select name="hasVisitors" required value={hasVisitors} onChange={(e) => setHasVisitors(e.target.value)} className={input}>
          <option value="" disabled>Choose…</option>
          <option value="no">No — staff only</option>
          <option value="yes">Yes — Security will expect them</option>
        </select>
      </div>
      {hasVisitors === 'yes' ? (
        <div className="space-y-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-4">
          <div><label className={label}>How many visitors?</label><input type="number" min={1} max={30} required value={count} onChange={(e) => setCount(Number(e.target.value))} className={`${input} sm:w-32`} /></div>
          <div className="space-y-2">
            <label className={label}>{n === 1 ? "Visitor's full name" : `Names — ${n} visitors, one per box (the lead first)`}</label>
            {Array.from({ length: n }, (_, i) => (
              <input key={i} name="visitorName" required defaultValue={defaults?.visitors?.names[i] ?? ''} placeholder={i === 0 ? (n === 1 ? 'e.g. John Smith' : '1. Lead') : `${i + 1}. Full name`} className={input} />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={label}>Organisation (if any)</label><input name="visitorOrganisation" defaultValue={defaults?.visitors?.organisation ?? ''} placeholder="e.g. ABC Motors Ltd" className={input} /></div>
            <div><label className={label}>{n === 1 ? 'Phone' : "Lead's phone"}</label><input name="visitorPhone" type="tel" inputMode="tel" defaultValue={defaults?.visitors?.phone ?? ''} placeholder="e.g. 0803 123 4567" className={input} /></div>
          </div>
        </div>
      ) : null}
      <SubmitButton label={defaults ? 'Save changes' : 'Book appointment'} pendingLabel="Saving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-3 text-sm font-medium text-white hover:opacity-90 sm:w-auto" />
    </form>
  );
}
