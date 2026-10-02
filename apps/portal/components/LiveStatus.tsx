'use client';

import { useEffect, useState } from 'react';
import { useNotifications } from '@/components/NotificationProvider';

const LABEL = { push: 'Live', polling: 'Auto-updating', offline: 'Offline' } as const;
const DOT = { push: 'bg-[var(--ejo-success)]', polling: 'bg-[var(--ejo-warning)]', offline: 'bg-[var(--ejo-error)]' } as const;
const HINT = {
  push: 'Instant updates are on — changes appear within about a second.',
  polling: 'Updating automatically every few seconds. (Instant push turns on when the Supabase settings are added.)',
  offline: 'No connection — reconnecting. Everything you see will catch up automatically.',
} as const;

/** Shows whether the portal is live, so nobody has to guess. */
export function LiveStatus() {
  const { mode, lastSync } = useNotifications();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(t); }, []);
  const ago = lastSync ? Math.max(0, Math.round((Date.now() - lastSync) / 1000)) : null;
  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-[var(--ejo-border)] px-2 py-0.5 text-[11px] text-[var(--ejo-text-muted)] md:inline-flex" title={`${HINT[mode]}${ago !== null ? ` Last update ${ago < 5 ? 'just now' : `${ago} seconds ago`}.` : ''}`}>
      <span className={`h-2 w-2 rounded-full ${DOT[mode]} ${mode !== 'offline' ? 'animate-pulse' : ''}`} />
      {LABEL[mode]}
    </span>
  );
}
