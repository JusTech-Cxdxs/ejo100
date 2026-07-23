'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useInView, motion } from 'framer-motion';
import { AwardIcon, BuildingIcon, UsersIcon, GlobeIcon } from '@/components/icons';

interface Stat {
  label: string;
  value: number;
  suffix: string;
  icon: ReactNode;
}

const STATS: Stat[] = [
  { label: 'Years of Legacy', value: 150, suffix: '+', icon: <AwardIcon /> },
  { label: 'Business Divisions', value: 20, suffix: '+', icon: <BuildingIcon /> },
  { label: 'Employees', value: 10000, suffix: '+', icon: <UsersIcon /> },
  { label: 'Countries of Operation', value: 50, suffix: '+', icon: <GlobeIcon /> },
];

function Counter({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const duration = 1400;
    const start = performance.now();

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * eased));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [inView, value]);

  return (
    <span ref={ref} className="text-3xl font-bold text-white md:text-4xl">
      {display.toLocaleString()}
      {suffix}
    </span>
  );
}

export function StatsSection() {
  return (
    <section className="relative z-30 -mt-10 px-6">
      <div className="mx-auto max-w-6xl rounded-[var(--ejo-radius-xl)] bg-[var(--ejo-primary)] px-8 py-10 shadow-2xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="flex flex-col items-center text-center"
            >
              <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white">
                {stat.icon}
              </span>
              <Counter value={stat.value} suffix={stat.suffix} />
              <p className="mt-1 text-sm text-white/80">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
