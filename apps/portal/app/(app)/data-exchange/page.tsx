import Link from 'next/link';
import { allows, guardAnyPage } from '@/lib/authz/server';
import { listImportJobs } from '@/lib/actions/data-exchange';
import { ENTITIES, ENTITY_KEYS } from '@/lib/data-exchange/fields';
import { IMPORT_STEPS, bytesText, importStatus } from '@/lib/data-exchange/status';
import { StagingSettings } from '@/components/data-exchange/StagingSettings';
import { formatDateTimeCompact } from '@/lib/utils/format-date';
import { EmptyState, HeaderAction, Icon, PageHeader, ResponsiveTable, SectionCard, StatusChip } from '@/components/ui';
import { ExportAction } from '@/components/ExportAction';
import { DatabaseSpaceCard } from '@/components/data-exchange/DatabaseSpaceCard';

export const dynamic = 'force-dynamic';

const nf = (n: number) => n.toLocaleString('en-NG');

/** Data Exchange: bring existing records in from SAP and spreadsheets — checked, approved by a second person, reversible. */
export default async function DataExchangePage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  await guardAnyPage(['dataexchange.import.run', 'dataexchange.import.approve'], '/data-exchange');
  const canExport = await allows('dataexchange.export.run');
  const { before } = await searchParams;
  const { jobs, canRun, staging, space } = await listImportJobs({ take: 30, before });
  return (
    <div className="w-full space-y-6 p-4 sm:p-8">
      <PageHeader
        hero
        icon="layers"
        eyebrow="Data Exchange"
        title="Bring in existing records"
        description="Customers, vehicles, suppliers, parts and opening stock from SAP or your spreadsheets, without retyping. Every file is checked first, the department that owns the records approves it, it loads in batches, and it can be undone. Every list in EJO exports to Excel or CSV the same careful way."
        actions={canExport ? <HeaderAction href="/data-exchange/exports" icon="download" variant="secondary">Exports</HeaderAction> : undefined}
      />

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {IMPORT_STEPS.map((s, i) => (
          <li key={s} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-3">
            <span className="text-[11px] font-medium text-[var(--ejo-primary)]">Step {i + 1}</span>
            <p className="text-sm font-medium text-[var(--ejo-text)]">{s}</p>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ENTITY_KEYS.map((k) => {
          const e = ENTITIES[k];
          return (
            <SectionCard key={k} icon={({ customers: 'users', vehicles: 'car', suppliers: 'truck', parts: 'boxes', stock: 'package', invoices: 'receipt', registers: 'clipboard' } as const)[k]} title={e.label} description={e.description}>
              <p className="text-xs text-[var(--ejo-text-muted)]">Recognised by {e.matchOrder.join(', then ')}.{e.after ? ` Load the ${ENTITIES[e.after].plural} file first.` : ''}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {canRun ? <Link href={`/data-exchange/new?entity=${k}`} className="inline-flex items-center gap-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"><Icon name="plus" size={14} /> Import {k === 'stock' ? 'opening stock' : k === 'invoices' ? 'invoice history' : k === 'registers' ? 'registers' : e.plural}</Link> : null}
                <a href={`/data-exchange/templates/${k}`} className="inline-flex items-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"><Icon name="download" size={14} /> Excel template</a>
                <a href={`/data-exchange/templates/${k}?format=csv`} className="inline-flex items-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"><Icon name="download" size={14} /> CSV template</a>
              </div>
            </SectionCard>
          );
        })}
      </div>

      <DatabaseSpaceCard space={space} />

      <SectionCard icon="layers" title="Space used by staged files" description={`Each import keeps a copy of its file while it is checked, approved and loaded. Once it is finished — and Finance has confirmed the totals, where needed — the copy is released after ${staging.days === 0 ? 'no set period (kept for ever)' : `${staging.days} days`}. The summary, every row’s outcome, rejected rows and what undo needs are kept.`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="text-sm text-[var(--ejo-text)]"><span className="text-2xl font-semibold tabular-nums">{bytesText(staging.totalBytes)}</span> <span className="text-[var(--ejo-text-muted)]">in staged files now</span></p>
          {staging.canSet ? <StagingSettings days={staging.days} /> : null}
        </div>
      </SectionCard>

      <SectionCard icon="history" title="Imports" description="Newest first. Open one to see its check, approval, load and report." flush
        actions={<span className="flex flex-wrap items-center gap-3"><ExportAction kind="imports" label="Export the list" /><Link href="/data-exchange/timeline" className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Day by day →</Link></span>}>
        {jobs.length === 0 ? (
          <div className="p-4"><EmptyState icon="inbox" title="No imports yet" compact>Download a template above, or start with your SAP export: its columns are matched automatically.</EmptyState></div>
        ) : (
          <ResponsiveTable>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ejo-border)] text-left text-[var(--ejo-text-muted)]">
                  <th className="px-4 py-3 font-medium">Import</th>
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Rows</th>
                  <th className="px-4 py-3 text-right font-medium">Added</th>
                  <th className="px-4 py-3 text-right font-medium">Staged file</th>
                  <th className="px-4 py-3 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => {
                  const st = importStatus(j.status);
                  return (
                    <tr key={j.id} className="border-b border-[var(--ejo-border)] last:border-0">
                      <td className="px-4 py-3"><Link href={`/data-exchange/imports/${j.id}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{j.number}</Link><span className="block text-xs text-[var(--ejo-text-muted)]">{ENTITIES[j.entity].label}</span></td>
                      <td className="max-w-[16rem] truncate px-4 py-3 text-[var(--ejo-text)]">{j.fileName}</td>
                      <td className="px-4 py-3"><StatusChip label={st.label} tone={st.tone} /></td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--ejo-text)]">{nf(j.fileRows)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--ejo-text)]">{nf(j.createdRows)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-[var(--ejo-text)]">{bytesText(j.stagedBytes)}{j.rowsReleasedAt ? <span className="block text-xs text-[var(--ejo-text-muted)]">released</span> : null}</td>
                      <td className="px-4 py-3 text-[var(--ejo-text-muted)]">{j.createdBy}<span className="block text-xs">{formatDateTimeCompact(j.createdAt)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
        {jobs.length === 30 ? <div className="border-t border-[var(--ejo-border)] p-3 text-center"><Link href={`/data-exchange?before=${encodeURIComponent(jobs[jobs.length - 1]!.createdAt.toISOString())}`} className="text-sm font-medium text-[var(--ejo-primary)] hover:underline">View older imports</Link></div> : null}
      </SectionCard>
    </div>
  );
}
