'use client';

import { useEffect, useState } from 'react';

/**
 * A small banner while the browser has no connection, so a save that cannot
 * reach the server is explained before anyone presses the button, and a
 * short "back online" note when it returns.
 */
export function OfflineNotice() {
  const [state, setState] = useState<'online' | 'offline' | 'back'>('online');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = () => { clearTimeout(timer); setState('offline'); };
    const on = () => { setState((s) => (s === 'offline' ? 'back' : s)); clearTimeout(timer); timer = setTimeout(() => setState('online'), 4000); };
    if (navigator.onLine === false) off();
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    return () => { clearTimeout(timer); window.removeEventListener('offline', off); window.removeEventListener('online', on); };
  }, []);
  if (state === 'online') return null;
  const offline = state === 'offline';
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-4">
      <p className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg motion-safe:animate-[ejo-pop_240ms_ease-out_both] ${offline ? 'bg-slate-800' : 'bg-[var(--ejo-primary)]'}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${offline ? 'bg-[var(--ejo-warning)]' : 'bg-white'}`} aria-hidden="true" />
        {offline ? 'You are offline. Changes will not be saved until the connection is back.' : 'Back online.'}
      </p>
    </div>
  );
}
