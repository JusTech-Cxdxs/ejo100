import Link from 'next/link';
import { OFFERS } from '@/lib/content/offers';
import { Reveal } from './Reveal';

/** The offers running now, as adverts on the home page — the same list as the bar and the store. */
export function OffersSection() {
  const [lead, ...rest] = OFFERS;
  if (!lead) return null;
  return (
    <section className="mx-auto max-w-[1480px] px-4 py-16 sm:px-6 sm:py-24 lg:px-10" aria-labelledby="offers-title">
      <Reveal>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-10">
          <div>
            <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-[var(--ejo-primary)]">OFFERS THIS SEASON</p>
            <h2 id="offers-title" className="text-3xl font-bold text-[var(--ejo-text)] md:text-4xl">Good reasons to visit the showroom</h2>
          </div>
          <Link href="/store" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--ejo-border)] px-5 text-sm font-semibold text-[var(--ejo-text)] transition-colors hover:border-[var(--ejo-primary)] hover:text-[var(--ejo-primary)]">
            Open the store
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
        </div>
      </Reveal>
      <Reveal className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* The lead offer: a full advert. */}
        <article data-stagger style={{ '--i': 0, background: lead.tint } as never} className="ejo-card relative flex min-h-[320px] flex-col justify-end overflow-hidden rounded-[var(--ejo-radius-xl)] p-7 text-white sm:p-10">
          <div aria-hidden className="ejo-ambient absolute inset-0 opacity-70" />
          <span aria-hidden className="absolute -right-6 -top-8 select-none text-[11rem] font-extrabold leading-none text-white/10 sm:text-[14rem]">{lead.mark}</span>
          <div className="relative">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#7ee2a0]">{lead.kicker}{lead.partner ? ` · with ${lead.partner}` : ''}</p>
            <h3 className="mt-3 max-w-xl text-3xl font-extrabold leading-[1.1] tracking-[-0.015em] sm:text-4xl">{lead.title}</h3>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/85 sm:text-base">{lead.text}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href={lead.href} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-[#0b2416] transition-transform hover:-translate-y-px">{lead.cta}</Link>
              <Link href="/contact?topic=sales" className="inline-flex min-h-11 items-center rounded-full border border-white/35 px-5 text-sm font-semibold text-white hover:bg-white/10">Talk to sales</Link>
              {lead.until ? <span className="text-xs text-white/70">Until {lead.until} · terms confirmed by the sales team</span> : null}
            </div>
          </div>
        </article>
        <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
          {rest.map((o, i) => (
            <article key={o.id} data-stagger style={{ '--i': i + 1, background: o.tint } as never} className="ejo-card relative overflow-hidden rounded-[var(--ejo-radius-lg)] p-5 text-white">
              <span aria-hidden className="absolute -bottom-5 -right-3 select-none text-[5rem] font-extrabold leading-none text-white/10">{o.mark}</span>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/75">{o.kicker}</p>
              <h3 className="mt-1.5 text-lg font-bold leading-snug">{o.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-white/80">{o.text}</p>
              <Link href={o.href} className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-[#7ee2a0] hover:underline">
                {o.cta}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </article>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
