import Link from 'next/link';
import type { Provenance } from '@/lib/data-exchange/provenance-server';
import { formatDateOnly, formatDateTimeCompact } from '@/lib/utils/format-date';

/** "Where this came from": made in EJO (by whom, when), or brought in by an import, with the other system's number and original date. */
export function ProvenanceCard({ p, className = '' }: { p: Provenance; className?: string }) {
  const word = p.source === 'ejo' ? 'Created in EJO 100' : p.source === 'sap' ? 'Imported from SAP' : 'Imported from a spreadsheet';
  return (
    <section aria-labelledby="provenance" className={`rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-5 ${className}`}>
      <h2 id="provenance" className="text-sm font-semibold text-[var(--ejo-text)]">Where this came from</h2>
      <p className="mt-2 text-sm font-medium text-[var(--ejo-text)]">{word}</p>
      <dl className="mt-2 space-y-2 text-sm">
        {p.importJob ? (
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">Import</dt>
            <dd className="text-[var(--ejo-text)]">
              {p.importJob.canOpen ? <Link href={`/data-exchange/imports/${p.importJob.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{p.importJob.number}</Link> : p.importJob.number}
              <span className="block break-words text-xs text-[var(--ejo-text-muted)]">{p.importJob.fileName}{p.importJob.approvedBy ? ` · approved by ${p.importJob.approvedBy}` : ''}</span>
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-[var(--ejo-text-muted)]">{p.source === 'ejo' ? 'Created' : 'Entered EJO 100'}</dt>
          <dd className="text-[var(--ejo-text)]">{formatDateTimeCompact(p.enteredAt)}{p.enteredBy ? <span className="block text-xs text-[var(--ejo-text-muted)]">by {p.enteredBy}</span> : null}</dd>
        </div>
        {p.external ? (
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">{p.external.label}</dt>
            <dd className="font-medium tabular-nums text-[var(--ejo-text)]">{p.external.number}</dd>
          </div>
        ) : null}
        {p.original ? (
          <div>
            <dt className="text-xs text-[var(--ejo-text-muted)]">{p.original.label}</dt>
            <dd className="text-[var(--ejo-text)]">{formatDateOnly(p.original.date)}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
