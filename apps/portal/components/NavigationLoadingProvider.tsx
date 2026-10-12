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
 * Shows the loader for every navigation made through <LoadingLink>.
 * loading.tsx boundaries don't always re-show (sibling routes, some dynamic
 * routes), so the loading state is tied to the click with useTransition +
 * router.push instead. Wraps <main>; the sidebar and top bar stay mounted.
 */
export function NavigationLoadingProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => router.push(href));
  }

  return (
    <NavigationLoadingContext.Provider value={{ isPending, navigate }}>
      <div className="ejo-page relative min-w-0 flex-1">
        {isPending ? (
          // `fixed` so the loader stays centred in the viewport on long
          // pages. It covers the whole screen rather than guessing the
          // sidebar and top bar sizes.
          <div className="fixed inset-0 z-10 bg-[var(--ejo-bg)]">
            <PageLoading />
          </div>
        ) : null}
        {children}
      </div>
    </NavigationLoadingContext.Provider>
  );
}

/** Throws outside the provider so a missing provider is noticed at once. */
export function useNavigationLoading(): NavigationLoadingContextValue {
  const ctx = useContext(NavigationLoadingContext);
  if (!ctx) {
    throw new Error('useNavigationLoading must be used within a NavigationLoadingProvider');
  }
  return ctx;
}
