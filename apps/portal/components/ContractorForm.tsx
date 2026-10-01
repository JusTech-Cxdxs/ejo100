'use client';

import { useState } from 'react';
import { SearchableSelect, type SearchableOption } from '@/components/SearchableSelect';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

/** Request a contractor pass — step by step, nothing pre-filled. */
export function ContractorForm({ isFrontDesk, action, search, loadDefaultOptions }: { isFrontDesk: boolean; action: (f: FormData) => Promise<void>; search: (q: string) => Promise<SearchableOption[]>; loadDefaultOptions: () => Promise<SearchableOption[]> }) {
  const [party, setParty] = useState('');
  const [count, setCount] = useState(2);
  const [from, setFrom] = useState('');
  const team = party === 'GROUP';
  const n = team ? Math.min(50, Math.max(2, count || 2)) : 1;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  return (
    <form action={action} className="space-y-4">
      <FormPendingOverlay />
      <div><label className={label}>Contractor company</label><input name="company" required placeholder="e.g. Bright Electricals Ltd" className={input} /></div>
      <div><label className={label}>Work to be done</label><textarea name="work" required rows={2} placeholder="e.g. Rewire workshop bay 2 and install new sockets" className={input} /></div>
      <div><label className={label}>Where on site</label><input name="workArea" required placeholder="e.g. Workshop bay 2" className={input} /></div>
      <div>
        <label className={label}>How many people?</label>
        <select name="party" required value={party} onChange={(e) => setParty(e.target.value)} className={input}>
          <option value="" disabled>Choose…</option>
          <option value="ONE">One person</option>
          <option value="GROUP">A team (2 or more)</option>
        </select>
      </div>
      {party ? (
        <>
          {team ? <div><label className={label}>Number of people in the team</label><input type="number" min={2} max={50} required value={count} onChange={(e) => setCount(Number(e.target.value))} className={`${input} sm:w-40`} /></div> : null}
          <div className="space-y-2">
            <label className={label}>{team ? `Names — ${n} people, one per box (the lead first)` : 'Full name'}</label>
            <input name="leadName" required placeholder={team ? '1. Team lead' : 'e.g. Chinedu Okeke'} className={input} />
            {team ? Array.from({ length: n - 1 }, (_, i) => <input key={i} name="memberName" required placeholder={`${i + 2}. Full name`} className={input} />) : null}
          </div>
          <div><label className={label}>{team ? "Lead's phone number" : 'Phone number'}</label><input name="phone" type="tel" inputMode="tel" placeholder="e.g. 0803 123 4567" className={input} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={label}>First day</label><input name="validFrom" type="date" required min={today} value={from} onChange={(e) => setFrom(e.target.value)} className={input} /></div>
            <div><label className={label}>Last day</label><input name="validUntil" type="date" required min={from || today} className={input} /></div>
          </div>
          {isFrontDesk ? (
            <div>
              <label className={label}>Staff member responsible for the work</label>
              <SearchableSelect name="hostUserId" required search={search} loadDefaultOptions={loadDefaultOptions} defaultOptionsLabel="Staff" placeholder="Search staff by name or ID…" emptyMessage="No active staff match." minQueryLength={1} />
            </div>
          ) : null}
          <SubmitButton label="Submit for the Manager's approval" pendingLabel="Submitting…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-3 text-sm font-medium text-white hover:opacity-90 sm:w-auto" />
        </>
      ) : null}
    </form>
  );
}
