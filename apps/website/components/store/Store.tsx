'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { VehicleArt } from './VehicleArt';
import { CATEGORIES, PRODUCTS, discountPct, naira, type Category, type Product } from '@/lib/store/catalogue';

/**
 * The store, for demonstration: real models the group sells, indicative
 * prices with a launch discount, a detail panel for each, "Add to cart" and
 * "Reserve" that say plainly that online checkout is coming and point to the
 * people who can sell today. Filters by kind; a referral programme at the foot.
 */
export function Store({ initial = 'all' }: { initial?: Category | 'all' }) {
  const [cat, setCat] = useState<Category | 'all'>(initial);
  const [open, setOpen] = useState<Product | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const shown = useMemo(() => (cat === 'all' ? PRODUCTS : PRODUCTS.filter((p) => p.category === cat)), [cat]);

  const notify = (msg: string) => {
    setToast(msg);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 5500);
  };
  const addToCart = (p: Product) => {
    notify(`${p.name} noted. Online checkout opens soon — until then the sales team confirms price and availability within a working day.`);
  };

  // Toast timer: cleared on unmount.
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  // The detail panel is a modal: focus moves in, Tab stays inside, Escape and
  // the backdrop close it, focus returns to the button that opened it.
  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(null); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]'));
      if (!items.length) return;
      const first = items[0]!, last = items[items.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; returnTo.current?.focus?.(); };
  }, [open]);

  return (
    <div>
      {/* Filters */}
      <div className="sticky top-16 z-30 -mx-4 border-b border-[var(--ejo-border)] bg-[var(--ejo-bg)]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10 lg:top-[76px]">
        <div className="mx-auto flex max-w-[1480px] items-center gap-2 overflow-x-auto">
          {(['all', ...CATEGORIES.map((c) => c.key)] as const).map((k) => {
            const label = k === 'all' ? 'Everything' : CATEGORIES.find((c) => c.key === k)!.label;
            const n = k === 'all' ? PRODUCTS.length : PRODUCTS.filter((p) => p.category === k).length;
            return (
              <button key={k} type="button" onClick={() => setCat(k)} aria-pressed={cat === k} className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium ${cat === k ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)] text-white' : 'border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'}`}>
                {label}<span className={`text-xs ${cat === k ? 'text-white/80' : 'text-[var(--ejo-text-muted)]'}`}>{n}</span>
              </button>
            );
          })}
          <span className="ml-auto hidden shrink-0 items-center gap-2 text-sm text-[var(--ejo-text-muted)] sm:inline-flex">
            <CartIcon />Online checkout: coming soon
          </span>
        </div>
      </div>

      {/* Grid */}
      <ul className="mx-auto grid max-w-[1480px] gap-x-6 gap-y-10 py-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Products">
        {shown.map((p) => {
          const off = discountPct(p);
          return (
            <li key={p.id} className="group flex flex-col">
              <button type="button" onClick={() => setOpen(p)} className="ejo-card relative block w-full overflow-hidden rounded-[var(--ejo-radius-lg)] border border-transparent text-left" aria-label={`${p.name}: details`}>
                <VehicleArt kind={p.art} brand={p.brand} className="aspect-[16/9] w-full transition-transform duration-500 group-hover:scale-[1.03]" />
                {off ? <span className="absolute left-3 top-3 rounded-full bg-[#ffd166] px-2.5 py-1 text-xs font-bold text-[#3b2a0a]">−{off}%</span> : null}
                {p.badge ? <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-[#0b2416]">{p.badge}</span> : null}
              </button>
              <div className="mt-4 flex flex-1 flex-col">
                <p className="text-xs font-semibold text-[var(--ejo-text-muted)]">{p.brand} · {p.kind}</p>
                <h3 className="mt-1 text-lg font-semibold leading-snug"><button type="button" onClick={() => setOpen(p)} className="text-left hover:text-[var(--ejo-primary)]">{p.name}</button></h3>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[var(--ejo-text-muted)]">{p.blurb}</p>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-xl font-extrabold tracking-[-0.01em]">{naira(p.price)}</span>
                  {p.listPrice > p.price ? <s className="text-sm text-[var(--ejo-text-muted)]">{naira(p.listPrice)}</s> : null}
                </div>
                <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">Indicative price{p.offerUntil ? <> · <span className="text-[var(--ejo-primary)]">{p.offerLabel ?? 'Launch price'} until {p.offerUntil}</span></> : null}</p>
                <div className="mt-auto flex gap-2 pt-4">
                  <button type="button" onClick={() => addToCart(p)} aria-label={`Add ${p.name} to cart`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--ejo-primary)] px-4 text-sm font-semibold text-white hover:opacity-90"><CartIcon />Add to cart</button>
                  <button type="button" onClick={() => setOpen(p)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--ejo-border)] px-4 text-sm font-medium hover:bg-[var(--ejo-surface)]">Details</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Detail panel */}
      {open ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="store-detail-title">
          <div aria-hidden className="absolute inset-0 bg-black/55" onClick={() => setOpen(null)} />
          <div ref={panel} tabIndex={-1} className="ejo-pop relative max-h-[92vh] outline-none w-full overflow-y-auto rounded-t-[var(--ejo-radius-xl)] bg-[var(--ejo-bg)] shadow-2xl sm:max-w-3xl sm:rounded-[var(--ejo-radius-xl)]">
            <VehicleArt kind={open.art} brand={open.brand} className="aspect-[16/7] w-full" label={open.name} />
            <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            <div className="p-5 sm:p-8">
              <p className="text-sm font-semibold text-[var(--ejo-text-muted)]">{open.brand} · {open.kind}{open.badge ? ` · ${open.badge}` : ''}</p>
              <h2 id="store-detail-title" className="mt-1 text-2xl font-bold tracking-[-0.01em] sm:text-3xl">{open.name}</h2>
              <p className="mt-3 text-[1.0625rem] leading-relaxed text-[var(--ejo-text)]">{open.about}</p>
              <div className="mt-5 grid gap-6 sm:grid-cols-[minmax(0,1fr)_14rem]">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--ejo-text-muted)]">Highlights</h3>
                  <ul className="mt-2 space-y-1.5">{open.highlights.map((h) => <li key={h} className="flex gap-2 text-[15px]"><span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ejo-primary)]" />{h}</li>)}</ul>
                  <h3 className="mt-5 text-sm font-semibold text-[var(--ejo-text-muted)]">Specifications</h3>
                  <dl className="mt-2 divide-y divide-[var(--ejo-border)] text-[15px]">{open.specs.map(([k, v]) => <div key={k} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 py-1.5"><dt className="text-[var(--ejo-text-muted)]">{k}</dt><dd>{v}</dd></div>)}</dl>
                </div>
                <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
                  <p className="text-sm text-[var(--ejo-text-muted)]">{open.listPrice > open.price ? 'Offer price' : 'Price'}</p>
                  <p className="mt-1 text-2xl font-extrabold tracking-[-0.01em]">{naira(open.price)}</p>
                  {open.listPrice > open.price ? <p className="text-sm text-[var(--ejo-text-muted)]">List {naira(open.listPrice)} · you save {naira(open.listPrice - open.price)}</p> : null}
                  {open.offerUntil ? <p className="mt-1 text-xs text-[var(--ejo-primary)]">{open.offerLabel ?? 'Launch price'} until {open.offerUntil}</p> : null}
                  <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">{open.priceNote}</p>
                  <button type="button" onClick={() => addToCart(open)} aria-label={`Add ${open.name} to cart`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--ejo-primary)] text-sm font-semibold text-white hover:opacity-90"><CartIcon />Add to cart</button>
                  <Link href={`/contact?topic=${open.category === 'parts' || open.category === 'tyres' ? 'parts' : 'sales'}`} className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[var(--ejo-border)] text-sm font-medium hover:bg-[var(--ejo-bg)]">{open.category === 'parts' || open.category === 'tyres' ? 'Ask the parts counter' : 'Book a test drive'}</Link>
                  <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">Know someone who wants one? <a href="#refer" onClick={() => setOpen(null)} className="font-semibold text-[var(--ejo-primary)] hover:underline">Refer them and earn.</a></p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Toast */}
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-[130] flex justify-center sm:bottom-8">
        {toast ? (
          <div className="ejo-pop pointer-events-auto max-w-md rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-primary)]/40 bg-[var(--ejo-bg)] p-4 text-sm shadow-2xl" data-testid="store-toast">
            <p className="font-semibold">Online checkout is coming soon.</p>
            <p className="mt-1 text-[var(--ejo-text-muted)]">{toast}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/contact?topic=sales" className="inline-flex min-h-9 items-center rounded-full bg-[var(--ejo-primary)] px-3.5 text-xs font-semibold text-white">Reserve with the sales team</Link>
              <a href="#refer" className="inline-flex min-h-9 items-center rounded-full border border-[var(--ejo-border)] px-3.5 text-xs font-medium">Refer and earn</a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CartIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.5L21 8H6" /><circle cx="10" cy="20" r="1.5" /><circle cx="17" cy="20" r="1.5" /></svg>;
}
