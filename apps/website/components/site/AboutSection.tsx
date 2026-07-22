'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export function AboutSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-28">
      <div className="grid items-center gap-16 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-[var(--ejo-primary)]">
            ABOUT KEWALRAM CHANRAI GROUP
          </p>
          <h2 className="text-3xl font-bold leading-tight text-[var(--ejo-text)] md:text-4xl">
            A Legacy of Trust. A Future of Excellence.
          </h2>
          <p className="mt-6 text-[var(--ejo-text-muted)]">
            For over 150 years, Kewalram Chanrai Group has been at the forefront of innovation and
            entrepreneurship. From our humble beginnings to our global footprint today, our commitment to
            quality, integrity and sustainable growth remains unwavering.
          </p>
          <Link
            href="/about"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--ejo-primary)] px-6 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.03] hover:opacity-90"
          >
            Discover Our Story →
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative"
        >
          <div className="ejo-media-placeholder aspect-[4/3] rounded-[var(--ejo-radius-xl)] shadow-xl" />
          <div className="absolute -bottom-8 -left-6 w-48 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-5 shadow-2xl">
            <p className="text-2xl font-bold text-[var(--ejo-primary)]">150+</p>
            <p className="text-xs text-[var(--ejo-text-muted)]">Years of Excellence, Since 1870</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
