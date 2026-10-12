'use client';

import { useEffect, useRef, useState } from 'react';

/** A number that counts up once when it appears (instant with reduced motion). */
export function CountUp({ value, format = 'number', durationMs = 700 }: { value: number; format?: 'number' | 'naira'; durationMs?: number }) {
  const [shown, setShown] = useState(value);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) { setShown(value); return; }
    started.current = true;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !Number.isFinite(value) || value === 0) { setShown(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);
  const n = Math.abs(shown - value) < 0.005 ? value : shown;
  const text = format === 'naira' ? `₦${Math.round(n).toLocaleString('en-NG')}` : Math.round(n).toLocaleString('en-NG');
  return <span className="tabular-nums">{text}</span>;
}
