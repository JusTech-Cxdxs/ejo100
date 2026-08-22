'use client';

import { useNavigationLoading } from './NavigationLoadingProvider';

const TABS = [
  { label: 'All', value: undefined },
  { label: 'Passenger', value: 'PASSENGER' },
  { label: 'Commercial', value: 'COMMERCIAL' },
] as const;

/**
 * The All / Passenger / Commercial filter, shared by the Vehicles and
 * Job Cards pages rather than built twice.
 *
 * Uses the same shared NavigationLoadingProvider every LoadingLink uses
 * — this used to run its own separate useTransition + small inline
 * spinner, which worked but meant two different loading mechanisms
 * coexisting in the app. Consolidated onto the one shared system so
 * there's a single, consistent "every navigation shows the branded
 * loader" story, not two.
 */
export function CategoryFilterTabs({
  basePath,
  currentType,
  preserveParams,
}: {
  basePath: string;
  currentType?: string;
  preserveParams?: Record<string, string | undefined>;
}) {
  const { navigate, isPending } = useNavigationLoading();

  function buildHref(tabValue: string | undefined): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(preserveParams ?? {})) {
      if (value) params.set(key, value);
    }
    if (tabValue) params.set('type', tabValue);
    return params.toString() ? `${basePath}?${params.toString()}` : basePath;
  }

  return (
    <div className="mb-4 flex gap-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1 w-fit">
      {TABS.map((tab) => {
        const isActive = (currentType ?? undefined) === tab.value;
        return (
          <button
            key={tab.label}
            type="button"
            disabled={isPending}
            onClick={() => navigate(buildHref(tab.value))}
            className={`rounded-[calc(var(--ejo-radius-md)-2px)] px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
              isActive
                ? 'bg-[var(--ejo-primary)] text-white'
                : 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
