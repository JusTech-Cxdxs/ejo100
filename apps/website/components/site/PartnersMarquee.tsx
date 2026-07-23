'use client';

/**
 * Partner brands are rendered as a monogram badge + wordmark rather than
 * reproductions of each company's actual logo artwork — we don't hold
 * rights to those trademarked logos, so this avoids using unlicensed
 * brand assets while still giving each entry a distinct, logo-like
 * presence (not plain text). Swap the `mark` span for a real <Image>
 * once licensed logo files are available for each brand.
 */
const PARTNERS = [
  'SOUEAST',
  'Dangote',
  'Bosch',
  'Foton',
  'Isuzu',
  'Jeep',
  'Mitsubishi',
  'Dodge',
];
const TRACK = [...PARTNERS, ...PARTNERS];

export function PartnersMarquee() {
  return (
    <section className="border-y border-[var(--ejo-border)] bg-[var(--ejo-surface)] py-14">
      <p className="mb-8 text-center text-xs font-semibold tracking-[0.2em] text-[var(--ejo-text-muted)]">
        TRUSTED BY LEADING BRANDS
      </p>
      <div className="overflow-hidden">
        <div className="ejo-marquee-track flex w-max gap-10">
          {TRACK.map((name, i) => (
            <div
              key={`${name}-${i}`}
              className="flex shrink-0 items-center gap-2.5 rounded-full border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-5 py-2.5 opacity-80 grayscale transition-all hover:opacity-100 hover:grayscale-0"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ejo-primary)]/10 text-xs font-bold text-[var(--ejo-primary)]">
                {name[0]}
              </span>
              <span className="text-sm font-bold tracking-tight text-[var(--ejo-text)]">{name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
