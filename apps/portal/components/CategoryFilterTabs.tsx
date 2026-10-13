'use client';

import { useNavigationLoading } from './NavigationLoadingProvider';

const TABS = [
  { label: 'All', value: undefined },
  { label: 'Passenger', value: 'PASSENGER' },
  { label: 'Commercial', value: 'COMMERCIAL' },
] as const;

/**
 * The All / Passenger / Commercial filter used on list pages. Navigates
 * through NavigationLoadingProvider so it shows the same loader as links.
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
