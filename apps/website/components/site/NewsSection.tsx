'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

const ARTICLES = [
  {
    date: 'May 15, 2026',
    title: 'Kewalram Chanrai Group Expands Operations in West Africa',
    href: '/news',
    featured: true,
  },
  { date: 'May 5, 2026', title: 'KCG Partners With Global Industry Leaders', href: '/news' },
  { date: 'April 28, 2026', title: 'New Manufacturing Facility Officially Opened', href: '/news' },
];

export function NewsSection() {
  const featured = ARTICLES[0]!;
  const rest = ARTICLES.slice(1);

  return (
    <section className="mx-auto max-w-7xl px-6 py-28">
      <div className="mb-12">
        <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-[var(--ejo-primary)]">LATEST NEWS &amp; HIGHLIGHTS</p>
        <h2 className="text-3xl font-bold text-[var(--ejo-text)] md:text-4xl">What&apos;s Happening at Kewalram</h2>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <Link href={featured.href} className="group block overflow-hidden rounded-[var(--ejo-radius-lg)] shadow-md">
            <div className="ejo-media-placeholder relative aspect-[16/10] transition-transform duration-500 group-hover:scale-105" />
            <div className="border border-t-0 border-[var(--ejo-border)] p-6">
              <p className="text-xs text-[var(--ejo-text-muted)]">{featured.date}</p>
              <h3 className="mt-2 text-lg font-semibold text-[var(--ejo-text)] group-hover:text-[var(--ejo-primary)]">
                {featured.title}
              </h3>
              <span className="mt-3 inline-block text-sm font-medium text-[var(--ejo-primary)]">Read More →</span>
            </div>
          </Link>
        </motion.div>

        <div className="flex flex-col gap-4">
          {rest.map((article, i) => (
            <motion.div
              key={article.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.1 }}
            >
              <Link
                href={article.href}
                className="group flex items-start justify-between gap-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] p-5 transition-colors hover:border-[var(--ejo-primary)]"
              >
                <div>
                  <p className="text-xs text-[var(--ejo-text-muted)]">{article.date}</p>
                  <h4 className="mt-1 font-medium text-[var(--ejo-text)] group-hover:text-[var(--ejo-primary)]">
                    {article.title}
                  </h4>
                </div>
                <span className="mt-1 shrink-0 text-[var(--ejo-primary)]">→</span>
              </Link>
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-2 rounded-[var(--ejo-radius-lg)] bg-[var(--ejo-secondary)] p-6 text-white"
          >
            <p className="text-xs font-semibold tracking-widest text-[var(--ejo-accent)]">SUSTAINABILITY</p>
            <h4 className="mt-2 text-lg font-semibold">Building a Better Tomorrow</h4>
            <p className="mt-2 text-sm text-white/70">
              We are committed to sustainable practices that protect our planet and empower communities.
            </p>
            <Link
              href="/sustainability"
              className="mt-4 inline-block rounded-full bg-[var(--ejo-primary)] px-5 py-2 text-sm font-semibold"
            >
              Learn More →
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
