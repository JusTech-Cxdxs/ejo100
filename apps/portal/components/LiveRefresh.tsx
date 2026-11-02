'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** A board that keeps itself current: the page's data is re-read every `seconds` while the tab is visible. */
export function LiveRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') router.refresh(); };
    const t = setInterval(tick, Math.max(10, seconds) * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
