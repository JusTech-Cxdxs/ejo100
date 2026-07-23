'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { CarIcon, WheatIcon, FactoryIcon, BuildingIcon, TruckIcon, HeartPulseIcon } from '@/components/icons';

const UNITS = [
  { name: 'Automotive', href: '/businesses/automotive', icon: <CarIcon width={18} height={18} /> },
  { name: 'Agriculture', href: '/businesses/agriculture', icon: <WheatIcon width={18} height={18} /> },
  { name: 'Manufacturing', href: '/businesses/manufacturing', icon: <FactoryIcon width={18} height={18} /> },
  { name: 'Food', href: '/businesses/food', icon: <BuildingIcon width={18} height={18} /> },
  { name: 'Logistics', href: '/businesses/logistics', icon: <TruckIcon width={18} height={18} /> },
  { name: 'Healthcare', href: '/businesses/healthcare', icon: <HeartPulseIcon width={18} height={18} /> },
];

export function BusinessUnitsSection() {
  return (
    <section className="bg-[var(--ejo-surface)] px-6 py-28">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-[var(--ejo-primary)]">OUR BUSINESSES</p>
            <h2 className="text-3xl font-bold text-[var(--ejo-text)] md:text-4xl">Diverse Industries. Shared Purpose.</h2>
          </div>
          <Link
            href="/businesses"
            className="rounded-full border border-[var(--ejo-border)] px-5 py-2.5 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]"
          >
            View All Businesses →
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
                <div className="ejo-media-placeholder absolute inset-0 transition-transform duration-500 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-5">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">{unit.icon}</span>
                    {unit.name}
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
