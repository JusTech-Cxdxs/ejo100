'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EjoSpinner } from './EjoSpinner';

const TABS = [
  { label: 'All', value: undefined },
  { label: 'Passenger', value: 'PASSENGER' },
  { label: 'Commercial', value: 'COMMERCIAL' },
] as const;

/**
 * The All / Passenger / Commercial filter, shared by the Vehicles and
 * Job Cards pages rather than built twice.
 *
 * Deliberately a Client Component using `useTransition` + `router.push`
 * for guaranteed, explicit pending feedback on the click itself, rather
 * than relying solely on the ambient `loading.tsx` Suspense boundary —
 * that mechanism has already shown one real gap in this project
 * (sibling-route navigation not reliably re-triggering an ancestor
 * boundary), so a control this frequently used gets its own guaranteed
 * feedback instead of depending on that timing being exactly right.
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function buildHref(tabValue: string | undefined): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(preserveParams ?? {})) {
      if (value) params.set(key, value);
    }
    if (tabValue) params.set('type', tabValue);
    return params.toString() ? `${basePath}?${params.toString()}` : basePath;
  }

  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="flex gap-1 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1 w-fit">
        {TABS.map((tab) => {
          const isActive = (currentType ?? undefined) === tab.value;
          return (
            <button
              key={tab.label}
              type="button"
              disabled={isPending}
              onClick={() => startTransition(() => router.push(buildHref(tab.value)))}
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
      {isPending ? <EjoSpinner size={16} /> : null}
    </div>
  );
}
