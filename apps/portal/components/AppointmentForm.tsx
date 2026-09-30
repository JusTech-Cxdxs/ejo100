'use client';

import { useState } from 'react';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { timingNote } from '@/lib/nigeria-calendar';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];
const PURPOSES = ['Business meeting', 'Delivery', 'Job interview', 'Collect a vehicle', 'Enquiry', 'Service / repair', 'Official visit', 'Personal visit'];
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
  visitors: { names: string[]; organisation: string | null; phone: string | null; purpose: string } | null;
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
  const [where, setWhere] = useState(defaults ? (defaults.roomId ? 'ROOM' : defaults.location === "Host's office" ? 'OFFICE' : 'OTHER') : '');
  const [hasVisitors, setHasVisitors] = useState(defaults ? (defaults.visitors ? 'yes' : 'no') : '');
  const [party, setParty] = useState(defaults?.visitors ? (defaults.visitors.names.length > 1 ? 'GROUP' : 'ONE') : '');
  const [affiliation, setAffiliation] = useState(defaults?.visitors ? (defaults.visitors.organisation ? 'ORGANISATION' : 'INDIVIDUAL') : '');
  const [count, setCount] = useState(defaults?.visitors?.names.length ?? 2);
  const [date, setDate] = useState(defaults?.date ?? '');
  const [time, setTime] = useState(defaults?.time ?? '');
  const [duration, setDuration] = useState(defaults ? String(defaults.duration) : '');
  const note = date && time && duration ? timingNote(new Date(`${date}T${time}:00+01:00`), new Date(new Date(`${date}T${time}:00+01:00`).getTime() + Number(duration) * 60000)) : null;
  const [people, setPeople] = useState<{ key: number; id?: string; label?: string }[]>(defaults?.participants.map((p, i) => ({ key: i, id: p.id, label: p.fullName })) ?? []);
  const [next, setNext] = useState(1000);
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  const group = party === 'GROUP';
  const n = group ? Math.min(50, Math.max(2, count || 2)) : 1;
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
        <div><label className={label}>Date</label><input name="date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} /></div>
        <div><label className={label}>Start time</label><input name="time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={input} /></div>
        <div>
          <label className={label}>Duration</label>
          <select name="duration" required value={duration} onChange={(e) => setDuration(e.target.value)} className={input}>
            <option value="" disabled>Choose…</option>
            {(defaults && !DURATIONS.includes(defaults.duration) ? [...DURATIONS, defaults.duration].sort((a, b) => a - b) : DURATIONS).map((m) => <option key={m} value={m}>{dLabel(m)}</option>)}
          </select>
        </div>
      </div>
      {note ? <p className="-mt-2 text-xs text-[var(--ejo-warning)]">{note} You can still book it.</p> : null}
      <div>
        <label className={label}>Where</label>
        <select name="where" required value={where} onChange={(e) => setWhere(e.target.value)} className={input}>
          <option value="" disabled>Choose…</option>
          <option value="ROOM" disabled={rooms.length === 0}>A meeting room{rooms.length === 0 ? ' (none set up yet)' : ''}</option>
          <option value="OFFICE">The host&apos;s office</option>
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
        <div className="space-y-4 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-4">
          <p className="text-xs text-[var(--ejo-text-muted)]">Booked with Security for the meeting&apos;s time — they see it under Expected today and are emailed.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>How many people?</label>
              <select name="party" required value={party} onChange={(e) => setParty(e.target.value)} className={input}>
                <option value="" disabled>Choose…</option>
                <option value="ONE">One person</option>
                <option value="GROUP">A group (2 or more)</option>
              </select>
            </div>
            <div>
              <label className={label}>Coming as</label>
              <select name="affiliation" required value={affiliation} onChange={(e) => setAffiliation(e.target.value)} className={input}>
                <option value="" disabled>Choose…</option>
                <option value="INDIVIDUAL">Private individual{group ? 's' : ''}</option>
                <option value="ORGANISATION">From an organisation</option>
              </select>
            </div>
          </div>
          {party && affiliation ? (
            <>
              {group ? <div><label className={label}>Number of people in the group</label><input type="number" min={2} max={50} required value={count} onChange={(e) => setCount(Number(e.target.value))} className={`${input} sm:w-40`} /></div> : null}
              {affiliation === 'ORGANISATION' ? <div><label className={label}>Organisation name</label><input name="company" required defaultValue={defaults?.visitors?.organisation ?? ''} placeholder="e.g. ABC Motors Ltd" className={input} /></div> : null}
              <div className="space-y-2">
                <label className={label}>{group ? `Names — ${n} people, one per box (the lead first)` : "Visitor's full name"}</label>
                <input name="visitorName" required defaultValue={defaults?.visitors?.names[0] ?? ''} placeholder={group ? '1. Lead — the person whose ID is taken' : 'e.g. Adebayo Johnson'} className={input} />
                {group ? Array.from({ length: n - 1 }, (_, i) => <input key={i} name="memberName" required defaultValue={defaults?.visitors?.names[i + 1] ?? ''} placeholder={`${i + 2}. Full name`} className={input} />) : null}
              </div>
              <div><label className={label}>{group ? "Lead's phone number" : 'Phone number'}</label><input name="phone" type="tel" inputMode="tel" defaultValue={defaults?.visitors?.phone ?? ''} placeholder="e.g. 0803 123 4567" className={input} /></div>
              <div>
                <label className={label}>Purpose of the visit</label>
                <input name="purpose" required list="appt-visit-purposes" defaultValue={defaults?.visitors?.purpose ?? ''} placeholder="Tap to choose or type" className={input} />
                <datalist id="appt-visit-purposes">{PURPOSES.map((p) => <option key={p} value={p} />)}</datalist>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <SubmitButton label={defaults ? 'Save changes' : 'Book appointment'} pendingLabel="Saving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-3 text-sm font-medium text-white hover:opacity-90 sm:w-auto" />
    </form>
  );
}
