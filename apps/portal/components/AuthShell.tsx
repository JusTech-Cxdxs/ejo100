'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { portalConfig } from '@/lib/site-config';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Shared visual shell for every portal auth page (login, forgot-password,
 * reset-password, verify-email) — a branded, animated split layout so the
 * whole auth flow feels like one premium, consistent product surface.
 */
export function AuthShell({ eyebrow, title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="flex min-h-screen">
      {/* Brand panel — hidden on small screens */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-[var(--ejo-secondary)] p-12 text-white lg:flex">
        <div className="ejo-media-placeholder absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ejo-primary)] text-lg font-bold">
              K
            </span>
            <span className="text-lg font-bold">Kewalram Chanrai Group</span>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative max-w-md"
        >
          <p className="text-3xl font-bold leading-tight">
            The single operating system running every part of our business.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z" stroke="var(--ejo-accent)" strokeWidth="1.5" fill="rgba(34,197,94,0.15)" />
              <circle cx="12" cy="12" r="3" fill="var(--ejo-accent)" />
            </svg>
            <span className="ejo-shimmer text-xs font-semibold">{portalConfig.poweredBy}</span>
          </div>
        </motion.div>

        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} Kewalram Chanrai Group</p>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center bg-[var(--ejo-bg)] px-6 py-16 lg:w-1/2">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm"
        >
          <p className="text-center text-xs font-medium tracking-wide text-[var(--ejo-text-muted)] lg:hidden">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-center text-2xl font-bold text-[var(--ejo-text)]">{title}</h1>
          {subtitle && <p className="mb-8 mt-1 text-center text-sm text-[var(--ejo-text-muted)]">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6">{footer}</div>}
        </motion.div>
      </div>
    </main>
  );
}
