'use client';

/**
 * Partner names are rendered as clean typographic wordmarks rather than
 * reproductions of each brand's actual logo — avoids using trademarked
 * logo artwork we don't hold rights to, while still communicating the
 * partner roster. Swap in real logo assets (as <Image>) when available.
 */
const PARTNERS = ['SOUEAST', 'Dangote', 'Bosch', 'Foton', 'Isuzu', 'Jeep', 'Mitsubishi', 'Dodge'];
const TRACK = [...PARTNERS, ...PARTNERS];

export function PartnersMarquee() {
  return (
    <section className="border-y border-[var(--ejo-border)] bg-[var(--ejo-surface)] py-14">
      <p className="mb-8 text-center text-xs font-semibold tracking-[0.2em] text-[var(--ejo-text-muted)]">
        TRUSTED BY LEADING BRANDS
      </p>
      <div className="overflow-hidden">
        <div className="ejo-marquee-track flex w-max gap-16">
          {TRACK.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="flex shrink-0 items-center text-xl font-bold tracking-tight text-[var(--ejo-text-muted)] opacity-70 grayscale transition-all hover:opacity-100 hover:grayscale-0"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
