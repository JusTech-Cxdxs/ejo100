'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Counts page views for the website's own visitor report, and the time a page
 * is actually in view (hidden tabs do not count). Anonymous; nothing is sent
 * when the browser asks not to be tracked. Never affects the page.
 */
export function VisitTracker() {
  const path = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined' || !path) return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl) return;
    let session = '';
    try {
      session = sessionStorage.getItem('ejo-visit-session') ?? '';
      if (!session) { session = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); sessionStorage.setItem('ejo-visit-session', session); }
    } catch { /* private mode */ }

    // This page's view: its id (once the server has counted it) and the time it was in view.
    const v = { id: null as string | null, shown: 0, since: document.visibilityState === 'visible' ? Date.now() : null as number | null };
    const leave = () => {
      if (!v.id) return;
      const body = JSON.stringify({ event: 'leave', id: v.id, seconds: Math.round((v.shown + (v.since ? Date.now() - v.since : 0)) / 1000) });
      try { if (!navigator.sendBeacon?.('/api/visit', new Blob([body], { type: 'text/plain' }))) void fetch('/api/visit', { method: 'POST', body, keepalive: true }); } catch { /* ignore */ }
    };
    let alive = true;
    fetch('/api/visit', { method: 'POST', body: JSON.stringify({ event: 'view', path, ref: document.referrer, session }), keepalive: true })
      .then((r) => (r.status === 200 ? (r.json() as Promise<{ id?: string }>) : null))
      .then((j) => { if (j?.id) v.id = j.id; if (!alive) leave(); })
      .catch(() => { /* ignore */ });

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (v.since) { v.shown += Date.now() - v.since; v.since = null; }
        leave();
      } else if (!v.since) v.since = Date.now();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', leave);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [path]);

  return null;
}
