'use client';

import { useState } from 'react';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { VisitArrivalFields } from '@/components/VisitArrivalFields';

const STAY = [30, 60, 90, 120, 180, 240, 300, 360, 480];
const stayLabel = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ''}`);
const PURPOSES = ['Business meeting', 'Delivery', 'Job interview', 'Collect a vehicle', 'Enquiry', 'Service / repair', 'Official visit', 'Personal visit'];

export type BookingDefaults = {
  visitId: string;
  visitorName: string;
  partySize: number;
  memberNames: string[];
  company: string | null;
  phone: string | null;
  purpose: string;
  hostUserId: string;
  hostLabel: string;
  expectedAt: string;
  expectedDurationMinutes: number;
  notes: string | null;
};

/**
 * Register a visitor — step by step, nothing pre-filled, each answer
 * revealing only what is needed next. At the gate: complete now, with ID and
 * vehicle, time taken automatically. Booking: people, purpose, host and time
 * only — completed when the visitor arrives.
 */
export function VisitorRegisterForm({
  canGate,
  isFrontDesk,
  meId,
  action,
  search,
  loadDefaultOptions,
  booking,
}: {
  canGate: boolean;
  isFrontDesk: boolean;
  meId: string;
  action: (f: FormData) => Promise<void>;
  search: (q: string) => Promise<SearchableOption[]>;
  loadDefaultOptions: () => Promise<SearchableOption[]>;
  booking?: BookingDefaults;
}) {
  const editing = Boolean(booking);
  const [mode, setMode] = useState(editing ? 'EXPECTED' : canGate ? '' : 'EXPECTED');
  const [party, setParty] = useState(booking ? (booking.partySize > 1 ? 'GROUP' : 'ONE') : '');
  const [size, setSize] = useState(booking?.partySize ?? 2);
  const [affiliation, setAffiliation] = useState(booking ? (booking.company ? 'ORGANISATION' : 'INDIVIDUAL') : '');
  const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
  const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';
  const group = party === 'GROUP';
  const arrived = mode === 'ARRIVED';
  const ready = mode && party && affiliation;
  const count = group ? Math.min(50, Math.max(2, size || 2)) : 1;
  return (
    <form action={action} className="space-y-4">
      <FormPendingOverlay />
      {booking ? <input type="hidden" name="visitId" value={booking.visitId} /> : null}
      {canGate && !editing ? (
        <div>
          <label className={label}>Type</label>
          <select name="mode" required value={mode} onChange={(e) => setMode(e.target.value)} className={input}>
            <option value="" disabled>Choose…</option>
            <option value="ARRIVED">At the gate now</option>
            <option value="EXPECTED">Book a visit for later</option>
          </select>
        </div>
      ) : (
        <input type="hidden" name="mode" value="EXPECTED" />
      )}
      {mode ? (
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
      ) : null}
      {ready ? (
        <>
          {group ? (
            <div>
              <label className={label}>Number of people in the group</label>
              <input name="partySize" type="number" min={2} max={50} required value={size} onChange={(e) => setSize(Number(e.target.value))} className={`${input} sm:w-40`} />
            </div>
          ) : null}
          {affiliation === 'ORGANISATION' ? (
            <div><label className={label}>Organisation name</label><input name="company" required defaultValue={booking?.company ?? ''} placeholder="e.g. ABC Motors Ltd" className={input} /></div>
          ) : null}
          <div className="space-y-2">
            <label className={label}>{group ? `Names — ${count} people, one per box (the lead first)` : "Visitor's full name"}</label>
            <input name="visitorName" required defaultValue={booking?.visitorName ?? ''} placeholder={group ? '1. Lead — the person whose ID is taken' : 'e.g. Adebayo Johnson'} className={input} />
            {group
              ? Array.from({ length: count - 1 }, (_, i) => (
                  <input key={i} name="memberName" required defaultValue={booking?.memberNames[i] ?? ''} placeholder={`${i + 2}. Full name`} className={input} />
                ))
              : null}
          </div>
          <div><label className={label}>{group ? "Lead's phone number" : 'Phone number'}</label><input name="phone" type="tel" inputMode="tel" defaultValue={booking?.phone ?? ''} placeholder="e.g. 0803 123 4567" className={input} /></div>
          {arrived ? <VisitArrivalFields fromOrganisation={affiliation === 'ORGANISATION'} group={group} /> : null}
          <div>
            <label className={label}>Purpose of the visit</label>
            <input name="purpose" required list="visit-purposes" defaultValue={booking?.purpose ?? ''} placeholder="Tap to choose or type" className={input} />
            <datalist id="visit-purposes">{PURPOSES.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          {isFrontDesk ? (
            <div>
              <label className={label}>Visiting (staff member)</label>
              <SearchableSelect name="hostUserId" required search={search} loadDefaultOptions={loadDefaultOptions} defaultOptionsLabel="Staff" placeholder="Search staff by name or ID…" emptyMessage="No active staff match." minQueryLength={1} defaultValue={booking?.hostUserId} defaultLabel={booking?.hostLabel} />
            </div>
          ) : (
            <input type="hidden" name="hostUserId" value={booking?.hostUserId ?? meId} />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {!arrived ? <div><label className={label}>Expected arrival</label><input name="expectedAt" type="datetime-local" required defaultValue={booking?.expectedAt ?? ''} className={input} /></div> : null}
            <div>
              <label className={label}>Expected stay</label>
              <select name="expectedMinutes" required defaultValue={booking?.expectedDurationMinutes ? String(booking.expectedDurationMinutes) : ''} className={input}>
                <option value="" disabled>Choose…</option>
                {STAY.map((m) => <option key={m} value={m}>{stayLabel(m)}</option>)}
              </select>
            </div>
          </div>
          <div><label className={label}>Notes (optional)</label><input name="notes" defaultValue={booking?.notes ?? ''} className={input} /></div>
          <SubmitButton label={editing ? 'Save booking' : arrived ? 'Register and issue pass' : 'Book the visit'} pendingLabel="Saving…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-3 text-sm font-medium text-white hover:opacity-90" />
        </>
      ) : null}
    </form>
  );
}
