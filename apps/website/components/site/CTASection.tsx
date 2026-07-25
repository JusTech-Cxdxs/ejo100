'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
import { MediaBox } from '@/components/MediaBox';

export function CTASection() {
  const { t } = useI18n();

  return (
    <section className="relative overflow-hidden bg-[var(--ejo-secondary)] px-6 py-24 text-white">
      <MediaBox src="/images/placeholders/cta-bg.jpg" alt="" className="absolute inset-0 opacity-30" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative mx-auto max-w-3xl text-center"
      >
        <h2 className="text-3xl font-bold md:text-4xl">{t('cta.title')}</h2>
        <p className="mt-4 text-white/70">{t('cta.body')}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/contact"
            className="rounded-full bg-[var(--ejo-primary)] px-7 py-3.5 text-sm font-semibold hover:opacity-90"
          >
            {t('cta.contact')} →
          </Link>
          <Link
            href="/careers"
            className="rounded-full border border-white/25 px-7 py-3.5 text-sm font-semibold hover:bg-white/10"
          >
            {t('cta.careers')}
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
