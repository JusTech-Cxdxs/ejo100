'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export function CTASection() {
  return (
    <section className="relative overflow-hidden bg-[var(--ejo-secondary)] px-6 py-24 text-white">
      <div className="ejo-media-placeholder absolute inset-0 opacity-30" aria-hidden="true" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="relative mx-auto max-w-3xl text-center"
      >
        <h2 className="text-3xl font-bold md:text-4xl">Let&apos;s Build Something Lasting Together.</h2>
        <p className="mt-4 text-white/70">
          Whether you&apos;re a customer, partner, or future employee — we&apos;d love to hear from you.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/contact"
            className="rounded-full bg-[var(--ejo-primary)] px-7 py-3.5 text-sm font-semibold hover:opacity-90"
          >
            Contact Us →
          </Link>
          <Link
            href="/careers"
            className="rounded-full border border-white/25 px-7 py-3.5 text-sm font-semibold hover:bg-white/10"
          >
            Explore Careers
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
