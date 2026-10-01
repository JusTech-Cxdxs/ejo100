'use client';

import { useState } from 'react';

const PURPOSES = ['Business meeting', 'Delivery', 'Job interview', 'Collect a vehicle', 'Enquiry', 'Service / repair', 'Official visit', 'Personal visit'];
const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

export type GroupDefaults = { names: string[]; organisation: string | null; phone: string | null; purpose: string };

/**
 * A visitor group — exactly the "Book a visit" questions: how many people →
 * coming as → (group size → one name box each, lead first) → organisation →
 * phone → purpose. The meeting's time is used, so no time is asked.
 */
export function VisitorGroupFields({ defaults }: { defaults?: GroupDefaults }) {
  const [party, setParty] = useState(defaults ? (defaults.names.length > 1 ? 'GROUP' : 'ONE') : '');
  const [affiliation, setAffiliation] = useState(defaults ? (defaults.organisation ? 'ORGANISATION' : 'INDIVIDUAL') : '');
  const [count, setCount] = useState(defaults?.names.length && defaults.names.length > 1 ? defaults.names.length : 2);
  const group = party === 'GROUP';
  const n = group ? Math.min(50, Math.max(2, count || 2)) : 1;
  return (
    <div className="space-y-4">
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
          {affiliation === 'ORGANISATION' ? <div><label className={label}>Organisation name</label><input name="company" required defaultValue={defaults?.organisation ?? ''} placeholder="e.g. ABC Motors Ltd" className={input} /></div> : null}
          <div className="space-y-2">
            <label className={label}>{group ? `Names — ${n} people, one per box (the lead first)` : "Visitor's full name"}</label>
            <input name="visitorName" required defaultValue={defaults?.names[0] ?? ''} placeholder={group ? '1. Lead — the person whose ID is taken' : 'e.g. Adebayo Johnson'} className={input} />
            {group ? Array.from({ length: n - 1 }, (_, i) => <input key={i} name="memberName" required defaultValue={defaults?.names[i + 1] ?? ''} placeholder={`${i + 2}. Full name`} className={input} />) : null}
          </div>
          <div><label className={label}>{group ? "Lead's phone number" : 'Phone number'}</label><input name="phone" type="tel" inputMode="tel" defaultValue={defaults?.phone ?? ''} placeholder="e.g. 0803 123 4567" className={input} /></div>
          <div>
            <label className={label}>Purpose of the visit</label>
            <input name="purpose" required list="group-visit-purposes" defaultValue={defaults?.purpose ?? ''} placeholder="Tap to choose or type" className={input} />
            <datalist id="group-visit-purposes">{PURPOSES.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
        </>
      ) : null}
    </div>
  );
}
