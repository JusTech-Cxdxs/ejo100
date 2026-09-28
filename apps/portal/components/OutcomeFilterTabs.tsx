import { LoadingLink } from '@/components/LoadingLink';
import { OUTCOME_FILTERS, type OutcomeFilter } from '@/lib/visit-outcome';

/**
 * How visits ended — works together with the Passenger / Commercial tabs
 * (it keeps the current type and search), never replacing them.
 */
export function OutcomeFilterTabs({ basePath, current, preserveParams, counts }: { basePath: string; current?: OutcomeFilter; preserveParams: Record<string, string | undefined>; counts: Record<string, number> }) {
  const href = (key?: OutcomeFilter) => {
    const params = Object.entries({ ...preserveParams, outcome: key }).filter(([, v]) => v);
    return params.length ? `${basePath}?${params.map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&')}` : basePath;
  };
  const pill = (on: boolean) => `rounded-full px-3 py-1 text-xs font-medium ${on ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'}`;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs text-[var(--ejo-text-muted)]">Outcome:</span>
      <LoadingLink href={href()} className={pill(!current)}>All</LoadingLink>
      {OUTCOME_FILTERS.map((f) => (
        <LoadingLink key={f.key} href={href(f.key)} className={pill(current === f.key)}>
          {f.label} ({counts[f.key] ?? 0})
        </LoadingLink>
      ))}
    </div>
  );
}
