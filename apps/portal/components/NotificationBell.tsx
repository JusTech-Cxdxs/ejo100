'use client';

import { useState, useRef, useEffect } from 'react';
import { LoadingLink } from '@/components/LoadingLink';
import type { DashboardNotification } from '@/lib/actions/dashboard';

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * A real, standing count of genuinely pending items for this viewer —
 * never a decorative badge. Clicking an item takes the viewer
 * straight to the real place it needs resolving, the same real
 * pattern already used everywhere else in this system (a
 * notification is never an end in itself, only ever a door to the
 * real thing).
 */
export function NotificationBell({ notifications }: { notifications: DashboardNotification[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]"
      >
        🔔
        {notifications.length > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--ejo-error)] px-1 text-[10px] font-bold text-white">
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] shadow-lg">
          <div className="border-b border-[var(--ejo-border)] px-4 py-3">
            <p className="text-sm font-semibold text-[var(--ejo-text)]">Notifications</p>
            <p className="text-xs text-[var(--ejo-text-muted)]">
              {notifications.length === 0 ? 'Nothing genuinely pending right now.' : `${notifications.length} real item${notifications.length === 1 ? '' : 's'} need your attention.`}
            </p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[var(--ejo-text-muted)]">You&apos;re all caught up.</p>
            ) : (
              notifications.map((n) => (
                <LoadingLink
                  key={n.id}
                  href={n.url}
                  className="block border-b border-[var(--ejo-border)] px-4 py-3 last:border-0 hover:bg-[var(--ejo-bg)]"
                >
                  <p className="text-sm font-medium text-[var(--ejo-text)]">{n.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">{n.detail}</p>
                  <p className="mt-1 text-[10px] text-[var(--ejo-text-muted)]">{timeAgo(n.createdAt)}</p>
                </LoadingLink>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
