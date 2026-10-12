'use client';

import { useI18n } from '@/lib/i18n';
import { PartnerLogo } from '@/components/PartnerLogo';

/**
 * Scrolling partner logos. To add a partner, add an entry to PARTNERS and
 * upload the image to public/images/partners/ (PartnerLogo handles a missing file).
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
    <section className="border-y border-[var(--ejo-border)] bg-[var(--ejo-surface)] py-14">
      <p className="mb-8 text-center text-xs font-semibold tracking-[0.2em] text-[var(--ejo-text-muted)]">
        {t('partners.title').toUpperCase()}
      </p>
      <div className="overflow-hidden">
        <div className="ejo-marquee-track flex w-max gap-8">
          {TRACK.map((partner, i) => (
            <PartnerLogo key={`${partner.filename}-${i}`} name={partner.name} filename={partner.filename} />
          ))}
        </div>
      </div>
    </section>
  );
}
