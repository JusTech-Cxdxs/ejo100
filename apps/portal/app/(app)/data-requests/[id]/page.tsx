import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardPage } from '@/lib/authz/server';
import { getDataRequest } from '@/lib/actions/data-requests';
import { dueOf, dueWords, KIND_LABEL, STATUS_LABEL, VIA_LABEL, type Via } from '@/lib/privacy/requests';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { CloseForm, VerifyForm } from '@/components/privacy/DataRequestActions';

export const dynamic = 'force-dynamic';

const Row = ({ term, children }: { term: string; children: React.ReactNode }) => (
  <div><dt className="text-xs text-[var(--ejo-text-muted)]">{term}</dt><dd className="mt-0.5 break-words text-sm text-[var(--ejo-text)]">{children}</dd></div>
);

/** One data request: who and what, the identity check, the copy (for a request for one), and closing it. */
export default async function DataRequestPage({ params }: { params: Promise<{ id: string }> }) {
  await guardPage('privacy.requests.manage', '/data-requests');
  const { id } = await params;
  const r = await getDataRequest(id);
  if (!r) notFound();
  const k = KIND_LABEL[r.kind];
  const st = STATUS_LABEL[r.status] ?? { label: r.status, tone: 'neutral' as const };
  const open = r.status === 'RECEIVED' || r.status === 'VERIFIED';
  const copyOpen = r.kind === 'ACCESS' && (r.status === 'VERIFIED' || (r.status === 'FULFILLED' && r.closedAt && Date.now() - +r.closedAt < 7 * 86_400_000));
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="lock" back={{ href: '/data-requests', label: 'Back to data requests' }} eyebrow={k?.label ?? r.kind} title={r.number}
        description={k?.what} actions={<StatusChip label={st.label} tone={st.tone} />} />

      <SectionCard icon="user" title="The request">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="request-facts">
          <Row term="Customer">{r.customer ? <Link href={`/crm/customers/${r.customer.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{r.customer.name}</Link> : 'No longer in the records'}</Row>
          <Row term="Contact on record">{[r.customer?.phone, r.customer?.email].filter(Boolean).join(' · ') || '—'}</Row>
          <Row term="Came in">{VIA_LABEL[r.receivedVia as Via] ?? r.receivedVia}, {formatDateTimeCompact(r.receivedAt).split(',')[0]}</Row>
          <Row term={open ? 'To answer by' : 'Recorded'}>{open ? <span data-testid="request-due" className={dueOf(r.receivedAt).overdue ? 'font-medium text-[var(--ejo-error)]' : ''}>{formatDateTimeCompact(dueOf(r.receivedAt).dueAt).split(',')[0]} ({dueWords(dueOf(r.receivedAt))})</span> : formatDateTimeCompact(r.createdAt)}</Row>
          {r.details ? <div className="sm:col-span-2 lg:col-span-4"><Row term="In their words"><span className="whitespace-pre-wrap">{r.details}</span></Row></div> : null}
        </dl>
      </SectionCard>

      <SectionCard icon="badge" title="1 · Who is asking" description="Their identity is confirmed before anything is given or changed — by someone other than the person who recorded the request. Send the answer only to the contact details on the record.">
        {r.verifiedAt ? (
          <p className="text-sm text-[var(--ejo-text)]" data-testid="verified">Confirmed {formatDateTimeCompact(r.verifiedAt)}{r.verifiedByMe ? ' by you' : ''}: {r.verifiedHow}</p>
        ) : r.status !== 'RECEIVED' ? <p className="text-sm text-[var(--ejo-text-muted)]">Not confirmed: the request was closed first.</p>
          : r.recordedByMe ? <p className="text-sm text-[var(--ejo-text-muted)]" data-testid="verify-by-colleague">You recorded this request, so a colleague who handles data requests confirms who is asking.</p>
          : <VerifyForm id={r.id} />}
      </SectionCard>

      {r.kind === 'ACCESS' ? (
        <SectionCard icon="download" title="2 · Their copy" description="A zip: a README, one spreadsheet (CSV) for each kind of record and data.json for another system — made from the records as they are at that moment. Read it before you send it: anything about another person is theirs to remove. Send it to the contact details on the record, protected (for example a password shared another way).">
          {copyOpen ? <a href={`/data-requests/${r.id}/copy`} className="inline-block rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 py-2 text-sm font-medium text-white hover:opacity-90" data-testid="download-copy">Download their copy (zip)</a>
            : <p className="text-sm text-[var(--ejo-text-muted)]">{r.status === 'RECEIVED' ? 'Made once who is asking is confirmed.' : 'No longer given out: the request is closed.'}</p>}
          {r.packAt ? <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Downloaded {r.packDownloads} {r.packDownloads === 1 ? 'time' : 'times'}; last {formatDateTimeCompact(r.packAt)}, SHA-256 <span className="break-all font-mono" data-testid="copy-checksum">{r.packChecksum}</span>.</p> : null}
        </SectionCard>
      ) : null}

      <SectionCard icon="check-circle" title={`${r.kind === 'ACCESS' ? '3' : '2'} · Close it`} description="With what was done — or why it was refused, which the customer is told.">
        {open ? <CloseForm id={r.id} canAnswer={r.status === 'VERIFIED' && (r.kind !== 'ACCESS' || r.packDownloads > 0)} answerHint={r.status !== 'VERIFIED' ? 'It can be answered once who is asking is confirmed.' : 'Download their copy first: the request is answered with it.'} />
          : <p className="text-sm text-[var(--ejo-text)]" data-testid="closed">{st.label} {r.closedAt ? formatDateTimeCompact(r.closedAt) : ''}: <span className="whitespace-pre-wrap">{r.outcome}</span></p>}
      </SectionCard>
    </div>
  );
}
