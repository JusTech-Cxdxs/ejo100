import type { MarqueeItem } from '@/lib/actions/dashboard';

/**
 * A plain, server-rendered marquee — the scrolling itself is pure CSS
 * (a keyframe animation), never a JS setInterval loop repositioning
 * elements. That choice is deliberate: this project already had one
 * real, confirmed browser-freeze bug from unstable render logic (see
 * the Serialized Goods Receipt freeze), and a ticker that re-renders
 * on a timer is exactly the same class of risk for no real benefit
 * over CSS doing it natively.
 */
export function Marquee({ items }: { items: MarqueeItem[] }) {
  if (items.length === 0) return null;

  // Duplicated once so the CSS animation can loop seamlessly at -50%
  // rather than showing a visible jump back to the start.
  const doubled = [...items, ...items];

  return (
    <div className="overflow-hidden border-b border-[var(--ejo-border)] bg-[var(--ejo-surface)] py-1.5">
      <div className="ejo-marquee-track flex w-max gap-8">
        {doubled.map((item, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <span key={`${item.id}-${i}`} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
            <span className={item.kind === 'ANNOUNCEMENT' ? 'text-[var(--ejo-warning)]' : 'text-[var(--ejo-text-muted)]'}>
              {item.kind === 'ANNOUNCEMENT' ? '📢' : '•'}
            </span>
            <span className={item.kind === 'ANNOUNCEMENT' ? 'font-medium text-[var(--ejo-text)]' : 'text-[var(--ejo-text-muted)]'}>
              {item.text}
            </span>
          </span>
        ))}
      </div>
      <style>{`
        .ejo-marquee-track {
          animation: ejo-marquee 40s linear infinite;
        }
        @keyframes ejo-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
