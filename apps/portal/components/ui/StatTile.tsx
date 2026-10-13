'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LoadingLink } from '@/components/LoadingLink';
import { Icon, type IconName } from './Icon';
import { TONE_TILE, TONE_TEXT, type Tone } from './tones';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A number that counts up from zero the first time it scrolls into view
 * (once; never when the person prefers reduced motion). The server renders
 * the real value, so it is right before any script runs.
 */
export function CountUp({ value, prefix = '', suffix = '', decimals = 0, duration = 900 }: { value: number; prefix?: string; suffix?: string; decimals?: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (done.current || reduced() || !Number.isFinite(value) || value === 0) { setShown(value); return; }
    const el = ref.current;
    let raf = 0;
    const run = () => {
      done.current = true;
      const start = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setShown(value * eased);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      setShown(0);
      raf = requestAnimationFrame(step);
    };
    if (!el || typeof IntersectionObserver === 'undefined') { run(); return () => cancelAnimationFrame(raf); }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); run(); } }, { threshold: 0.2 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value, duration]);
  const text = shown.toLocaleString('en-NG', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span ref={ref} className="tabular-nums">{prefix}{text}{suffix}</span>;
}

/**
 * One headline number: an icon, a label, the value (counting up when it is
 * a number), and an optional hint or change. With `href` the whole tile is
 * a link that lifts on hover.
 */
export function StatTile({
  icon,
  label,
  value,
  prefix,
  suffix,
  decimals,
  hint,
  delta,
  deltaInvert = false,
  href,
  tone = 'brand',
  emphasis = false,
  className = '',
}: {
  icon: IconName;
  label: ReactNode;
  value: number | string | null;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  hint?: ReactNode;
  /** Percentage change vs the previous period (null = nothing to compare). */
  delta?: number | null;
  /** True when a fall is good news (costs, overdue…). */
  deltaInvert?: boolean;
  href?: string;
  tone?: Tone;
  /** Shows the value in the tone's colour. */
  emphasis?: boolean;
  className?: string;
}) {
  const valueColour = emphasis ? TONE_TEXT[tone] : 'text-[var(--ejo-text)]';
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${TONE_TILE[tone]}`}><Icon name={icon} size={18} /></span>
        {href ? <span className="text-[var(--ejo-text-muted)] opacity-0 transition-all group-hover:translate-x-0.5 group-hover:text-[var(--ejo-primary)] group-hover:opacity-100" aria-hidden="true"><Icon name="arrow-right" size={16} /></span> : null}
      </div>
      {/* Sized to the tile (cqi), so ₦12,430,500 fits a phone's half-width tile on one line. */}
      <div className="@container mt-3">
        <p className={`break-words text-[clamp(0.875rem,12.5cqi,1.5rem)] font-bold leading-tight tracking-tight sm:leading-none ${valueColour}`}>
        {value === null ? '—' : typeof value === 'number' ? <CountUp value={value} prefix={prefix} suffix={suffix} decimals={decimals} /> : value}
      </p>
      </div>
      <p className="mt-1.5 text-[13px] font-medium text-[var(--ejo-text-muted)]">{label}</p>
      {delta !== undefined ? (
        delta === null ? <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">No comparison yet</p> : (
          <p className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${(delta >= 0) !== deltaInvert ? 'text-[var(--ejo-success)]' : 'text-[var(--ejo-error)]'}`}>
            <Icon name={delta >= 0 ? 'trend-up' : 'trend-down'} size={13} strokeWidth={2.2} />{Math.abs(delta)}% vs previous
          </p>
        )
      ) : null}
      {hint ? <p className="mt-1 text-[11px] leading-snug text-[var(--ejo-text-muted)]">{hint}</p> : null}
    </>
  );
  const base = `group relative block min-w-0 overflow-hidden rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 ${className}`;
  return href ? <LoadingLink href={href} className={`${base} ejo-lift hover:border-[var(--ejo-primary)]/50`}>{body}</LoadingLink> : <div className={base}>{body}</div>;
}
