'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { closeDataRequest, findCustomersForRequest, recordDataRequest, verifyDataRequest } from '@/lib/actions/data-requests';
import { KIND_LABEL, REQUEST_KINDS, VIAS, VIA_LABEL } from '@/lib/privacy/requests';

const field = 'mt-1 block w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'block text-xs font-medium text-[var(--ejo-text)]';
const primary = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50';
const secondary = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)] disabled:opacity-50';
const Alert = ({ text }: { text: string | null }) => (text ? <p role="alert" className="text-sm text-[var(--ejo-error)]">{text}</p> : null);

type Found = Awaited<ReturnType<typeof findCustomersForRequest>>[number];

/** Record a request as received: the customer (searched), what they ask, how and when it came in, and their words. */
export function NewRequestForm({ today, customer: preset }: { today: string; customer: { id: string; name: string } | null }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(preset);
  const [kind, setKind] = useState<string>('ACCESS');
  const [via, setVia] = useState<string>('EMAIL');
  const [on, setOn] = useState(today);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (customer || q.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => { findCustomersForRequest(q).then(setFound).catch(() => setFound([])); }, 250);
    return () => clearTimeout(t);
  }, [q, customer]);
  return (
    <form className="space-y-4" data-testid="new-data-request" onSubmit={(e) => {
      e.preventDefault();
      setError(null);
      if (!customer) { setError('Choose the customer the request is about.'); return; }
      start(async () => {
        const r = await recordDataRequest({ customerId: customer.id, kind, receivedVia: via, receivedOn: on, details }).catch(() => ({ ok: false as const, error: 'The request could not be recorded. Try again.' }));
        if (r.ok) router.push(`/data-requests/${r.id}`); else setError(r.error);
      });
    }}>
      <div>
        <span className={label}>Customer</span>
        {customer ? (
          <p className="mt-1 flex flex-wrap items-center gap-3 text-sm"><span className="font-medium text-[var(--ejo-text)]" data-testid="chosen-customer">{customer.name}</span><button type="button" className="text-xs text-[var(--ejo-primary)] hover:underline" onClick={() => { setCustomer(null); setQ(''); }}>Choose another</button></p>
        ) : (
          <>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} className={field} placeholder="Name, phone, email or SAP number" aria-label="Find the customer" autoComplete="off" />
            {found.length ? (
              <ul className="mt-1 divide-y divide-[var(--ejo-border)] rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
                {found.map((c) => (
                  <li key={c.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--ejo-bg)]" onClick={() => setCustomer({ id: c.id, name: c.name })}>
                    <span className="font-medium text-[var(--ejo-text)]">{c.name}</span>
                    <span className="block break-all text-xs text-[var(--ejo-text-muted)]">{[c.phone, c.email, c.externalId ? `SAP ${c.externalId}` : null].filter(Boolean).join(' · ') || 'No contact details'}</span>
                  </button></li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
      <fieldset>
        <legend className={label}>What they ask for</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {REQUEST_KINDS.map((k) => (
            <label key={k} className={`flex cursor-pointer gap-2 rounded-[var(--ejo-radius-md)] border p-3 text-sm ${kind === k ? 'border-[var(--ejo-primary)]' : 'border-[var(--ejo-border)]'}`}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="mt-0.5" />
              <span><span className="font-medium text-[var(--ejo-text)]">{KIND_LABEL[k].label}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{KIND_LABEL[k].what}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>How it came in
          <select value={via} onChange={(e) => setVia(e.target.value)} className={field}>{VIAS.map((v) => <option key={v} value={v}>{VIA_LABEL[v]}</option>)}</select>
        </label>
        <label className={label}>Received on
          <input type="date" value={on} max={today} onChange={(e) => setOn(e.target.value)} className={field} required />
        </label>
      </div>
      <label className={label}>What they asked, in their words (optional)
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={4} maxLength={2000} className={field} />
      </label>
      <Alert text={error} />
      <button type="submit" className={primary} disabled={pending}>{pending ? 'Recording…' : 'Record the request'}</button>
    </form>
  );
}

/** A colleague confirms who is asking, saying how — never a document's number. */
export function VerifyForm({ id }: { id: string }) {
  const router = useRouter();
  const [how, setHow] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-3" data-testid="verify-request" onSubmit={(e) => {
      e.preventDefault();
      setError(null);
      start(async () => {
        const r = await verifyDataRequest(id, how).catch(() => ({ ok: false as const, error: 'Try again.' }));
        if (r.ok) router.refresh(); else setError(r.error);
      });
    }}>
      <label className={label}>How you confirmed it is them
        <input value={how} onChange={(e) => setHow(e.target.value)} maxLength={300} className={field} placeholder="e.g. Seen in person with photo ID matching the record" required />
      </label>
      <p className="text-xs text-[var(--ejo-text-muted)]">Write how, never the document’s number: EJO keeps no ID numbers.</p>
      <Alert text={error} />
      <button type="submit" className={primary} disabled={pending}>{pending ? 'Confirming…' : 'Confirm who is asking'}</button>
    </form>
  );
}

/** Close the request: answered, refused (with the reason the customer is told) or withdrawn. */
export function CloseForm({ id, canAnswer, answerHint }: { id: string; canAnswer: boolean; answerHint: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<'FULFILLED' | 'REFUSED' | 'WITHDRAWN'>(canAnswer ? 'FULFILLED' : 'REFUSED');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-3" data-testid="close-request" onSubmit={(e) => {
      e.preventDefault();
      setError(null);
      start(async () => {
        const r = await closeDataRequest(id, outcome, note).catch(() => ({ ok: false as const, error: 'Try again.' }));
        if (r.ok) router.refresh(); else setError(r.error);
      });
    }}>
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className={`${label} mb-1`}>How it ends</legend>
        {([['FULFILLED', 'Answered'], ['REFUSED', 'Refused'], ['WITHDRAWN', 'Withdrawn by the customer']] as const).map(([v, t]) => (
          <label key={v} className="flex items-center gap-2"><input type="radio" name="outcome" value={v} checked={outcome === v} disabled={v === 'FULFILLED' && !canAnswer} onChange={() => setOutcome(v)} />{t}</label>
        ))}
      </fieldset>
      {!canAnswer ? <p className="text-xs text-[var(--ejo-text-muted)]">{answerHint}</p> : null}
      <label className={label}>{outcome === 'FULFILLED' ? 'What was done (how the copy was sent; what was corrected, erased or stopped)' : outcome === 'REFUSED' ? 'Why it was refused (the customer is told)' : 'How they withdrew it'}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className={field} required />
      </label>
      <Alert text={error} />
      <button type="submit" className={outcome === 'FULFILLED' ? primary : secondary} disabled={pending}>{pending ? 'Closing…' : 'Close the request'}</button>
    </form>
  );
}
