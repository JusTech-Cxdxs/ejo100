import { StatusChip } from '@/components/ui';
import { COVERAGE_LABEL, type Coverage } from '@/lib/service-core';
import { formatDateOnly } from '@/lib/utils/format-date';

/** One chip saying whether a serial is covered today, with the warranty number and end date beside it. */
export function CoverageChip({ coverage, compact = false }: { coverage: Coverage; compact?: boolean }) {
  const w = coverage.warranty;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StatusChip status={coverage.state} label={COVERAGE_LABEL[coverage.state]} />
      {!compact && w ? (
        <span className="text-xs text-[var(--ejo-text-muted)]">
          {w.warrantyNumber ?? ''}{w.warrantyNumber ? ' · ' : ''}{coverage.covered ? `until ${formatDateOnly(new Date(w.endsAt))}` : `ended ${formatDateOnly(new Date(w.endsAt))}`}
          {coverage.covered && coverage.daysLeft !== null ? ` (${coverage.daysLeft} ${coverage.daysLeft === 1 ? 'day' : 'days'} left)` : ''}
        </span>
      ) : null}
    </span>
  );
}
