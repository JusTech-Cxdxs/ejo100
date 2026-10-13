'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useNotifications } from '@/components/NotificationProvider';
import { BROADCAST_CATEGORY, AREA_LABEL } from '@/lib/notification-rules';
import { Icon } from '@/components/ui/Icon';
import { ACTION_ICON, AREA_ICON, CATEGORY_ICON, CATEGORY_TILE } from '@/components/ui/notify-icons';
import { formatRelative, isSameLagosDay } from '@/lib/utils/format-date';

const timeAgo = (date: Date) => formatRelative(date);
const isToday = (d: Date) => isSameLagosDay(new Date(d), new Date());

/** The bell — reads the shared live source (no requests of its own). */
export function NotificationBell() {
  const { summary: s, state, muted, toggleMute, markRead, markManyRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function esc(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc); };
  }, []);

  async function openItem(key: string | null) {
    setOpen(false);
    if (key) await markRead(key);
  }

  const total = s.total;
  const unreadKeys = [...s.unreadActivity.map((a) => a.key), ...s.unreadBroadcasts.map((b) => b.key)];
  const today = s.unreadActivity.filter((a) => isToday(a.at));
  const earlier = s.unreadActivity.filter((a) => !isToday(a.at));
  const heading = 'flex items-center gap-2 px-4 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ejo-text-muted)]';

  const activityRow = (a: (typeof s.unreadActivity)[number]) => (
    <Link key={a.key} href={a.url} onClick={() => void openItem(a.key)} className="group flex gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--ejo-bg)]">
      <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]">
        <Icon name={AREA_ICON[a.area] ?? 'activity'} size={16} />
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--ejo-surface)] bg-[var(--ejo-primary)]" aria-label="Unread" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-sm text-[var(--ejo-text)]">{a.title}</span>
        <span className="mt-0.5 block truncate text-xs text-[var(--ejo-text-muted)]">{AREA_LABEL[a.area]} · {a.actor ?? 'System'} · {timeAgo(a.at)}</span>
      </span>
    </Link>
  );

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${total ? ` — ${total} new` : ''}`}
        aria-expanded={open}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-[var(--ejo-surface)] ${open ? 'bg-[var(--ejo-surface)] text-[var(--ejo-text)]' : 'text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]'}`}
      >
        <span className={s.actions.length && !muted ? 'ejo-bell-ring inline-flex' : 'inline-flex'}><Icon name={muted ? 'bell-off' : 'bell'} size={19} /></span>
        {total > 0 ? (
          <span className={`absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[var(--ejo-bg)] px-1 text-[10px] font-bold leading-none text-white ${s.actions.length ? 'bg-[var(--ejo-error)]' : 'bg-[var(--ejo-primary)]'}`}>{total > 99 ? '99+' : total}</span>
        ) : null}
      </button>
      <style>{`.ejo-bell-ring{animation:ejo-ring 2.5s ease-in-out infinite;transform-origin:50% 0}@keyframes ejo-ring{0%,80%,100%{transform:rotate(0)}84%{transform:rotate(14deg)}88%{transform:rotate(-12deg)}92%{transform:rotate(8deg)}96%{transform:rotate(-4deg)}}@media (prefers-reduced-motion: reduce){.ejo-bell-ring{animation:none}}`}</style>
      {open ? (
        <div className="ejo-pop fixed inset-x-2 top-[calc(4rem+env(safe-area-inset-top))] z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] shadow-2xl shadow-black/10 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[25rem]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--ejo-text)]">Notifications</p>
              <p className="text-xs text-[var(--ejo-text-muted)]">{state === 'loading' ? 'Loading your notifications…' : state === 'error' && total === 0 ? 'Couldn’t load notifications — retrying…' : total === 0 ? "You're all caught up." : `${total} ${total === 1 ? 'item needs' : 'items need'} your attention`}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {unreadKeys.length ? (
                <button type="button" onClick={() => void markManyRead(unreadKeys)} className="rounded-full px-2.5 py-1 text-xs font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/10">Mark all read</button>
              ) : null}
              <button type="button" onClick={() => toggleMute()} aria-label={muted ? 'Unmute notification sounds' : 'Mute notification sounds'} title={muted ? 'Sounds off — tap to turn on' : 'Sounds on — tap to mute'} className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--ejo-text-muted)] hover:bg-[var(--ejo-surface)] hover:text-[var(--ejo-text)]">
                <Icon name={muted ? 'bell-off' : 'bell'} size={15} />
              </button>
            </div>
          </div>

          <div className="ejo-scroll min-h-0 flex-1 overflow-y-auto pb-1">
            {total === 0 && state !== 'loading' ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><span className="ejo-float inline-flex"><Icon name="check-circle" size={22} /></span></span>
                <p className="text-sm font-semibold text-[var(--ejo-text)]">All caught up</p>
                <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">New approvals, broadcasts and activity will appear here.</p>
              </div>
            ) : null}

            {s.actions.length ? (
              <div>
                <p className={`${heading} text-[var(--ejo-error)]`}><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ejo-error)]" />Needs you ({s.actions.length})</p>
                {s.actions.slice(0, 6).map((n) => (
                  <Link key={n.id} href={n.url} onClick={() => void openItem(null)} className="group flex gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--ejo-bg)]">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]"><Icon name={ACTION_ICON[n.kind] ?? 'bolt'} size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[var(--ejo-text)]">{n.title}</span>
                      <span className="line-clamp-2 block text-xs text-[var(--ejo-text-muted)]">{n.detail}</span>
                    </span>
                    <span className="self-center text-[var(--ejo-text-muted)] opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true"><Icon name="chevron-right" size={15} /></span>
                  </Link>
                ))}
                {s.actions.length > 6 ? <Link href="/notifications" onClick={() => setOpen(false)} className="block px-4 pb-1 text-xs text-[var(--ejo-primary)] hover:underline">+{s.actions.length - 6} more waiting</Link> : null}
              </div>
            ) : null}

            {s.unreadBroadcasts.length ? (
              <div>
                <p className={heading}><Icon name="megaphone" size={12} />Broadcasts ({s.unreadBroadcasts.length})</p>
                <div className="space-y-2 px-3 pb-1">
                  {s.unreadBroadcasts.slice(0, 4).map((b) => {
                    const cat = BROADCAST_CATEGORY[b.category];
                    return (
                      <Link key={b.key} href={`/notifications?tab=broadcasts#${b.id}`} onClick={() => void openItem(b.key)} className="ejo-lift flex gap-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-3">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${CATEGORY_TILE[b.category] ?? 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]'}`}><Icon name={CATEGORY_ICON[b.category] ?? 'megaphone'} size={16} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--ejo-text-muted)]">{cat?.label ?? 'Broadcast'}</span>
                          <span className="block text-sm font-medium text-[var(--ejo-text)]">{b.title}</span>
                          <span className="line-clamp-2 block text-xs text-[var(--ejo-text-muted)]">{b.message}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {today.length ? (
              <div>
                <p className={heading}>Today</p>
                {today.slice(0, 6).map(activityRow)}
              </div>
            ) : null}
            {earlier.length && today.length < 6 ? (
              <div>
                <p className={heading}>Earlier</p>
                {earlier.slice(0, 6 - today.length).map(activityRow)}
              </div>
            ) : null}
          </div>

          <Link href="/notifications" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1.5 border-t border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-2.5 text-xs font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/5">
            Open the Notification Center <Icon name="arrow-right" size={13} />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
