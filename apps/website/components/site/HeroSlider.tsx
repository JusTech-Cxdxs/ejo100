'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';

interface Slide {
  eyebrow: string;
  headline: string;
  subheading: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
}

const SLIDES: Slide[] = [
  {
    eyebrow: '150+ YEARS OF TRUST. A FUTURE OF IMPACT.',
    headline: 'Building Sustainable Businesses. Empowering Generations.',
    subheading:
      'We are a diversified group with interests in agriculture, automotive, manufacturing, real estate and more — creating lasting value across Africa and beyond.',
    primaryCta: { label: 'Explore Our Businesses', href: '/businesses' },
    secondaryCta: { label: 'About Kewalram Chanrai', href: '/about' },
  },
  {
    eyebrow: 'ENGINEERED FOR EXCELLENCE',
    headline: 'Automotive Solutions Trusted Across Nigeria.',
    subheading:
      'From vehicle sales to full-service workshops, our automotive division keeps businesses and families moving forward.',
    primaryCta: { label: 'Visit the Workshop', href: '/businesses/automotive' },
    secondaryCta: { label: 'Customer Portal', href: '/customer-portal' },
  },
  {
    eyebrow: 'ROOTED IN AGRICULTURE',
    headline: 'Growing Nigeria From the Ground Up.',
    subheading:
      'Our agricultural operations power the supply chains that feed and clothe communities across the region.',
    primaryCta: { label: 'See Our Impact', href: '/sustainability' },
    secondaryCta: { label: 'Careers', href: '/careers' },
  },
];

const AUTOPLAY_MS = 6500;

export function HeroSlider() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const next = useCallback(() => setIndex((i) => (i + 1) % SLIDES.length), []);
  const prev = useCallback(() => setIndex((i) => (i - 1 + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(next, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [paused, next]);

  function onTouchStart(e: React.TouchEvent) {
    setTouchStartX(e.touches[0]?.clientX ?? null);
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX === null) return;
    const delta = (e.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
    if (delta > 50) prev();
    else if (delta < -50) next();
    setTouchStartX(null);
  }

  const slide = SLIDES[index]!;

  return (
    <section
      className="relative flex min-h-[90vh] items-center overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      aria-roledescription="carousel"
      aria-label="Kewalram Chanrai Group highlights"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="ejo-media-placeholder absolute inset-0"
          aria-hidden="true"
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pt-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.6 }}
            className="max-w-2xl"
          >
            <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-[var(--ejo-accent)]">{slide.eyebrow}</p>
            <h1 className="text-4xl font-bold leading-tight text-white md:text-6xl">{slide.headline}</h1>
            <p className="mt-6 max-w-xl text-base text-white/80 md:text-lg">{slide.subheading}</p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href={slide.primaryCta.href}
                className="rounded-full bg-[var(--ejo-primary)] px-7 py-3.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03] hover:opacity-90"
              >
                {slide.primaryCta.label} →
              </Link>
              <Link
                href={slide.secondaryCta.href}
                className="ejo-glass rounded-full px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
              >
                {slide.secondaryCta.label} →
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <button
        onClick={prev}
        aria-label="Previous slide"
        className="ejo-glass absolute left-6 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20 md:flex"
      >
        ‹
      </button>
      <button
        onClick={next}
        aria-label="Next slide"
        className="ejo-glass absolute right-6 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20 md:flex"
      >
        ›
      </button>

      <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        {SLIDES.map((s, i) => (
          <button
            key={s.headline}
            onClick={() => setIndex(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index}
            className={`h-2 rounded-full transition-all ${i === index ? 'w-8 bg-[var(--ejo-accent)]' : 'w-2 bg-white/50 hover:bg-white/80'}`}
          />
        ))}
      </div>
    </section>
  );
}
