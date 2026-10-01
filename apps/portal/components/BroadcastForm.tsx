'use client';

import { useState } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { BROADCAST_CATEGORY, DURATIONS } from '@/lib/notification-rules';

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

type Options = { branches: { id: string; name: string }[]; departments: { id: string; name: string }[]; roles: { slug: string; name: string }[] };

/** Create a broadcast — step by step, nothing pre-filled, with a live preview. */
export function BroadcastForm({ options, action }: { options: Options; action: (f: FormData) => Promise<void> }) {
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('');
  const [when, setWhen] = useState('');
  const meta = category ? BROADCAST_CATEGORY[category] : null;
  const choices = audience === 'BRANCH' ? options.branches.map((b) => ({ v: b.id, l: b.name })) : audience === 'DEPARTMENT' ? options.departments.map((d) => ({ v: d.id, l: d.name })) : audience === 'ROLE' ? options.roles.map((r) => ({ v: r.slug, l: r.name })) : [];
  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <FormPendingOverlay />
        <div>
          <p className={label}>What kind of broadcast?</p>
          <input type="hidden" name="category" value={category} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(BROADCAST_CATEGORY).map(([k, m]) => (
              <button key={k} type="button" onClick={() => setCategory(k)} className={`rounded-[var(--ejo-radius-md)] border p-3 text-left text-sm ${category === k ? 'border-[var(--ejo-primary)] ring-2 ring-[var(--ejo-primary)]/30' : 'border-[var(--ejo-border)]'}`}>
                <span className="text-lg">{m.icon}</span>
                <span className="block font-medium text-[var(--ejo-text)]">{m.label}</span>
              </button>
            ))}
          </div>
        </div>
        {category ? (
          <>
            <div><label className={label}>Title</label><input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={category === 'GREETING' ? 'e.g. Happy Independence Day!' : category === 'MAINTENANCE' ? 'e.g. EJO 100 maintenance on Saturday' : category === 'SECURITY_ALERT' ? 'e.g. Fire drill at 2 pm — assemble at the car park' : 'A short headline'} className={input} /></div>
            <div><label className={label}>Message</label><textarea name="message" required rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className={input} /></div>
            <div>
              <label className={label}>Who is it for?</label>
              <select name="audience" required value={audience} onChange={(e) => setAudience(e.target.value)} className={input}>
                <option value="" disabled>Choose…</option>
                <option value="ALL">Everyone in the organisation</option>
                <option value="BRANCH">Particular branches</option>
                <option value="DEPARTMENT">Particular departments</option>
                <option value="ROLE">Particular roles</option>
              </select>
            </div>
            {choices.length ? (
              <div className="grid max-h-52 gap-1 overflow-y-auto rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3 sm:grid-cols-2">
                {choices.map((c) => <label key={c.v} className="flex items-center gap-2 text-sm text-[var(--ejo-text)]"><input type="checkbox" name="audienceIds" value={c.v} className="h-4 w-4" />{c.l}</label>)}
              </div>
            ) : audience && audience !== 'ALL' ? <p className="text-xs text-[var(--ejo-text-muted)]">None set up yet.</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Starts</label>
                <select name="when" required value={when} onChange={(e) => setWhen(e.target.value)} className={input}>
                  <option value="" disabled>Choose…</option>
                  <option value="NOW">Now</option>
                  <option value="LATER">At a set time</option>
                </select>
              </div>
              {when === 'LATER' ? <div><label className={label}>Start date and time</label><input name="startsAt" type="datetime-local" required className={input} /></div> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Runs for</label>
                <select name="duration" required defaultValue="" className={input}>
                  <option value="" disabled>Choose…</option>
                  {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Email it too?</label>
                <select name="sendEmail" required defaultValue="" className={input}>
                  <option value="" disabled>Choose…</option>
                  <option value="yes">Yes — email everyone it is for</option>
                  <option value="no">No — dashboard and notifications only</option>
                </select>
              </div>
            </div>
            <SubmitButton label="Publish broadcast" pendingLabel="Publishing…" className="w-full rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-3 text-sm font-medium text-white hover:opacity-90 sm:w-auto" />
          </>
        ) : null}
      </div>
      <div>
        <p className={label}>Preview</p>
        {meta ? (
          <div className={`rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] border-l-4 ${meta.bar} bg-[var(--ejo-surface)] p-4`}>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.chip}`}>{meta.icon} {meta.label}</span>
            <h3 className="mt-2 text-base font-semibold text-[var(--ejo-text)]">{title || 'Your title'}</h3>
            <p className="mt-2 whitespace-pre-line text-sm text-[var(--ejo-text)]">{message || 'Your message appears here.'}</p>
          </div>
        ) : <p className="text-sm text-[var(--ejo-text-muted)]">Choose a kind of broadcast to see how it will look.</p>}
      </div>
    </form>
  );
}
