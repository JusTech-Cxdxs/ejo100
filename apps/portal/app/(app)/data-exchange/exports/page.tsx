import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { listExports } from '@/lib/actions/exports';
import { EmptyState, PageHeader, SectionCard, StatusChip } from '@/components/ui';
import { ExportButton } from '@/components/ExportButton';

export const dynamic = 'force-dynamic';

const when = (d: Date) => d.toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fileSize = (b: number | null) => (b === null ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/**
 * Exports: every list exported from EJO — which list, which filters, who,
 * when, and who downloaded it (rows and size). Your own; everyone's in the
 * organisation for those who read the audit trail.
 */
export default async function ExportsPage() {
  await guardPage('dataexchange.export.run', '/data-exchange/exports');
  const { rows, everyone } = await listExports({ take: 200 });
  const now = Date.now();
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader
        icon="download"
        back={{ href: '/data-exchange', label: 'Back to Data Exchange' }}
        title="Exports"
        description={`${everyone ? 'Every list exported in your organisation' : 'The lists you have exported'}: Excel or CSV, exactly as the list was filtered. A file is built when it is downloaded, for the person downloading it; each link works for 24 hours, once per person. Use Export on any list to make one.`}
        actions={everyone ? <ExportButton kind="exports" label="Export this history" /> : undefined}
      />
      <SectionCard icon="history" title={everyone ? 'All exports' : 'Your exports'} flush>
        {rows.length === 0 ? (
          <div className="p-4"><EmptyState compact icon="download" title="No exports yet.">Every list has an Export button: customers, vehicles, parts, stock, suppliers, Job Cards, Vehicle Services, warranties and more.</EmptyState></div>
        ) : (
          <ol className="divide-y divide-[var(--ejo-border)]">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <Link href={`/data-exchange/exports/${r.id}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{r.number}</Link>
                  {' · '}<span className="font-medium text-[var(--ejo-text)]">{r.list}</span>
                  <span className="ml-1 text-xs uppercase text-[var(--ejo-text-muted)]">{r.format}</span>
                  {r.sensitive ? <StatusChip tone="warning" className="ml-2">Contact details or payments</StatusChip> : null}
                  <span className="block break-words text-xs text-[var(--ejo-text-muted)]">{r.summary}{everyone ? ` · ${r.createdBy}` : ''}</span>
                  <span className="block text-xs text-[var(--ejo-text-muted)]">
                    {r.downloads.length === 0 ? 'Not downloaded yet' : r.downloads.map((d) => `${d.by}: ${d.rows.toLocaleString('en-NG')} rows${d.parts > 1 ? ` in ${d.parts} parts` : ''}${d.finished ? '' : ' (more to come)'}`).join(' · ')}
                    {r.bytes !== null ? ` · ${fileSize(r.bytes)}` : ''}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-[var(--ejo-text-muted)]">
                  <span className="tabular-nums">{when(r.createdAt)}</span>
                  {r.expiresAt.getTime() <= now ? <StatusChip tone="neutral">Link expired</StatusChip> : <StatusChip tone="success">Link works until {when(r.expiresAt)}</StatusChip>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}
