'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listImportChanges } from '@/lib/actions/data-exchange';
import { changeWords, type Change } from '@/lib/data-exchange/round-trip';

type Row = { rowNumber: number; recordId: string | null; status: string; changes: Change[] };
const nf = (n: number) => n.toLocaleString('en-NG');
const HREF: Record<string, (id: string) => string> = {
  customer: (id) => `/crm/customers/${id}`, vehicle: (id) => `/workshop/vehicles/${id}/edit`, part: (id) => `/inventory/parts/${id}`, supplier: () => '/inventory/suppliers',
};

/**
 * The changes an update from an edited export makes (P10): how many records
 * and fields, each field counted, and every row's "from → to", fifty at a time
 * — previewed before approval, as applied once loaded.
 */
export function RoundTripChanges({ jobId, noun, plural, loaded, records, fields, counts }: { jobId: string; noun: string; plural: string; loaded: boolean; records: number; fields: number; counts: Record<string, number> }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setBusy(true);
    listImportChanges(jobId, page)
      .then((r) => { if (live) { setRows((prev) => (page === 0 ? r.rows : [...prev, ...r.rows])); setMore(r.more); setError(null); } })
      .catch(() => { if (live) setError('The changes could not be read. Refresh the page.'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [jobId, page]);
  const byField = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <div className="mt-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-primary)]/30 bg-[var(--ejo-primary)]/5 p-3 text-sm text-[var(--ejo-text)]" data-testid="round-trip-changes">
      <p className="font-medium">{loaded ? 'Changed' : 'To change'}: {nf(records)} {records === 1 ? noun : plural} · {nf(fields)} field{fields === 1 ? '' : 's'}</p>
      {byField.length ? <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">{byField.map(([f, n]) => `${f} ${nf(n)}`).join(' · ')}</p> : <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">Nothing in the file differs from EJO.</p>}
      {rows.length ? (
        <ul className="mt-2 divide-y divide-[var(--ejo-border)] rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
          {rows.map((r) => (
            <li key={r.rowNumber} className="p-2 text-xs" data-testid="round-trip-row">
              <p className="font-medium text-[var(--ejo-text)]">
                Row {r.rowNumber}
                {r.recordId && HREF[noun] ? <> · <Link href={HREF[noun]!(r.recordId)} className="text-[var(--ejo-primary)] hover:underline">open the {noun}</Link></> : null}
                {r.status === 'UNDONE' ? <span className="ml-1 text-[var(--ejo-text-muted)]">(undone)</span> : null}
              </p>
              <ul className="mt-0.5 space-y-0.5">{r.changes.map((c) => <li key={c.field} className="break-words text-[var(--ejo-text)]">{changeWords(c)}</li>)}</ul>
            </li>
          ))}
        </ul>
      ) : null}
      {more ? <button type="button" disabled={busy} onClick={() => setPage((p) => p + 1)} className="mt-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--ejo-bg)] disabled:opacity-50">Show more</button> : null}
      {busy && !rows.length ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Reading the changes…</p> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-[var(--ejo-error)]">{error}</p> : null}
    </div>
  );
}
