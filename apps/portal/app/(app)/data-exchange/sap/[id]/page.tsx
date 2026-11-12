import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardAnyPage } from '@/lib/authz/server';
import { getSapPostingFile } from '@/lib/actions/sap-postings';
import { KINDS, LINE_STATUS_WORDS } from '@/lib/sap/postings';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { PageHeader, SectionCard, StatusChip } from '@/components/ui';
import type { Tone } from '@/components/ui/tones';
import { AnswerUpload, SendAgain } from '@/components/data-exchange/SapPostingActions';

export const dynamic = 'force-dynamic';

const nf = (n: number) => n.toLocaleString('en-NG');
const naira = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TONE: Record<string, Tone> = { SENT: 'warning', POSTED: 'success', REJECTED: 'error', RESEND: 'info', SUPERSEDED: 'neutral' };
const FILTERS = ['ALL', 'SENT', 'POSTED', 'REJECTED', 'RESEND', 'SUPERSEDED'] as const;
const HREF: Record<string, (id: string) => string> = { Customer: (id) => `/crm/customers/${id}`, JobCard: (id) => `/workshop/job-cards/${id}`, VehicleService: (id) => `/workshop/vehicle-service/${id}` };

/** One postings file: its control totals and checksum, the download, SAP's return file, and every line with its status. */
export default async function SapPostingFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; page?: string }> }) {
  await guardAnyPage(['dataexchange.export.run', 'dataexchange.import.approve'], '/data-exchange/sap');
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const status = FILTERS.includes(q.status as (typeof FILTERS)[number]) ? q.status! : 'ALL';
  const page = Math.max(0, Math.min(999, Number(q.page) || 0));
  const f = await getSapPostingFile(id, status, page);
  if (!f) notFound();
  const k = KINDS[f.kind];
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="file" back={{ href: '/data-exchange/sap', label: 'Back to the postings for SAP' }} eyebrow={`${k.label} · ${f.scopeName}`} title={f.number}
        description={`${k.what} Up to ${f.upTo.toISOString().slice(0, 10)}; made by ${f.createdBy}, ${formatDateTimeCompact(f.createdAt)}.`} />
      <SectionCard icon="download" title="The file" description="Line 1 is the header, as SAP's load tools expect. The file is rebuilt from its lines, so its checksum is the same every time: check it before SAP loads it.">
        <dl className="grid gap-3 text-sm sm:grid-cols-4" data-testid="posting-control">
          <div><dt className="text-xs text-[var(--ejo-text-muted)]">Lines</dt><dd className="font-medium tabular-nums">{nf(f.lineCount)}</dd></div>
          {k.quantityColumn ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">Quantity ({k.quantityColumn})</dt><dd className="font-medium tabular-nums">{nf(f.quantity)}</dd></div> : null}
          {k.amountColumn ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">Amount ({k.amountColumn})</dt><dd className="font-medium tabular-nums">{naira(f.amount)}</dd></div> : null}
          <div className="sm:col-span-4"><dt className="text-xs text-[var(--ejo-text-muted)]">SHA-256</dt><dd className="break-all font-mono text-xs" data-testid="posting-checksum">{f.checksum}</dd></div>
        </dl>
        {f.may.download ? <a href={`/data-exchange/sap/${f.id}/download`} className="mt-3 inline-block rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90">Download for SAP (CSV)</a> : null}
        <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">{f.downloadedAt ? `First downloaded ${formatDateTimeCompact(f.downloadedAt)}.` : 'Not downloaded yet.'} {f.acknowledgedAt ? `Every line answered by ${formatDateTimeCompact(f.acknowledgedAt)}.` : ''}</p>
      </SectionCard>
      {f.may.answer ? (
        <SectionCard icon="check-circle" title="SAP’s answers" description="Load SAP's return file: each line is set once, posted (with its document number) or rejected (with SAP's message). The same answer twice changes nothing; a different answer for a line already answered is reported, never applied.">
          <AnswerUpload fileId={f.id} />
        </SectionCard>
      ) : null}
      <SectionCard icon="list" title="Lines" flush>
        <nav className="flex flex-wrap gap-2 p-3 text-xs" aria-label="Lines by status">
          {FILTERS.map((s) => <Link key={s} href={`/data-exchange/sap/${f.id}?status=${s}`} aria-current={status === s ? 'page' : undefined} className={`rounded-full border px-2.5 py-1 ${status === s ? 'border-[var(--ejo-primary)] text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>{s === 'ALL' ? `All ${nf(f.lineCount)}` : `${LINE_STATUS_WORDS[s]} ${nf(f.counts[s] ?? 0)}`}</Link>)}
        </nav>
        <ul className="divide-y divide-[var(--ejo-border)]">
          {f.lines.map((l) => (
            <li key={l.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm" data-testid="posting-line" data-status={l.status}>
              <div className="min-w-0">
                <p className="font-medium text-[var(--ejo-text)]"><span className="tabular-nums text-[var(--ejo-text-muted)]">{l.lineNo}.</span> {HREF[l.entityType] ? <Link href={HREF[l.entityType]!(l.entityId)} className="text-[var(--ejo-primary)] hover:underline">{l.entityType}</Link> : l.entityType}{l.amount !== null && k.amountColumn ? ` · ${naira(l.amount)}` : ''}{l.quantity !== null && k.quantityColumn ? ` · ${nf(l.quantity)}` : ''}</p>
                <p className="break-words text-xs text-[var(--ejo-text-muted)]">{l.summary}</p>
                {l.sapDocument ? <p className="text-xs text-[var(--ejo-text)]">SAP document {l.sapDocument}</p> : null}
                {l.message ? <p className={`text-xs ${l.status === 'REJECTED' ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-text)]'}`}>SAP: {l.message}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <StatusChip label={LINE_STATUS_WORDS[l.status] ?? l.status} tone={TONE[l.status] ?? 'neutral'} />
                {l.status === 'REJECTED' && f.may.answer ? <SendAgain lineId={l.id} /> : null}
              </div>
            </li>
          ))}
          {!f.lines.length ? <li className="p-3 text-sm text-[var(--ejo-text-muted)]">No lines with this status.</li> : null}
        </ul>
        {f.more || page > 0 ? (
          <div className="flex gap-3 p-3 text-xs">
            {page > 0 ? <Link href={`/data-exchange/sap/${f.id}?status=${status}&page=${page - 1}`} className="text-[var(--ejo-primary)] hover:underline">Previous 200</Link> : null}
            {f.more ? <Link href={`/data-exchange/sap/${f.id}?status=${status}&page=${page + 1}`} className="text-[var(--ejo-primary)] hover:underline">Next 200</Link> : null}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
