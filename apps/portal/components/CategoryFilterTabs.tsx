import Link from 'next/link';

const TABS = [
  { label: 'All', value: undefined },
  { label: 'Passenger', value: 'PASSENGER' },
  { label: 'Commercial', value: 'COMMERCIAL' },
] as const;

/**
 * The All / Passenger / Commercial filter, shared by the Vehicles and
 * Job Cards pages rather than built twice — plain query-param
 * navigation (?type=PASSENGER), no client-side state needed. Preserves
 * whatever else is already in the URL (like a search query `q`) so
 * switching category doesn't clear an active search.
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
  return (
    <div className="mb-4 flex gap-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1 w-fit">
      {TABS.map((tab) => {
        const isActive = (currentType ?? undefined) === tab.value;
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(preserveParams ?? {})) {
          if (value) params.set(key, value);
        }
        if (tab.value) params.set('type', tab.value);
        const href = params.toString() ? `${basePath}?${params.toString()}` : basePath;

        return (
          <Link
            key={tab.label}
            href={href}
            className={`rounded-[calc(var(--ejo-radius-md)-2px)] px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? 'bg-[var(--ejo-primary)] text-white'
                : 'text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-bg)]'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
