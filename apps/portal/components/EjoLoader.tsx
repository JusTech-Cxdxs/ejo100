'use client';

import { motion } from 'framer-motion';

/**
 * ============================================================================
 * LOADER CONFIGURATION — edit these to change speed or glow colour.
 * ============================================================================
 */
const RING_DURATION = 2.2;
const PULSE_DURATION = 1.8;
const GLOW_COLOR = 'var(--ejo-accent)';

/**
 * Full-screen loading experience for the EJO 100 Enterprise Platform
 * (Employee Portal / Customer Portal / Admin) — uses the EJO 100 mark
 * rather than the client company's logo, so it stays consistent across
 * every company this platform is ever deployed for. Reusable: drop
 * <EjoLoader /> into app/loading.tsx (route-level, automatic) or render
 * manually around any async boundary.
 */
export function EjoLoader() {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--ejo-secondary)]">
      <div className="relative flex h-40 w-40 items-center justify-center">
        <motion.div
          className="absolute inset-0 rounded-full blur-2xl"
          style={{ background: GLOW_COLOR, opacity: 0.35 }}
          animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.25, 0.45, 0.25] }}
          transition={{ duration: PULSE_DURATION, repeat: Infinity, ease: 'easeInOut' }}
        />
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

        <motion.div
          className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 backdrop-blur"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: PULSE_DURATION, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z" stroke={GLOW_COLOR} strokeWidth="1.5" fill="rgba(34,197,94,0.15)" />
            <circle cx="12" cy="12" r="3" fill={GLOW_COLOR} />
          </svg>
        </motion.div>
      </div>
      <p className="ejo-shimmer absolute bottom-16 text-sm font-semibold">EJO 100 Enterprise Platform</p>
    </div>
  );
}
