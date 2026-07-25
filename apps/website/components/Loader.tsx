'use client';

import { motion } from 'framer-motion';
import { BrandLogo } from './BrandLogo';

/**
 * ============================================================================
 * LOADER CONFIGURATION — edit these to change speed, glow colour, or ring
 * animation duration. See README_CHANGES.md for the full explanation.
 * ============================================================================
 */
const RING_DURATION = 2.2; // seconds per full orbit rotation
const PULSE_DURATION = 1.8; // seconds per glow pulse cycle
const GLOW_COLOR = 'var(--ejo-accent)';

/**
 * Full-screen loading experience for the public website. Automatically
 * uses whatever logo is configured via BrandLogo (public/images/logo/) —
 * no separate logo wiring needed here. Reusable: drop <Loader /> into
 * app/loading.tsx (route-level, automatic) or render it manually around
 * any async boundary that needs a premium loading state.
 */
export function Loader() {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--ejo-secondary)]">
      <div className="relative flex h-40 w-40 items-center justify-center">
        {/* Soft green glow, pulsing */}
        <motion.div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{ background: GLOW_COLOR, opacity: 0.35 }}
          animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.25, 0.45, 0.25] }}
          transition={{ duration: PULSE_DURATION, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Soft white lighting sweep */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0%, rgba(255,255,255,0.25) 15%, transparent 30%)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: RING_DURATION * 1.6, repeat: Infinity, ease: 'linear' }}
        />

        {/* Orbit ring */}
        <motion.div
          className="absolute inset-4 rounded-full border-2 border-dashed"
          style={{ borderColor: GLOW_COLOR, opacity: 0.6 }}
          animate={{ rotate: 360 }}
          transition={{ duration: RING_DURATION, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute inset-4 rounded-full border border-white/10"
          animate={{ rotate: -360 }}
          transition={{ duration: RING_DURATION * 1.4, repeat: Infinity, ease: 'linear' }}
        />

        {/* Logo, gently fading */}
        <motion.div
          className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 backdrop-blur"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: PULSE_DURATION, repeat: Infinity, ease: 'easeInOut' }}
        >
          <BrandLogo size={40} />
        </motion.div>
      </div>
    </div>
  );
}
