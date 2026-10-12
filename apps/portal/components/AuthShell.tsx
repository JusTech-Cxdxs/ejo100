import type { ReactNode } from 'react';
import { portalConfig } from '@/lib/site-config';
import { Wordmark } from './Wordmark';
import { ThemeToggle } from './ThemeToggle';
import { PoweredByEjo } from './PoweredByEjo';

interface AuthShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

const HIGHLIGHTS: { title: string; text: string; icon: ReactNode }[] = [
  {
    title: 'Workshop & vehicle service',
    text: 'Job cards, estimates, approvals, payments and hand-over — every step tracked.',
    icon: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4 2.5-2.5z" />,
  },
  {
    title: 'Inventory, warranty & security',
    text: 'Stock you can trust, warranties honoured, every gate movement recorded.',
    icon: <><path d="M21 8 12 3 3 8v8l9 5 9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  },
  {
    title: 'Live analytics',
    text: 'Sales, margins, stock and service health — current, and only what your role allows.',
    icon: <><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>,
  },
];

/**
 * The shared frame of every sign-in page (sign in, forgot password, set a new
 * password): the organisation's wordmark and what the platform does on the
 * brand panel, the form on a calm card, Light / Dark / System in the corner,
 * and the animated "Powered by EJO 100" signature. CSS-only motion.
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const year = new Date().getFullYear();
  return (
    <main className="flex min-h-screen bg-[var(--ejo-bg)]">
      {/* Brand panel — large screens */}
      <section className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-[var(--ejo-secondary)] p-12 text-white lg:flex xl:p-16" aria-label={portalConfig.organisationName}>
        <div className="ejo-media-placeholder absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[var(--ejo-brand)]/20 blur-3xl" aria-hidden="true" />
        <div className="ejo-rise relative">
          <Wordmark name={portalConfig.organisationName} size="lg" tone="onDark" />
        </div>

        <div className="ejo-rise relative max-w-md" style={{ animationDelay: '80ms' }}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ejo-accent)]">Enterprise operations platform</p>
          <h2 className="mt-3 text-[2rem] font-bold leading-tight xl:text-4xl">One platform running every part of the business.</h2>
          <ul className="mt-8 space-y-5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ejo-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{h.icon}</svg>
                </span>
                <span>
                  <span className="block text-sm font-semibold">{h.title}</span>
                  <span className="mt-0.5 block text-sm text-white/65">{h.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="ejo-rise relative flex items-end justify-between gap-6" style={{ animationDelay: '160ms' }}>
          <PoweredByEjo tone="onDark" size="lg" />
          <p className="text-xs text-white/40">© {year} {portalConfig.organisationName}</p>
        </div>
      </section>

      {/* Form panel */}
      <section className="relative flex w-full flex-col lg:w-[54%]">
        <div className="flex items-center justify-between px-6 pt-6 sm:px-10">
          <div className="lg:hidden"><Wordmark name={portalConfig.organisationName} /></div>
          <div className="ml-auto"><ThemeToggle /></div>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="ejo-rise w-full max-w-[400px]">
            <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--ejo-text)]">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-sm leading-relaxed text-[var(--ejo-text-muted)]">{subtitle}</p> : null}
            <div className="mt-8">{children}</div>
            {footer ? <div className="mt-6">{footer}</div> : null}
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 px-6 pb-8 text-center sm:px-10">
          <p className="flex items-center gap-1.5 text-xs text-[var(--ejo-text-muted)]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            Staff only · access follows your role · every action is recorded
          </p>
          <div className="lg:hidden"><PoweredByEjo /></div>
        </div>
      </section>
    </main>
  );
}
