'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { MediaBox } from '@/components/MediaBox';
import { CarIcon, WheatIcon, FactoryIcon, BuildingIcon, TruckIcon, HeartPulseIcon } from '@/components/icons';

const UNITS: { nameKey: TranslationKey; href: string; image: string; icon: React.ReactNode }[] = [
  { nameKey: 'business.automotive', href: '/businesses/automotive', image: '/images/business/automotive.jpg', icon: <CarIcon width={18} height={18} /> },
  { nameKey: 'business.agriculture', href: '/businesses/agriculture', image: '/images/business/agriculture.jpg', icon: <WheatIcon width={18} height={18} /> },
  { nameKey: 'business.manufacturing', href: '/businesses/manufacturing', image: '/images/business/manufacturing.jpg', icon: <FactoryIcon width={18} height={18} /> },
  { nameKey: 'business.food', href: '/businesses/food', image: '/images/business/food.jpg', icon: <BuildingIcon width={18} height={18} /> },
  { nameKey: 'business.logistics', href: '/businesses/logistics', image: '/images/business/logistics.jpg', icon: <TruckIcon width={18} height={18} /> },
  { nameKey: 'business.healthcare', href: '/businesses/healthcare', image: '/images/business/healthcare.jpg', icon: <HeartPulseIcon width={18} height={18} /> },
];

export function BusinessUnitsSection() {
  const { t } = useI18n();

  return (
    <section className="bg-[var(--ejo-surface)] px-6 py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-[var(--ejo-primary)]">{t('business.eyebrow')}</p>
            <h2 className="text-3xl font-bold text-[var(--ejo-text)] md:text-4xl">{t('business.title')}</h2>
          </div>
          <Link
            href="/businesses"
            className="rounded-full border border-[var(--ejo-border)] px-5 py-2.5 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
          >
            {t('business.viewAll')} →
          </Link>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3">
          {UNITS.map((unit, i) => (
            <motion.div
              key={unit.href}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
            >
              <Link
                href={unit.href}
                className="group relative block h-56 overflow-hidden rounded-[var(--ejo-radius-lg)] shadow-md transition-transform duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <MediaBox
                  src={unit.image}
                  alt={t(unit.nameKey)}
                  className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-5">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">{unit.icon}</span>
                    {t(unit.nameKey)}
                  </span>
                  <span className="translate-x-2 text-white opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
                    →
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
