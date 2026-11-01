import { notFound } from 'next/navigation';
import { guardPage } from '@/lib/authz/server';
import { getExportDetail } from '@/lib/actions/exports';
import { LoadingLink } from '@/components/LoadingLink';
import { PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { ExportDownloadPanel } from '@/components/ExportDownloadPanel';

export const dynamic = 'force-dynamic';

const when = (d: Date) => d.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/** One export: which list and filters, who made it, its download for you, and everyone who has downloaded it. */
export default async function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await guardPage('dataexchange.export.run', `/data-exchange/exports/${id}`);
  const e = await getExportDetail(id);
  if (!e) notFound();
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader
        icon="download"
        back={{ href: '/data-exchange/exports', label: 'Back to Exports' }}
        eyebrow={e.number}
        title={`${e.list} · ${e.format === 'csv' ? 'CSV' : 'Excel'}`}
        description={`${e.summary}. Exported by ${e.createdBy}, ${when(e.createdAt)}.`}
      />
      <SectionCard icon="download" title="Your download">
        {e.progress ? <ExportDownloadPanel id={e.id} initial={e.progress} /> : <p className="text-sm text-[var(--ejo-text-muted)]">You may not export {e.list.toLowerCase()}, so this file cannot be built for you.</p>}
        <p className="mt-4 text-xs text-[var(--ejo-text-muted)]">
          {e.sensitive ? <StatusChip tone="warning" className="mr-2">Contact details or payments</StatusChip> : null}
          The link works until {when(e.expiresAt)}. <LoadingLink href={e.page} className="font-medium text-[var(--ejo-primary)] hover:underline">Open the list in EJO</LoadingLink>
        </p>
      </SectionCard>
      <SectionCard icon="users" title="Who has downloaded it" flush>
        {e.downloads.length === 0 ? <p className="p-4 text-sm text-[var(--ejo-text-muted)]">Nobody yet.</p> : (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {e.downloads.map((d, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
                <span><span className="font-medium text-[var(--ejo-text)]">{d.by}</span> · {d.rows.toLocaleString('en-NG')} rows{d.parts > 1 ? ` in ${d.parts} parts` : ''}{d.finished ? '' : ' · more to come'}</span>
                <span className="text-xs tabular-nums text-[var(--ejo-text-muted)]">{when(d.at)}</span>
              </li>
            ))}
          </ul>
        )}
        {e.bytes !== null && e.rowCount !== null ? <p className="border-t border-[var(--ejo-border)] px-4 py-3 text-xs text-[var(--ejo-text-muted)]">The whole file: {e.rowCount.toLocaleString('en-NG')} rows, {size(e.bytes)}.</p> : null}
      </SectionCard>
    </div>
  );
}
