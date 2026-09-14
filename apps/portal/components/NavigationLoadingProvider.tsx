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
 * Sidebar and Topbar stay mounted (never unmount/remount) during
 * navigation, but the loading overlay itself is deliberately full
 * viewport (fixed, not scoped to just the main content area) — see
 * the real reasoning on that inside the component below.
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
          // Fixed, not absolute — the real bug this fixes. `absolute`
          // was positioned relative to this own div, which (before a
          // separate real fix made every column scroll independently)
          // could genuinely stretch to the full height of a very long
          // page's content — meaning the loader centered itself in the
          // middle of the WHOLE page, not the visible viewport, and
          // scrolled off-screen above on a long page. `fixed` is
          // always relative to the real viewport, regardless of how
          // tall the page's own content is or how far it's scrolled.
          // Deliberately covers the full viewport (Sidebar/Topbar
          // included) rather than trying to carve out a Sidebar-width,
          // Topbar-height-aware inset — those dimensions can change,
          // and a loader that's occasionally, briefly full-screen is a
          // far smaller real problem than one that's sometimes
          // invisible.
          <div className="fixed inset-0 z-10 bg-[var(--ejo-bg)]">
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
