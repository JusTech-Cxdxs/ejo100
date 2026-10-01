'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useNotifications } from '@/components/NotificationProvider';
import { BROADCAST_CATEGORY, AREA_LABEL } from '@/lib/notification-rules';

function timeAgo(date: Date): string {
  const sec = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (sec < 60) return 'just now';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'} ago`;
}

/** The bell — reads the shared live source (no requests of its own). */
export function NotificationBell() {
  const { summary: s, muted, toggleMute, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  async function openItem(key: string | null) {
    setOpen(false);
    if (key) await markRead(key);
  }

  const total = s.total;
  const row = 'block px-4 py-2.5 hover:bg-[var(--ejo-bg)]';
  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button type="button" onClick={() => toggleMute()} aria-label={muted ? 'Unmute notification sounds' : 'Mute notification sounds'} title={muted ? 'Sounds off — tap to turn on' : 'Sounds on — tap to mute'} className="hidden px-1 text-xs text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)] sm:inline">
        {muted ? '🔇' : '🔊'}
      </button>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={`Notifications${total ? ` — ${total} new` : ''}`} className={`relative text-lg text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)] ${s.actions.length && !muted ? 'ejo-bell-ring' : ''}`}>
        {muted ? '🔕' : '🔔'}
        {total > 0 ? (
          <span className={`absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${s.actions.length ? 'bg-[var(--ejo-error)]' : 'bg-[var(--ejo-primary)]'}`}>{total > 99 ? '99+' : total}</span>
        ) : null}
      </button>
      <style>{`.ejo-bell-ring{animation:ejo-ring 2.5s ease-in-out infinite;transform-origin:50% 0}@keyframes ejo-ring{0%,80%,100%{transform:rotate(0)}84%{transform:rotate(14deg)}88%{transform:rotate(-12deg)}92%{transform:rotate(8deg)}96%{transform:rotate(-4deg)}}`}</style>
      {open ? (
        <div className="fixed inset-x-2 top-14 z-50 max-h-[75vh] overflow-y-auto rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[26rem]">
          <div className="flex items-center justify-between border-b border-[var(--ejo-border)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[var(--ejo-text)]">Notifications</p>
              <p className="text-xs text-[var(--ejo-text-muted)]">{total === 0 ? "You're all caught up." : `${total} ${total === 1 ? 'item needs' : 'items need'} your attention`}</p>
            </div>
            <button type="button" onClick={() => toggleMute()} className="text-xs text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)] sm:hidden">{muted ? '🔇 Sounds off' : '🔊 Sounds on'}</button>
          </div>
          {s.actions.length ? (
            <div className="border-b border-[var(--ejo-border)]">
              <p className="bg-[var(--ejo-error)]/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-error)]">Action required ({s.actions.length})</p>
              {s.actions.slice(0, 6).map((n) => (
                <Link key={n.id} href={n.url} onClick={() => void openItem(null)} className={row}>
                  <p className="text-sm font-medium text-[var(--ejo-text)]">{n.title}</p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">{n.detail}</p>
                </Link>
              ))}
            </div>
          ) : null}
          {s.unreadBroadcasts.length ? (
            <div className="border-b border-[var(--ejo-border)]">
              <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">Broadcasts ({s.unreadBroadcasts.length})</p>
              {s.unreadBroadcasts.slice(0, 4).map((b) => (
                <Link key={b.key} href={`/notifications?tab=broadcasts#${b.id}`} onClick={() => void openItem(b.key)} className={row}>
                  <p className="text-sm font-medium text-[var(--ejo-text)]">{BROADCAST_CATEGORY[b.category]?.icon} {b.title}</p>
                  <p className="line-clamp-2 text-xs text-[var(--ejo-text-muted)]">{b.message}</p>
                </Link>
              ))}
            </div>
          ) : null}
          {s.unreadActivity.length ? (
            <div>
              <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">New activity ({s.unreadActivity.length})</p>
              {s.unreadActivity.slice(0, 6).map((a) => (
                <Link key={a.key} href={a.url} onClick={() => void openItem(a.key)} className={row}>
                  <p className="text-sm text-[var(--ejo-text)]">{a.title}</p>
                  <p className="text-xs text-[var(--ejo-text-muted)]">{AREA_LABEL[a.area]} · {a.actor ?? 'System'} · {timeAgo(a.at)}</p>
                </Link>
              ))}
            </div>
          ) : null}
          <Link href="/notifications" onClick={() => setOpen(false)} className="block border-t border-[var(--ejo-border)] px-4 py-2.5 text-center text-xs font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-bg)]">Open the Notification Center →</Link>
        </div>
      ) : null}
    </div>
  );
}
