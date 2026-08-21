'use client';

import { motion } from 'framer-motion';

const RING_DURATION = 2.2;
const PULSE_DURATION = 1.8;
const GLOW_COLOR = 'var(--ejo-accent)';

/**
 * The actual EJO diamond mark, animated — a properly-branded loading
 * indicator sized and colored for sitting inside a normal, light page
 * background, not the generic circular spinner (that's `EjoSpinner`,
 * still the right choice for small inline contexts like a button — a
 * full diamond mark animation would be visually excessive at that
 * size). This is the missing middle weight: distinctive and branded,
 * but scoped to a page's content area rather than a full-screen
 * takeover.
 *
 * Adapted from EjoLoader's mark, not copy-pasted wholesale — EjoLoader
 * is designed for a DARK, full-screen background (`bg-[var(--ejo-
 * secondary)]`), so several of its colors (`border-white/10`,
 * `bg-white/10`) would be nearly invisible against this project's
 * normal light page background. Recolored specifically for that.
 */
export function EjoMarkSpinner({ size = 64 }: { size?: number }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0 rounded-full blur-xl"
        style={{ background: GLOW_COLOR, opacity: 0.2 }}
        animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.15, 0.3, 0.15] }}
        transition={{ duration: PULSE_DURATION, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute inset-1 rounded-full border-2 border-dashed"
        style={{ borderColor: GLOW_COLOR, opacity: 0.5 }}
        animate={{ rotate: 360 }}
        transition={{ duration: RING_DURATION, repeat: Infinity, ease: 'linear' }}
      />
      <div
        className="relative z-10 flex items-center justify-center rounded-full bg-[var(--ejo-primary)]/10"
        style={{ width: size * 0.55, height: size * 0.55 }}
      >
        <svg width={size * 0.32} height={size * 0.32} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z"
            stroke={GLOW_COLOR}
            strokeWidth="1.5"
            fill="rgba(34,197,94,0.15)"
          />
          <circle cx="12" cy="12" r="3" fill={GLOW_COLOR} />
        </svg>
      </div>
    </div>
  );
}
