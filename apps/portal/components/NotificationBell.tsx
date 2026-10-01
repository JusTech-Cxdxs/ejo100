'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';
import { getNotificationSummary, markNotificationsRead, setNotificationsMuted, type NotificationSummary } from '@/lib/actions/notifications';
import { BROADCAST_CATEGORY, AREA_LABEL } from '@/lib/notification-rules';

const POLL_MS = 20000;
const RING_MS = 120000;

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'} ago`;
}

/** A short two-tone chime, made in the browser (no sound file). */
function chime(ctx: AudioContext | null, urgent: boolean) {
  if (!ctx) return;
  const tones = urgent ? [880, 660, 880] : [660, 880];
  tones.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    const t = ctx.currentTime + i * 0.18;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.17);
  });
}

/**
 * The live bell: polls every 20 seconds (no page refresh), chimes on
 * anything new, re-rings every 2 minutes while actions are waiting, and
 * can be muted (🔕 — saved for this person on every device). When anything
 * changes the page's data refreshes, so dashboards and lists stay current.
 */
export function NotificationBell({ initial }: { initial: NotificationSummary }) {
  const router = useRouter();
  const [s, setS] = useState<NotificationSummary>(initial);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(initial.muted);
  const ref = useRef<HTMLDivElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const lastSig = useRef(initial.signature);
  const mutedRef = useRef(initial.muted);

  useEffect(() => { mutedRef.current = muted; }, [muted]);

  // Browsers only allow sound after the first tap / click.
  useEffect(() => {
    const unlock = () => {
      if (!audio.current) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) audio.current = new Ctx();
      }
      void audio.current?.resume();
    };
    window.addEventListener('pointerdown', unlock, { once: false });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  const poll = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    const next = await getNotificationSummary().catch(() => null);
    if (!next) return;
    setS(next);
    if (next.signature !== lastSig.current) {
      const grew = next.total > 0;
      lastSig.current = next.signature;
      if (grew && !mutedRef.current) chime(audio.current, next.actions.length > 0);
      router.refresh();
    }
  }, [router]);

  useEffect(() => {
    const t = setInterval(() => void poll(), POLL_MS);
    const onFocus = () => void poll();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [poll]);

  // Actions waiting → ring again every 2 minutes until they are done.
  useEffect(() => {
    if (s.actions.length === 0 || muted) return;
    const t = setInterval(() => chime(audio.current, true), RING_MS);
    return () => clearInterval(t);
  }, [s.actions.length, muted]);

  async function toggleMute() {
    const next = !muted;
    setMuted(next);
    await setNotificationsMuted(next).catch(() => setMuted(!next));
  }

  async function openItem(key: string | null) {
    setOpen(false);
    if (key) {
      await markNotificationsRead([key]).catch(() => undefined);
      void poll();
    }
  }

  const total = s.total;
  const row = 'block px-4 py-2.5 hover:bg-[var(--ejo-bg)]';
  return (
    <div ref={ref} className="relative flex items-center gap-1">
      <button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute notification sounds' : 'Mute notification sounds'} title={muted ? 'Sounds off — tap to turn on' : 'Sounds on — tap to mute'} className="hidden px-1 text-xs text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)] sm:inline">
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
            <button type="button" onClick={toggleMute} className="text-xs text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)] sm:hidden">{muted ? '🔇 Sounds off' : '🔊 Sounds on'}</button>
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
