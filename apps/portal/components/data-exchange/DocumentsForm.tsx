'use client';

import { useState, useTransition } from 'react';
import { findDocuments, type DocumentsFound } from '@/lib/actions/documents';
import { DOCUMENT_KIND, DOCUMENT_KINDS, DOCUMENTS_PER_ZIP, MAX_DAYS } from '@/lib/exports/documents';

const field = 'mt-1 block w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'block text-xs font-medium text-[var(--ejo-text)]';

/** Choose the kind, the workshop and the period; see how many documents there are; download each zip. */
export function DocumentsForm({ branches, today, monthStart }: { branches: { id: string; name: string }[]; today: string; monthStart: string }) {
  const [kind, setKind] = useState<string>('JOB_ESTIMATE');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [found, setFound] = useState<Extract<DocumentsFound, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const changed = <T,>(set: (v: T) => void) => (v: T) => { set(v); setFound(null); setError(null); };
  return (
    <div className="space-y-5">
      <form className="space-y-4" data-testid="documents-form" onSubmit={(e) => {
        e.preventDefault();
        setError(null); setFound(null);
        start(async () => {
          const r = await findDocuments({ kind, branchId, from, to }).catch(() => ({ ok: false as const, error: 'The documents could not be counted. Try again.' }));
          if (r.ok) setFound(r); else setError(r.error);
        });
      }}>
        <fieldset>
          <legend className={label}>Kind of document</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {DOCUMENT_KINDS.map((k) => (
              <label key={k} className={`flex cursor-pointer gap-2 rounded-[var(--ejo-radius-md)] border p-3 text-sm ${kind === k ? 'border-[var(--ejo-primary)]' : 'border-[var(--ejo-border)]'}`}>
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => changed(setKind)(k)} className="mt-0.5" />
                <span><span className="font-medium text-[var(--ejo-text)]">{DOCUMENT_KIND[k].label}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{DOCUMENT_KIND[k].what} Dated {DOCUMENT_KIND[k].dated}.</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={label}>Workshop
            <select value={branchId} onChange={(e) => changed(setBranchId)(e.target.value)} className={field}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </label>
          <label className={label}>From
            <input type="date" value={from} max={today} onChange={(e) => changed(setFrom)(e.target.value)} className={field} required />
          </label>
          <label className={label}>To (at most {MAX_DAYS} days)
            <input type="date" value={to} max={today} onChange={(e) => changed(setTo)(e.target.value)} className={field} required />
          </label>
        </div>
        {error ? <p role="alert" className="text-sm text-[var(--ejo-error)]">{error}</p> : null}
        <button type="submit" disabled={pending || !branchId} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{pending ? 'Counting…' : 'Find the documents'}</button>
      </form>
      {found ? (
        <div role="status" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-4" data-testid="documents-found">
          {found.count === 0 ? <p className="text-sm text-[var(--ejo-text)]">No {DOCUMENT_KIND[found.kind].label.toLowerCase()} at {found.branchName} in this period.</p> : (
            <>
              <p className="text-sm text-[var(--ejo-text)]"><span className="font-medium">{found.count.toLocaleString('en-NG')} {found.count === 1 ? 'document' : 'documents'}</span> at {found.branchName}, {found.from} to {found.to}{found.parts > 1 ? ` — in ${found.parts} zips of up to ${DOCUMENTS_PER_ZIP}` : ''}.</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {Array.from({ length: found.parts }, (_, i) => i + 1).map((part) => (
                  <li key={part}><a data-testid="documents-zip" href={`/data-exchange/documents/download?kind=${found.kind}&branch=${encodeURIComponent(found.branchId)}&from=${found.from}&to=${found.to}&part=${part}`}
                    className="inline-block rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-sm font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-bg)]">{found.parts > 1 ? `Download zip ${part} of ${found.parts}` : 'Download the zip'}</a></li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Each zip holds the PDFs and index.csv (file, number, customer, date). Every download is recorded in the audit trail.</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
