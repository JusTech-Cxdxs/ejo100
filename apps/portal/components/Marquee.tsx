import Link from 'next/link';
import type { MarqueeItem } from '@/lib/actions/dashboard';

/**
 * The scrolling bar under the top bar: live broadcasts you have not read,
 * actions waiting for you and new activity — each a link to its exact
 * page, staying until read or done. Pure CSS scrolling; pauses on hover so
 * an item can be clicked.
 */
export function Marquee({ items }: { items: MarqueeItem[] }) {
  if (items.length === 0) return null;
  const doubled = [...items, ...items];
  const seconds = Math.max(30, items.length * 8);
  return (
    <div className="ejo-marquee w-full overflow-hidden border-b border-[var(--ejo-border)] bg-[var(--ejo-surface)] py-1.5">
      <div className="ejo-marquee-track flex w-max gap-10" style={{ animationDuration: `${seconds}s` }}>
        {doubled.map((item, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <Link key={`${item.id}-${i}`} href={item.url} className="flex items-center gap-1.5 whitespace-nowrap text-xs hover:underline">
            <span>{item.icon}</span>
            <span className={item.urgent ? 'font-semibold text-[var(--ejo-error)]' : item.kind === 'BROADCAST' ? 'font-medium text-[var(--ejo-text)]' : item.kind === 'ACTION' ? 'text-[var(--ejo-warning)]' : 'text-[var(--ejo-text-muted)]'}>{item.text}</span>
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
