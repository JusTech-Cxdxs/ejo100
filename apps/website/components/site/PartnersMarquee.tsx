'use client';

import { useI18n } from '@/lib/i18n';

/**
 * The brands the group represents, as a full-width band that stays light in
 * both themes (the logos are the brands' own colours; a dark background would
 * hide half of them). Edge to edge, no inner box: the logos themselves are the
 * design. To add a brand, add it here and put the file in
 * public/images/partners/ (the trimmed copy in /trim is what is shown).
 */
const PARTNERS = [
  { name: 'SOUEAST', filename: 'soueast-img.png' },
  { name: 'Isuzu', filename: 'isuzu-img.png' },
  { name: 'Bridgestone', filename: 'bridgestone-img.png' },
  { name: 'Foton', filename: 'foton-img.png' },
  { name: 'Bosch', filename: 'bosch-img.png' },
  { name: 'Jeep', filename: 'jeep-img.png' },
  { name: 'Firestone', filename: 'firestone-img.png' },
  { name: 'Dodge', filename: 'dodge-img.png' },
  { name: 'Mitsubishi', filename: 'mitsubishi-img.png' },
  { name: 'Dangote', filename: 'dangote-img.png' },
  { name: 'Chevrolet', filename: 'chevrolet-img.png' },
  { name: 'Chery', filename: 'chery-img.png' },
  { name: 'Fiat', filename: 'fiat-img.png' },
];
const TRACK = [...PARTNERS, ...PARTNERS];

export function PartnersMarquee() {
  const { t } = useI18n();
  return (
    <section className="w-full overflow-hidden bg-white py-10 text-[#0f172a] sm:py-14" style={{ colorScheme: 'light' }} aria-label={t('partners.title')} data-testid="brands-band">
      <p className="mb-7 px-6 text-center text-sm font-semibold text-[#334155] sm:mb-10 sm:text-base">{t('partners.title')}</p>
      <div className="relative">
        <div className="ejo-marquee-track flex w-max items-center gap-12 sm:gap-20" aria-hidden="true">
          {TRACK.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- plain img: many small logos, no layout shift (height fixed)
            <img key={`${p.filename}-${i}`} src={`/images/partners/trim/${p.filename}`} alt={i < PARTNERS.length ? p.name : ''} loading={i < 6 ? 'eager' : 'lazy'} decoding="async" className="h-12 w-auto max-w-[11rem] shrink-0 object-contain sm:h-16 sm:max-w-[16rem] lg:h-20 lg:max-w-[20rem]" />
          ))}
        </div>
      </div>
      <ul className="sr-only">{PARTNERS.map((p) => <li key={p.name}>{p.name}</li>)}</ul>
    </section>
  );
}
