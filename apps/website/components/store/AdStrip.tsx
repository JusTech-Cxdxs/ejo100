import Link from 'next/link';
import { OFFERS } from '@/lib/store/catalogue';

/** The season's offers, as a row of three "adverts" under the store's introduction. */
export function AdStrip() {
  return (
    <section aria-label="This season's offers" className="border-b border-[var(--ejo-border)] bg-[var(--ejo-surface)]">
      <ul className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:grid-cols-3 sm:px-6">
        {OFFERS.map((o) => (
          <li key={o.title} className="relative overflow-hidden rounded-[var(--ejo-radius-lg)] p-5 text-white" style={{ background: o.tint }}>
            <p className="text-xs font-semibold text-white/80">{o.kicker}</p>
            <p className="mt-1 text-xl font-extrabold leading-tight tracking-[-0.01em]">{o.title}</p>
            <p className="mt-1 text-sm text-white/85">{o.text}</p>
            <Link href={o.href} className="mt-3 inline-flex min-h-9 items-center rounded-full bg-white px-3.5 text-xs font-semibold text-[#0b2416]">{o.cta}</Link>
            <span aria-hidden className="absolute -bottom-6 -right-4 select-none text-[5rem] font-extrabold leading-none text-white/10">{o.mark}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
