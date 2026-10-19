'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { OFFERS, offerLine } from '@/lib/content/offers';

/**
 * The thin line of offers under the header — one at a time, turning every
 * few seconds, with a link to the store. Closed for the visit with the ×.
 */
export function PromoBar({ dark = false }: { dark?: boolean }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(true);
  useEffect(() => {
    try { if (sessionStorage.getItem('ejo-promo-closed') === '1') setShown(false); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    if (reduce || OFFERS.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % OFFERS.length), 6000);
    return () => clearInterval(t);
  }, [reduce]);
  if (!shown || !OFFERS.length) return null;
  const o = OFFERS[i]!;
  const close = () => { setShown(false); try { sessionStorage.setItem('ejo-promo-closed', '1'); } catch { /* storage unavailable */ } };
  return (
    <div data-testid="promo-bar" className={`relative z-[1] ${dark ? 'bg-black/35 text-white backdrop-blur-sm' : 'bg-[#0b2416] text-white'}`}>
      <div className="flex h-9 items-center gap-3 px-4 sm:px-6 lg:px-8 2xl:px-12">
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-[#7ee2a0]/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7ee2a0] sm:inline-flex">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" /><circle cx="7.5" cy="7.5" r="1" /></svg>
          Offer
        </span>
        <div className="relative min-w-0 flex-1 overflow-hidden" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={o.id}
              initial={reduce ? false : { y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reduce ? undefined : { y: -12, opacity: 0 }} transition={{ duration: 0.35 }}
              className="truncate text-[13px] font-medium"
            >
              <Link href={o.href} className="hover:underline">{offerLine(o)}</Link>
            </motion.p>
          </AnimatePresence>
        </div>
        <Link href={o.href} className="hidden shrink-0 items-center gap-1 text-[13px] font-semibold text-[#7ee2a0] hover:underline sm:inline-flex">
          {o.cta}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
        <button type="button" onClick={close} aria-label="Close offers" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </div>
  );
}
