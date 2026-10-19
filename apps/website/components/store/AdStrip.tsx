import Link from 'next/link';
import { OFFERS } from '@/lib/content/offers';

/** The season's offers, as a row of three "adverts" under the store's introduction. */
export function AdStrip() {
  return (
    <section aria-label="This season's offers" className="border-b border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
      <ul className="mx-auto grid max-w-[1480px] gap-4 px-4 py-6 sm:grid-cols-2 sm:px-6 lg:px-10 xl:grid-cols-4">
        {OFFERS.map((o) => (
          <li key={o.id} className="ejo-card relative overflow-hidden rounded-[var(--ejo-radius-lg)] p-5 text-white" style={{ background: o.tint }}>
            <p className="text-xs font-semibold text-white/80">{o.kicker}</p>
            <p className="mt-1 text-xl font-extrabold leading-tight tracking-[-0.01em]">{o.title}</p>
            <p className="mt-1 line-clamp-3 text-sm text-white/85">{o.text}</p>{o.partner ? <p className="mt-1 text-xs font-semibold text-white/80">With {o.partner}{o.until ? ` · until ${o.until}` : ''}</p> : o.until ? <p className="mt-1 text-xs text-white/70">Until {o.until}</p> : null}
            <Link href={o.href} className="mt-3 inline-flex min-h-9 items-center rounded-full bg-white px-3.5 text-xs font-semibold text-[#0b2416]">{o.cta}</Link>
            <span aria-hidden className="absolute -bottom-6 -right-4 select-none text-[5rem] font-extrabold leading-none text-white/10">{o.mark}</span>
          </li>
        ))}
      </ul>
      <p className="mx-auto max-w-[1480px] px-4 pb-4 text-xs text-[var(--ejo-text-muted)] sm:px-6 lg:px-10">Prices and offers are indicative and confirmed by the sales team; a written quotation is what counts.</p>
    </section>
  );
}
