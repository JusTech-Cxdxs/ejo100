import { guardAnyPage } from '@/lib/authz/server';
import { listUnits } from '@/lib/actions/production';
import { UNIT_STAGE_LABEL, type UnitStageCode } from '@/lib/production-core';
import { formatDateTime } from '@/lib/utils/format-date';
import { LoadingLink } from '@/components/LoadingLink';
import { LiveSearchInput } from '@/components/LiveSearchInput';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { EmptyState, PageHeader, ResponsiveTable, StatusChip } from '@/components/ui';
import { chipLink, tableHead, tableRow, tableWrap, td, th } from '@/components/production/styles';

const FILTERS: { key: string; label: string }[] = [
  { key: 'line', label: 'On the line' }, { key: 'ASSEMBLY', label: 'Assembly' }, { key: 'SOFTWARE', label: 'Software' }, { key: 'LINE_CHECK', label: 'Line check' }, { key: 'QA', label: 'QA' },
  { key: 'REWORK', label: 'Rework' }, { key: 'PACKING', label: 'Packing' }, { key: 'RELEASED', label: 'Released' }, { key: 'SCRAPPED', label: 'Scrapped' }, { key: 'all', label: 'All' },
];

/** Every unit by stage, searchable by serial. */
export default async function UnitsPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string; error?: string }> }) {
  await guardAnyPage(['production.view'], '/production/units');
  const { q, stage: rawStage, error } = await searchParams;
  const stage = rawStage && FILTERS.some((f) => f.key === rawStage) ? rawStage : q ? 'all' : 'line';
  const rows = await listUnits({ q, stage: stage === 'all' ? undefined : stage });
  const chip = (active: boolean) => `${chipLink} ${active ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]' : 'border-[var(--ejo-border)] bg-[var(--ejo-surface)] text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]'}`;
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader icon="bolt" title="Units" back={{ href: '/production', label: 'Back to Production' }} description="Every unit the line has started, by serial — where it is now and who worked on it." />
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => <LoadingLink key={f.key} href={`/production/units?stage=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={chip(stage === f.key)} aria-current={stage === f.key ? 'true' : undefined}>{f.label}</LoadingLink>)}
      </div>
      <form className="mb-4 flex gap-2" action="/production/units">
        <input type="hidden" name="stage" value={stage} />
        <LiveSearchInput type="search" name="q" defaultValue={q ?? ''} placeholder="Search by serial, unit number, build order or product…" className="w-full max-w-md rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]" />
        <button type="submit" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]">Search</button>
      </form>
      {rows.length === 0 ? (
        <div className={`${tableWrap} border-dashed`}><EmptyState icon="bolt" title="No units in this view">{q ? 'No serial matches that.' : 'Units appear here once an assembler starts them on a released build order.'}</EmptyState></div>
      ) : (
        <ResponsiveTable className={tableWrap}>
          <table className="w-full text-sm">
            <thead><tr className={tableHead}><th className={th}>Serial</th><th className={th}>Product</th><th className={th}>Build order</th><th className={th}>Stage</th><th className={th}>Assembler</th><th className={th}>QA</th><th className={th}>Last change</th></tr></thead>
            <tbody>
              {rows.map((u: (typeof rows)[number]) => (
                <tr key={u.id} className={tableRow}>
                  <td className={td}><LoadingLink href={`/production/units/${u.id}`} className="font-mono font-medium text-[var(--ejo-primary)] hover:underline">{u.serialNumber}</LoadingLink><div className="text-xs text-[var(--ejo-text-muted)]">{u.number}</div></td>
                  <td data-label="Product" className={td}>{u.product.name}{u.configuration ? <div className="text-xs text-[var(--ejo-text-muted)]">{u.configuration.name}</div> : null}</td>
                  <td data-label="Build order" className={td}>{u.buildOrder ? <LoadingLink href={`/production/build-orders/${u.buildOrder.id}`} className="text-[var(--ejo-primary)] hover:underline">{u.buildOrder.number}</LoadingLink> : '—'}</td>
                  <td data-label="Stage" className={td}><StatusChip status={u.stage} label={UNIT_STAGE_LABEL[u.stage as UnitStageCode]} />{u.reworkCount ? <span className="ml-2 text-xs text-[var(--ejo-warning-text)]">rework ×{u.reworkCount}</span> : null}</td>
                  <td data-label="Assembler" className={td}>{u.assembledByName ?? '—'}</td>
                  <td data-label="QA" className={td}>{u.qaByName ? `${u.qaByName} · ${u.qaPassed ? 'passed' : 'failed'}` : '—'}</td>
                  <td data-label="Last change" className={`${td} text-xs text-[var(--ejo-text-muted)]`}>{formatDateTime(u.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      )}
    </div>
  );
}
