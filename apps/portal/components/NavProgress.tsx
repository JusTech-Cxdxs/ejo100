'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * A thin brand-coloured bar at the very top that starts the moment a link to
 * another page is pressed and finishes when the new page is on screen — so a
 * click never feels ignored while a slower page loads. Respects reduced motion.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      let url: URL;
      try { url = new URL(a.href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin || url.protocol.startsWith('mailto') || url.pathname.startsWith('/api/')) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setState('loading');
      if (safety.current) clearTimeout(safety.current);
      safety.current = setTimeout(() => setState('idle'), 20_000);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // The new page is here: finish the bar, then hide it.
  useEffect(() => {
    setState((s) => (s === 'loading' ? 'done' : s));
    const t = setTimeout(() => setState((s) => (s === 'done' ? 'idle' : s)), 350);
    return () => clearTimeout(t);
  }, [pathname, search]);

  if (state === 'idle') return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-0.5">
      <div
        className="h-full bg-[var(--ejo-primary)] shadow-[0_0_8px_var(--ejo-primary)]"
        style={state === 'loading'
          ? { width: '90%', animation: 'ejo-nav-grow 8s cubic-bezier(0.1, 0.7, 0.2, 1) both' }
          : { width: '100%', opacity: 0, transition: 'opacity 300ms ease-out' }}
      />
      <style>{'@keyframes ejo-nav-grow{from{width:0}to{width:90%}}@media (prefers-reduced-motion: reduce){[style*="ejo-nav-grow"]{animation:none!important}}'}</style>
    </div>
  );
}
