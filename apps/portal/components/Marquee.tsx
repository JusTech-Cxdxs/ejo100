"use client";

import Link from 'next/link';
import { useNotifications } from '@/components/NotificationProvider';
import { Icon, type IconName } from '@/components/ui/Icon';
import { CATEGORY_ICON } from '@/components/ui/notify-icons';

type Item = { id: string; text: string; url: string; icon: IconName; tone: string; iconTone: string };

/**
 * The scrolling bar: live broadcasts you have not read, actions waiting for
 * you and new activity — each a link to its exact page, staying until read
 * or done. Reads the shared live source; pure CSS scrolling, pauses on hover
 * (and stands still for people who prefer reduced motion).
 */
export function Marquee() {
  const { summary } = useNotifications();
  const items: Item[] = [
    ...summary.unreadBroadcasts.map((b): Item => {
      const alarm = ['URGENT', 'SECURITY_ALERT'].includes(b.category);
      return { id: `bc-${b.id}`, text: `${b.title} — ${b.message.split('\n')[0]}`, url: `/notifications?tab=broadcasts#${b.id}`, icon: CATEGORY_ICON[b.category] ?? 'megaphone', tone: alarm ? 'font-semibold text-[var(--ejo-error)]' : 'font-medium text-[var(--ejo-text)]', iconTone: alarm ? 'bg-[var(--ejo-error)]/12 text-[var(--ejo-error)]' : 'bg-[var(--ejo-primary)]/12 text-[var(--ejo-primary)]' };
    }),
    ...summary.actions.slice(0, 8).map((n) => ({ id: `act-${n.id}`, text: n.title, url: n.url, icon: 'clock' as IconName, tone: 'font-medium text-[var(--ejo-warning-text)]', iconTone: 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]' })),
    ...summary.unreadActivity.slice(0, 6).map((a) => ({ id: `new-${a.id}`, text: a.title, url: a.url, icon: 'activity' as IconName, tone: 'text-[var(--ejo-text-muted)]', iconTone: 'bg-[var(--ejo-text-muted)]/10 text-[var(--ejo-text-muted)]' })),
  ];
  if (items.length === 0) return null;
  const doubled = [...items, ...items];
  return (
    <div className="ejo-marquee relative flex w-full shrink-0 items-center overflow-hidden border-b border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
      <span className="relative z-10 flex shrink-0 items-center gap-1.5 self-stretch bg-[var(--ejo-surface)] pl-3 pr-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ejo-primary)] sm:pl-5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ejo-primary)]" aria-hidden="true" />
        <span className="hidden sm:inline">Latest</span>
      </span>
      <div className="min-w-0 flex-1 overflow-hidden py-0.5 [mask-image:linear-gradient(90deg,transparent,#000_24px,#000_calc(100%-24px),transparent)]">
        <div className="ejo-marquee-track flex w-max" style={{ animationDuration: `${Math.max(30, items.length * 8)}s` }}>
          {doubled.map((item, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Link key={`${item.id}-${i}`} href={item.url} aria-hidden={i >= items.length ? true : undefined} tabIndex={i >= items.length ? -1 : undefined} className="group flex items-center gap-2 whitespace-nowrap py-1 pr-8 text-xs">
              <span className={`flex h-5 w-5 items-center justify-center rounded-md ${item.iconTone}`}><Icon name={item.icon} size={12} strokeWidth={2} /></span>
              <span className={`${item.tone} group-hover:underline`}>{item.text}</span>
            </Link>
          ))}
        </div>
      </div>
      {/* Spacing sits inside each item (pr-8), not in a flex gap, so the two
          copies are exactly the same width and the loop at -50% never jumps. */}
      <style>{`
        .ejo-marquee-track { animation: ejo-marquee linear infinite; }
        .ejo-marquee:hover .ejo-marquee-track, .ejo-marquee:focus-within .ejo-marquee-track { animation-play-state: paused; }
        @keyframes ejo-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) { .ejo-marquee-track { animation: none; } }
      `}</style>
    </div>
  );
}
