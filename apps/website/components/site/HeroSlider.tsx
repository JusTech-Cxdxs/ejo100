'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { MediaBox } from '@/components/MediaBox';

/**
 * ============================================================================
 * OVERLAY OPACITY — the single value controlling how dark the gradient
 * over each hero image is. Raise it for better text contrast on brighter
 * images; lower it to show more of the photo. Valid range 0–1.
 * ============================================================================
 */
const OVERLAY_OPACITY = 0.75;

interface Slide {
  image: string;
  eyebrowKey?: TranslationKey;
  headlineKey?: TranslationKey;
  subheadingKey?: TranslationKey;
  primaryCtaKey?: TranslationKey;
  secondaryCtaKey?: TranslationKey;
  primaryHref: string;
  secondaryHref: string;
  // Slide 3 only — left hardcoded per "leave slide three exactly as it is".
  hardcoded?: { eyebrow: string; headline: string; subheading: string; primaryCta: string; secondaryCta: string };
}

const SLIDES: Slide[] = [
  {
    image: '/images/home/home-slider-img-1.jpg',
    eyebrowKey: 'hero.slide1.eyebrow',
    headlineKey: 'hero.slide1.headline',
    subheadingKey: 'hero.slide1.subheading',
    primaryCtaKey: 'hero.slide1.primaryCta',
    secondaryCtaKey: 'hero.slide1.secondaryCta',
    primaryHref: '/businesses',
    secondaryHref: '/about',
  },
  {
    image: '/images/home/home-slider-img-2.jpg',
    eyebrowKey: 'hero.slide2.eyebrow',
    headlineKey: 'hero.slide2.headline',
    subheadingKey: 'hero.slide2.subheading',
    primaryCtaKey: 'hero.slide2.primaryCta',
    secondaryCtaKey: 'hero.slide2.secondaryCta',
    primaryHref: '/businesses/automotive',
    secondaryHref: '/customer-portal',
  },
  {
    image: '/images/home/home-slider-img-3.jpg',
    eyebrowKey: 'hero.slide3.eyebrow',
    headlineKey: 'hero.slide3.headline',
    subheadingKey: 'hero.slide3.subheading',
    primaryCtaKey: 'hero.slide3.primaryCta',
    secondaryCtaKey: 'hero.slide3.secondaryCta',
    primaryHref: '/sustainability',
    secondaryHref: '/careers',
  },
];

const AUTOPLAY_MS = 6500;

export function HeroSlider() {
  const { t } = useI18n();
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
  const copy = slide.hardcoded ?? {
    eyebrow: t(slide.eyebrowKey!),
    headline: t(slide.headlineKey!),
    subheading: t(slide.subheadingKey!),
    primaryCta: t(slide.primaryCtaKey!),
    secondaryCta: t(slide.secondaryCtaKey!),
  };

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
          className="absolute inset-0"
        >
          <MediaBox src={slide.image} alt="" className="absolute inset-0" />
        </motion.div>
      </AnimatePresence>
      <div
        className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/10"
        style={{ opacity: OVERLAY_OPACITY }}
        aria-hidden="true"
      />

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
            <p className="mb-4 text-xs font-semibold tracking-[0.2em] text-[var(--ejo-accent)]">{copy.eyebrow}</p>
            <h1 className="text-4xl font-bold leading-tight text-white md:text-6xl">{copy.headline}</h1>
            <p className="mt-6 max-w-xl text-base text-white/80 md:text-lg">{copy.subheading}</p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href={slide.primaryHref}
                className="rounded-full bg-[var(--ejo-primary)] px-7 py-3.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03] hover:opacity-90"
              >
                {copy.primaryCta} →
              </Link>
              <Link
                href={slide.secondaryHref}
                className="ejo-glass rounded-full px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
              >
                {copy.secondaryCta} →
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <button
        onClick={prev}
        aria-label="Previous slide"
        className="ejo-glass absolute left-6 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20 md:flex"
      >
        ‹
      </button>
      <button
        onClick={next}
        aria-label="Next slide"
        className="ejo-glass absolute right-6 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20 md:flex"
      >
        ›
      </button>

      <div className="absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 gap-2 md:bottom-28">
        {SLIDES.map((s, i) => (
          <button
            key={s.image}
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
