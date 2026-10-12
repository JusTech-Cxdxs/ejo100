'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { markAllNoticesRead, markNoticeRead } from '@/lib/customer-portal/actions';

export type NoticeView = { key: string; title: string; body: string; at: string; when: string; href: string; icon: string; tone: string; read: boolean; broadcast: boolean };

const TONE: Record<string, string> = {
  info: 'bg-[var(--ejo-info)]/10 text-[var(--ejo-info)]',
  progress: 'bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]',
  attention: 'bg-[var(--ejo-warning)]/15 text-[#b45309] dark:text-[var(--ejo-warning)]',
  success: 'bg-[var(--ejo-success)]/12 text-[var(--ejo-success)]',
  neutral: 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]',
  danger: 'bg-[var(--ejo-error)]/10 text-[var(--ejo-error)]',
};

/** The full notification feed with read / unread, mark one and mark all. */
export function NoticeList({ initial }: { initial: NoticeView[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [only, setOnly] = useState<'all' | 'unread'>('all');
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const unread = items.filter((i) => !i.read).length;
  const shown = useMemo(() => (only === 'unread' ? items.filter((i) => !i.read) : items), [items, only]);

  function markOne(key: string) {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, read: true } : i)));
    start(async () => { await markNoticeRead(key); router.refresh(); });
  }
  function markAll() {
    setItems((list) => list.map((i) => ({ ...i, read: true })));
    start(async () => {
      const r = await markAllNoticesRead();
      setFlash(r.ok ? 'All caught up — everything is marked as read.' : 'We couldn’t update that. Please try again.');
      router.refresh();
      setTimeout(() => setFlash(null), 3500);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-1" role="group" aria-label="Show">
          {(['all', 'unread'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setOnly(k)} aria-pressed={only === k} className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${only === k ? 'bg-[var(--ejo-bg)] text-[var(--ejo-text)] shadow-sm' : 'text-[var(--ejo-text-muted)]'}`}>
              {k === 'all' ? 'All' : `Unread (${unread})`}
            </button>
          ))}
        </div>
        <button type="button" onClick={markAll} disabled={!unread || pending} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-2 text-sm font-medium text-[var(--ejo-primary)] disabled:cursor-not-allowed disabled:opacity-50">
          <Icon name="check" size={15} strokeWidth={2.4} /> Mark all as read
        </button>
      </div>
      {flash ? <p role="status" className="ejo-rise rounded-[var(--ejo-radius-md)] border border-[var(--ejo-success)]/30 bg-[var(--ejo-success)]/[0.08] px-3.5 py-2.5 text-sm text-[var(--ejo-text)]">{flash}</p> : null}

      {shown.length ? (
        <ul className="overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)]" data-testid="notification-list">
          {shown.map((n, idx) => (
            <li key={n.key} className={`ejo-rise flex gap-3 border-b border-[var(--ejo-border)] px-4 py-4 last:border-b-0 ${n.read ? '' : 'bg-[var(--ejo-primary)]/[0.04]'} ${n.broadcast ? 'border-l-4 border-l-[var(--ejo-primary)]' : ''}`} style={{ animationDelay: `${Math.min(idx, 12) * 30}ms` }}>
              <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONE[n.tone] ?? TONE.info}`}><Icon name={n.icon} size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <Link href={n.href} onClick={() => { if (!n.read) markOne(n.key); }} className={`text-sm hover:text-[var(--ejo-primary)] ${n.read ? 'text-[var(--ejo-text)]' : 'font-semibold text-[var(--ejo-text)]'}`}>
                    {n.broadcast ? <span className="mr-1.5 rounded bg-[var(--ejo-primary)]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ejo-primary)]">Announcement</span> : null}
                    {n.title}
                  </Link>
                  <time dateTime={n.at} className="text-xs text-[var(--ejo-text-muted)]">{n.when}</time>
                </div>
                <p className={`mt-0.5 text-sm text-[var(--ejo-text-muted)] ${n.broadcast ? 'whitespace-pre-line' : ''}`}>{n.body}</p>
              </div>
              {!n.read ? (
                <button type="button" onClick={() => markOne(n.key)} className="mt-1 flex h-7 shrink-0 items-center gap-1 self-start rounded-full px-2 text-xs font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/10" aria-label={`Mark “${n.title}” as read`}>
                  <span className="h-2 w-2 rounded-full bg-[var(--ejo-primary)]" aria-hidden="true" /> <span className="hidden sm:inline">Mark read</span>
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-[var(--ejo-radius-lg)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-6 py-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name="bell" size={22} /></span>
          <p className="mt-3 text-sm font-semibold text-[var(--ejo-text)]">{only === 'unread' ? 'You’re all caught up' : 'No notifications yet'}</p>
          <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">Estimates, payments and progress on your vehicle appear here.</p>
        </div>
      )}
    </div>
  );
}
