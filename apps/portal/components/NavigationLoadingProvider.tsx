'use client';

import { createContext, useContext, useEffect, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { PageLoading } from './PageLoading';
import { contentArea } from './content-area';

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
  const [area, setArea] = useState<HTMLElement | null>(null);
  useEffect(() => { setArea(contentArea()); }, []);

  function navigate(href: string) {
    startTransition(() => router.push(href));
  }

  // Covers only the working area: the menu, header and ticker stay in place.
  const overlay = (
    <div className="ejo-fade absolute inset-0 z-10 bg-[var(--ejo-bg)]/85 backdrop-blur-[1px]" role="status" aria-live="polite">
      <PageLoading />
    </div>
  );

  return (
    <NavigationLoadingContext.Provider value={{ isPending, navigate }}>
      <div className="ejo-page relative min-w-0 flex-1">
        {isPending ? (area ? createPortal(overlay, area) : overlay) : null}
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
