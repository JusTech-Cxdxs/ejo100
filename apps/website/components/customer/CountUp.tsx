'use client';

import { useEffect, useRef, useState } from 'react';

/** A number that counts up once when it appears (still for reduced motion). */
export function CountUp({ value, format = 'number', duration = 900 }: { value: number; format?: 'number' | 'naira' | 'days'; duration?: number }) {
  const [shown, setShown] = useState(value);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) { setShown(value); return; }
    started.current = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || value === 0) { setShown(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  if (format === 'naira') return <>₦{Math.round(shown).toLocaleString('en-NG')}</>;
  if (format === 'days') return <>{shown.toFixed(value < 10 ? 1 : 0)}</>;
  return <>{Math.round(shown).toLocaleString('en-NG')}</>;
}
