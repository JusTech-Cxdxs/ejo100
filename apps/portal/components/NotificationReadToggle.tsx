'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { markNotificationsRead, markNotificationsUnread, markAllRead } from '@/lib/actions/notifications';

/**
 * Mark read / mark unread — flips instantly in the browser, saves in the
 * background (no page reload, no waiting). If saving fails it flips back.
 */
export function NotificationReadToggle({ itemKey, read: initial }: { itemKey: string; read: boolean }) {
  const router = useRouter();
  const [read, setRead] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [, start] = useTransition();
  const toggle = () => {
    const next = !read;
    setRead(next);
    setFailed(false);
    (next ? markNotificationsRead([itemKey]) : markNotificationsUnread([itemKey]))
      .then(() => start(() => router.refresh()))
      .catch(() => { setRead(!next); setFailed(true); });
  };
  return (
    <button type="button" onClick={toggle} className="shrink-0 text-xs text-[var(--ejo-primary)] hover:underline" aria-pressed={read}>
      {failed ? 'Could not save — try again' : read ? 'Mark unread' : 'Mark read'}
    </button>
  );
}

/** The item itself: opening it also marks it read (in the background). */
export function NotificationOpenLink({ href, itemKey, read, children, className }: { href: string; itemKey: string; read: boolean; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={className} onClick={() => { if (!read) void markNotificationsRead([itemKey]).catch(() => undefined); }}>
      {children}
    </Link>
  );
}

export function MarkAllReadButton({ kind }: { kind: 'activity' | 'broadcasts' }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'failed'>('idle');
  const [, start] = useTransition();
  return (
    <button
      type="button"
      disabled={state === 'saving'}
      onClick={() => { setState('saving'); markAllRead(kind).then(() => { setState('done'); start(() => router.refresh()); }).catch(() => setState('failed')); }}
      className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1.5 text-xs font-medium text-[var(--ejo-text)] disabled:opacity-60"
    >
      {state === 'saving' ? 'Marking…' : state === 'failed' ? 'Could not save — try again' : 'Mark all as read'}
    </button>
  );
}
