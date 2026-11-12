import Link from 'next/link';
import { guardAnyPage } from '@/lib/authz/server';
import { getSapPostings } from '@/lib/actions/sap-postings';
import { KINDS } from '@/lib/sap/postings';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { EmptyState, PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { MakePostingFile } from '@/components/data-exchange/SapPostingActions';

export const dynamic = 'force-dynamic';

const nf = (n: number) => n.toLocaleString('en-NG');
const naira = (n: number) => `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dayBefore = (d: string) => new Date(new Date(`${d}T00:00:00.000Z`).getTime() - 86_400_000).toISOString().slice(0, 10);

/** C1a — the daily postings for SAP, branch by branch: what is not sent yet, sent, posted and rejected since the cut-over, and the files. */
export default async function SapPostingsPage() {
  await guardAnyPage(['dataexchange.export.run', 'dataexchange.import.approve'], '/data-exchange/sap');
  const { scopes, today } = await getSapPostings();
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader icon="match" back={{ href: '/data-exchange', label: 'Back to Data Exchange' }} title="Postings for SAP"
        description="What happened in EJO since each branch was signed off as cut over — goods received and issued, workshop billing, payments, new customers — as the files SAP's team loads with their own tools. Each file has a checksum; SAP's return file marks each line posted (with its document number) or rejected (with SAP's message). EJO never writes into SAP." />
      {scopes.length === 0 ? <EmptyState icon="inbox" title="No branch you send to SAP." /> : scopes.map((s) => (
        <SectionCard key={s.id} icon={s.id === 'organisation' ? 'users' : 'building'} title={s.name}
          description={s.start ? `Postings since ${formatDateTimeCompact(s.start)} (signed off as cut over)${s.sapPlant ? ` · SAP plant ${s.sapPlant}` : ''}.` : s.id === 'organisation' ? 'Postings start the day the first branch is signed off as cut over.' : 'Postings start the day this branch is signed off as cut over (Data Exchange → Cut-over checklist).'}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm" data-testid="posting-tally">
              <thead className="text-xs text-[var(--ejo-text-muted)]">
                <tr><th className="py-1 pr-3 font-medium">Kind</th><th className="py-1 pr-3 font-medium">Not in a file yet</th><th className="py-1 pr-3 font-medium">Sent, waiting for SAP</th><th className="py-1 pr-3 font-medium">Posted</th><th className="py-1 pr-3 font-medium">Rejected</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--ejo-border)]">
                {s.kinds.map((k) => {
                  const money = Boolean(KINDS[k.kind].amountColumn);
                  const cell = (c: { count: number; amount: number }) => `${nf(c.count)}${money && c.count ? ` · ${naira(c.amount)}` : ''}`;
                  return (
                    <tr key={k.kind} data-kind={k.kind}>
                      <td className="py-2 pr-3"><span className="font-medium text-[var(--ejo-text)]">{KINDS[k.kind].label}</span><span className="block text-xs text-[var(--ejo-text-muted)]">{KINDS[k.kind].what}</span></td>
                      <td className="py-2 pr-3 tabular-nums">{cell(k.notSent)}{k.notSent.more ? '+' : ''}</td>
                      <td className="py-2 pr-3 tabular-nums">{cell(k.sent)}</td>
                      <td className="py-2 pr-3 tabular-nums">{cell(k.posted)}</td>
                      <td className="py-2 pr-3 tabular-nums">{k.rejected.count ? <span className="text-[var(--ejo-error)]">{cell(k.rejected)}</span> : '0'}{k.resend.count ? <span className="block text-xs text-[var(--ejo-text-muted)]">{nf(k.resend.count)} to send again</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {s.may.make && s.start ? <div className="mt-4"><MakePostingFile scope={s.id} kinds={s.kinds.map((k) => ({ kind: k.kind, label: KINDS[k.kind].label }))} today={today} yesterday={dayBefore(today)} /></div> : null}
          {s.files.length ? (
            <ul className="mt-4 divide-y divide-[var(--ejo-border)] rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)]">
              {s.files.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm" data-testid="posting-file">
                  <div className="min-w-0">
                    <Link href={`/data-exchange/sap/${f.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{f.number}</Link>
                    <span className="block text-xs text-[var(--ejo-text-muted)]">{KINDS[f.kind as keyof typeof KINDS]?.label ?? f.kind} · up to {f.upTo.toISOString().slice(0, 10)} · {nf(f.lineCount)} lines{f.amount ? ` · ${naira(f.amount)}` : ''} · made {formatDateTimeCompact(f.createdAt)}</span>
                  </div>
                  {f.acknowledgedAt ? <StatusChip label={f.rejected ? `${nf(f.rejected)} rejected` : 'All answered'} tone={f.rejected ? 'error' : 'success'} /> : f.downloadedAt ? <StatusChip label={`${nf(f.open)} waiting for SAP`} tone="warning" /> : <StatusChip label="Not downloaded yet" tone="neutral" />}
                </li>
              ))}
            </ul>
          ) : null}
        </SectionCard>
      ))}
    </div>
  );
}
