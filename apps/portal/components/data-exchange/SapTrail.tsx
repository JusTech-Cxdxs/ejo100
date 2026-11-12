import Link from 'next/link';
import { getSapTrail } from '@/lib/actions/sap-postings';
import { KINDS, LINE_STATUS_WORDS } from '@/lib/sap/postings';
import { formatDateTimeCompact } from '@/lib/utils/format-date';

const TONE: Record<string, string> = {
  POSTED: 'text-[var(--ejo-success)]', REJECTED: 'text-[var(--ejo-error)]', SENT: 'text-[var(--ejo-warning-text)]', RESEND: 'text-[var(--ejo-warning-text)]', SUPERSEDED: 'text-[var(--ejo-text-muted)]',
};
const naira = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * C1b — "Sent to SAP" on a record's page: each posting of the record (and of
 * its payments, refunds, parts issued, PDI decisions), the file it went in,
 * and what SAP answered — its document number, or its message. Shown only to
 * the people who send the branch's postings or confirm them; nothing when the
 * record has none.
 */
export async function SapTrail({ entityType, entityId }: { entityType: string; entityId: string }) {
  const lines = await getSapTrail(entityType, entityId).catch(() => null);
  if (!lines?.length) return null;
  return (
    <div className="mt-6 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6" data-testid="sap-trail">
      <h2 className="text-sm font-semibold text-[var(--ejo-text)]">Sent to SAP</h2>
      <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Each posting of this record in the files SAP’s team loads, and what SAP answered.</p>
      <ul className="mt-3 divide-y divide-[var(--ejo-border)] text-sm">
        {lines.map((l) => (
          <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2" data-testid="sap-trail-line" data-status={l.status}>
            <div className="min-w-0">
              <span className="font-medium text-[var(--ejo-text)]">{KINDS[l.kind]?.label ?? l.kind}</span>
              {l.amount ? <span className="ml-2 tabular-nums text-[var(--ejo-text-muted)]">{naira(l.amount)}</span> : null}
              <span className="block text-xs text-[var(--ejo-text-muted)]">
                <Link href={`/data-exchange/sap/${l.fileId}`} className="font-mono text-[var(--ejo-primary)] hover:underline">{l.fileNumber}</Link> · made {formatDateTimeCompact(l.madeAt)}
                {l.message ? <> · <span className="break-words">{l.message}</span></> : null}
              </span>
            </div>
            <span className={`text-xs font-medium ${TONE[l.status] ?? ''}`}>{LINE_STATUS_WORDS[l.status] ?? l.status}{l.sapDocument ? <span className="ml-1 font-mono">{l.sapDocument}</span> : null}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
