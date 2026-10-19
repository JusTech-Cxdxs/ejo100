'use client';

import { useEffect, useRef, useState } from 'react';
import { MILESTONES } from '@/lib/content/group';

/**
 * The heritage ribbon: the group's milestones on one horizontal line, with
 * the year large and the story beneath. It scrolls sideways (snapping to each
 * moment) and the line itself is the design — no cards. Keyboard: the
 * arrows move along it; the strip is focusable and scrolls with the keys.
 */
export function Ribbon() {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const step = 288 + 40; // one moment's width plus the gap (see min-w-[18rem] and gap-10)

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => setAt(Math.round(el.scrollLeft / step));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [step]);

  const go = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * step * 2, behavior: 'smooth' });
  };

  return (
    <div className="relative mt-10 sm:mt-14">
      <div ref={ref} className="ejo-ribbon ejo-bleed-pad flex gap-10 overflow-x-auto pb-14 pt-2" role="list" aria-label="Milestones">
        {MILESTONES.map((m, i) => (
          <article key={m.year + m.title} role="listitem" className="relative min-w-[18rem] max-w-[18rem] shrink-0 pt-10">
            {/* the line, the dot */}
            <span aria-hidden className={`absolute left-0 right-[-2.5rem] top-[3.25rem] h-px ${i === MILESTONES.length - 1 ? 'right-0 bg-gradient-to-r from-[var(--ejo-border)] to-transparent' : 'bg-[var(--ejo-border)]'}`} />
            <span aria-hidden className={`absolute left-0 top-[2.9rem] h-3 w-3 rounded-full ring-4 ring-[var(--ejo-bg)] ${i === MILESTONES.length - 1 ? 'bg-[var(--ejo-primary)] shadow-[0_0_0_6px_rgba(34,152,63,0.18)]' : 'bg-[var(--ejo-text-muted)]'}`} />
            <p className={`absolute left-0 top-0 text-[2rem] font-extrabold leading-none tracking-[-0.03em] ${i === MILESTONES.length - 1 ? 'text-[var(--ejo-primary)]' : 'text-[var(--ejo-text)]'}`}>{m.year}</p>
            <h3 className="mt-6 text-lg font-semibold leading-snug">{m.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--ejo-text-muted)]">{m.text}</p>
          </article>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-24 bg-gradient-to-l from-[var(--ejo-bg)] to-transparent sm:block" aria-hidden />
      <div className="mx-auto flex max-w-[1480px] items-center justify-between px-4 pb-10 sm:px-6 lg:px-10">
        <p className="text-sm text-[var(--ejo-text-muted)]">{MILESTONES[Math.min(at, MILESTONES.length - 1)]?.year} · {Math.min(at + 1, MILESTONES.length)} of {MILESTONES.length}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => go(-1)} aria-label="Earlier" className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg></button>
          <button type="button" onClick={() => go(1)} aria-label="Later" className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
        </div>
      </div>
    </div>
  );
}
