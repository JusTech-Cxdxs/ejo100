'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { playChime, primeSound } from '@/lib/customer-portal/sound';
import { markAllNoticesRead, markNoticeRead } from '@/lib/customer-portal/actions';
import { timeAgo } from '@/lib/customer-portal/format';

type Item = { key: string; title: string; body: string; at: string; href: string; icon: string; tone: string; read: boolean };

const POLL_MS = 30_000;

const ago = (iso: string) => timeAgo(new Date(iso));

const TONE_DOT: Record<string, string> = {
  info: 'bg-[var(--ejo-info)]/10 text-[var(--ejo-info)]',
  progress: 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]',
  attention: 'bg-[var(--ejo-warning)]/15 text-[#b45309] dark:text-[var(--ejo-warning)]',
  success: 'bg-[var(--ejo-success)]/12 text-[var(--ejo-success)]',
  neutral: 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]',
  danger: 'bg-[var(--ejo-error)]/10 text-[var(--ejo-error)]',
};

/**
 * The bell in the header: unread count, a dropdown of the latest items, and
 * a soft chime when something NEW arrives. Polls /api/customer/pulse every
 * 30 s, only while the tab is visible; a 401 means the session ended.
 */
export function NotificationBell({ initialUnread, onUnreadChange }: { initialUnread: number; onUnreadChange?: (n: number) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[] | null>(null);
  const [ring, setRing] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/customer/pulse', { cache: 'no-store', credentials: 'same-origin' });
      if (res.status === 401) { window.location.assign('/customer-portal/session-ended?reason=expired'); return; }
      if (!res.ok) return;
      const data = (await res.json()) as { unread: number; latestKeys: string[]; items: Item[] };
      setUnread(data.unread);
      setItems(data.items);
      const fresh = data.latestKeys.filter((k) => !seen.current?.has(k));
      if (seen.current && fresh.length) {
        playChime();
        setRing(true);
        setTimeout(() => setRing(false), 1000);
        router.refresh();
      }
      seen.current = new Set([...(seen.current ?? []), ...data.latestKeys]);
    } catch {
      /* offline for a moment — try again next time */
    }
  }, [router]);

  useEffect(() => { onUnreadChange?.(unread); }, [unread, onUnreadChange]);

  useEffect(() => {
    primeSound();
    void poll();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => void poll(), POLL_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVis = () => { if (document.visibilityState === 'visible') { void poll(); start(); } else stop(); };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [poll]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  async function openItem(it: Item) {
    setOpen(false);
    if (!it.read) {
      setItems((list) => list?.map((x) => (x.key === it.key ? { ...x, read: true } : x)) ?? null);
      setUnread((n) => Math.max(0, n - 1));
      void markNoticeRead(it.key);
    }
  }
  async function markAll() {
    setItems((list) => list?.map((x) => ({ ...x, read: true })) ?? null);
    setUnread(0);
    await markAllNoticesRead();
    router.refresh();
  }

  return (
    <div className="relative" ref={wrap}>
      <button
        ref={button}
        type="button"
        onClick={() => { setOpen((o) => !o); if (!items) void poll(); }}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
        data-testid="notification-bell"
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-bg)] text-[var(--ejo-text-muted)] transition-colors hover:text-[var(--ejo-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ejo-primary)]/40"
      >
        <span className={ring ? 'ejo-ring inline-flex' : 'inline-flex'}><Icon name="bell" size={18} /></span>
        {unread > 0 ? (
          <span className="ejo-pulse-ring absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--ejo-primary)] px-1 text-[10px] font-bold leading-none text-white" aria-hidden="true">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="ejo-pop fixed inset-x-3 top-[68px] z-50 overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[380px]" role="region" aria-label="Latest notifications">
          <div className="flex items-center justify-between border-b border-[var(--ejo-border)] px-4 py-3">
            <p className="text-sm font-semibold text-[var(--ejo-text)]">Notifications</p>
            {unread > 0 ? <button type="button" onClick={() => void markAll()} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">Mark all as read</button> : null}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items === null ? (
              <li className="px-4 py-6 text-center text-sm text-[var(--ejo-text-muted)]">Loading…</li>
            ) : items.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-[var(--ejo-text-muted)]">You’re all caught up.</li>
            ) : (
              items.map((it) => (
                <li key={it.key}>
                  <Link href={it.href} onClick={() => void openItem(it)} className={`flex gap-3 px-4 py-3 transition-colors hover:bg-[var(--ejo-surface)] ${it.read ? '' : 'bg-[var(--ejo-primary)]/[0.04]'}`}>
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE_DOT[it.tone] ?? TONE_DOT.info}`}><Icon name={it.icon} size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${it.read ? 'text-[var(--ejo-text)]' : 'font-semibold text-[var(--ejo-text)]'}`}>{it.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--ejo-text-muted)]">{it.body}</span>
                      <span className="mt-1 block text-[11px] text-[var(--ejo-text-muted)]">{ago(it.at)}</span>
                    </span>
                    {!it.read ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--ejo-primary)]" aria-label="Unread" /> : null}
                  </Link>
                </li>
              ))
            )}
          </ul>
          <Link href="/customer-portal/dashboard/notifications" onClick={() => setOpen(false)} className="block border-t border-[var(--ejo-border)] px-4 py-3 text-center text-sm font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-surface)]">
            See all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
