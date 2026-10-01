"use client";

import Link from 'next/link';
import { useNotifications } from '@/components/NotificationProvider';
import { BROADCAST_CATEGORY } from '@/lib/notification-rules';

type Item = { id: string; text: string; url: string; icon: string; tone: string };

/**
 * The scrolling bar: live broadcasts you have not read, actions waiting for
 * you and new activity — each a link to its exact page, staying until read
 * or done. Reads the shared live source; pure CSS scrolling, pauses on hover.
 */
export function Marquee() {
  const { summary } = useNotifications();
  const items: Item[] = [
    ...summary.unreadBroadcasts.map((b) => ({ id: `bc-${b.id}`, text: `${b.title} — ${b.message.split('\n')[0]}`, url: `/notifications?tab=broadcasts#${b.id}`, icon: BROADCAST_CATEGORY[b.category]?.icon ?? '📢', tone: ['URGENT', 'SECURITY_ALERT'].includes(b.category) ? 'font-semibold text-[var(--ejo-error)]' : 'font-medium text-[var(--ejo-text)]' })),
    ...summary.actions.slice(0, 8).map((n) => ({ id: `act-${n.id}`, text: n.title, url: n.url, icon: '⏳', tone: 'text-[var(--ejo-warning)]' })),
    ...summary.unreadActivity.slice(0, 6).map((a) => ({ id: `new-${a.id}`, text: a.title, url: a.url, icon: '•', tone: 'text-[var(--ejo-text-muted)]' })),
  ];
  if (items.length === 0) return null;
  const doubled = [...items, ...items];
  return (
    <div className="ejo-marquee w-full overflow-hidden border-b border-[var(--ejo-border)] bg-[var(--ejo-surface)] py-1.5">
      <div className="ejo-marquee-track flex w-max gap-10" style={{ animationDuration: `${Math.max(30, items.length * 8)}s` }}>
        {doubled.map((item, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Link key={`${item.id}-${i}`} href={item.url} className="flex items-center gap-1.5 whitespace-nowrap text-xs hover:underline">
            <span>{item.icon}</span>
            <span className={item.tone}>{item.text}</span>
          </Link>
        ))}
      </div>
      <style>{`
        .ejo-marquee-track { animation: ejo-marquee linear infinite; }
        .ejo-marquee:hover .ejo-marquee-track { animation-play-state: paused; }
        @keyframes ejo-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>
    </div>
  );
}
