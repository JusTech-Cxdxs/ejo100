import { SectionCard } from '@/components/ui';
import { IMPORT_CEILING, mb, recordsThatFit, type Space } from '@/lib/database-space-core';

const BAR = { ok: 'bg-[var(--ejo-success)]', warn: 'bg-[var(--ejo-warning)]', full: 'bg-[var(--ejo-error)]', unlimited: 'bg-[var(--ejo-primary)]' } as const;
const TONE = { ok: 'success', warn: 'warning', full: 'error', unlimited: 'neutral' } as const;

/** The database's size against its hosting plan, and roughly how many more records fit. */
export function DatabaseSpaceCard({ space }: { space: Space }) {
  if (!space.limitBytes) {
    return (
      <SectionCard id="database-space" icon="layers" tone="neutral" title="Database space" description="No plan limit is set (DATABASE_SPACE_LIMIT_MB is 0), so imports are not checked against one." />
    );
  }
  const pct = Math.min(100, Math.round((space.share ?? 0) * 100));
  const nf = (n: number | null) => (n ?? 0).toLocaleString('en-NG');
  return (
    <SectionCard
      id="database-space"
      icon="layers"
      tone={TONE[space.level]}
      title="Database space"
      description={`The database’s hosting plan allows ${mb(space.limitBytes)}; past it nothing can be saved. Every record loaded keeps its history in the audit trail, which is never deleted, so imports are checked against what is left: one that would take the database past ${Math.round(IMPORT_CEILING * 100)}% is refused, and a load that gets close pauses until there is room.`}
    >
      <div className="space-y-3 pb-4 sm:pb-5">
        <p className="text-sm text-[var(--ejo-text)]">
          <span className="text-2xl font-semibold tabular-nums">{mb(space.usedBytes)}</span>{' '}
          <span className="text-[var(--ejo-text-muted)]">of {mb(space.limitBytes)} used ({pct}%)</span>
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--ejo-border)]" role="meter" aria-label="Database space used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className={`h-full rounded-full ${BAR[space.level]}`} style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
        <p className="text-xs text-[var(--ejo-text-muted)]">
          About {nf(recordsThatFit(space, 'parts'))} more parts, or {nf(recordsThatFit(space, 'customers'))} more customers, or {nf(recordsThatFit(space, 'stock'))} more opening-stock lines fit.
          {space.level === 'ok' ? '' : ' Release finished imports’ staged files below, or move the database to a bigger plan.'}
        </p>
      </div>
    </SectionCard>
  );
}
