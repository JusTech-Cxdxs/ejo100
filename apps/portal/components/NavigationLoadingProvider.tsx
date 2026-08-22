'use client';

import { createContext, useContext, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoading } from './PageLoading';

type NavigationLoadingContextValue = {
  isPending: boolean;
  navigate: (href: string) => void;
};

const NavigationLoadingContext = createContext<NavigationLoadingContextValue | null>(null);

/**
 * The single, shared mechanism for "every navigation shows the branded
 * EJO loader" — built once here, used everywhere via `<LoadingLink>`
 * instead of plain `next/link`, rather than re-solved per page.
 *
 * This exists because relying purely on Next.js's ambient `loading.tsx`
 * Suspense boundaries has proven unreliable for several real navigation
 * patterns in this app already (sibling routes not reliably re-firing a
 * shared ancestor boundary; a dynamic `[id]` route not always
 * suspending the way a plain route does) — each one required its own
 * investigation and fix. Rather than keep chasing individual gaps,
 * this ties the loading state directly and deterministically to the
 * click itself via `useTransition` + `router.push`, the same proven
 * pattern already used successfully for the Workshop filter tabs —
 * independent of whatever the ambient Suspense boundary happens to do.
 *
 * Wraps `<main>` in the shared (app) layout, not the whole viewport —
 * Sidebar and Topbar stay mounted and visible during navigation, same
 * principle as every other loading UI in this app.
 */
export function NavigationLoadingProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => router.push(href));
  }

  return (
    <NavigationLoadingContext.Provider value={{ isPending, navigate }}>
      <div className="relative flex-1">
        {isPending ? (
          <div className="absolute inset-0 z-10 bg-[var(--ejo-bg)]">
            <PageLoading />
          </div>
        ) : null}
        {children}
      </div>
    </NavigationLoadingContext.Provider>
  );
}

/** Thrown deliberately if used outside the provider — a silent no-op
 * fallback would make it too easy to add a LoadingLink somewhere the
 * provider isn't mounted and never notice it's not actually working. */
export function useNavigationLoading(): NavigationLoadingContextValue {
  const ctx = useContext(NavigationLoadingContext);
  if (!ctx) {
    throw new Error('useNavigationLoading must be used within a NavigationLoadingProvider');
  }
  return ctx;
}
