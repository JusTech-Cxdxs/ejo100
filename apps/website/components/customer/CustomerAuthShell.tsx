import type { ReactNode } from 'react';
import Link from 'next/link';
import { siteConfig } from '@/lib/site-config';
import { Wordmark } from './Wordmark';
import { PoweredByEjo } from './PoweredByEjo';
import { ThemeSwitch } from './ThemeSwitch';
import { Icon, type IconName } from './Icon';

const HIGHLIGHTS: { title: string; text: string; icon: IconName }[] = [
  { title: 'Follow every step', text: 'See your Job Cards and services move from check-in to collection, as it happens.', icon: 'route' },
  { title: 'Estimates & payments', text: 'Review your estimate, see what is due and keep every receipt in one place.', icon: 'wallet' },
  { title: 'Warranties & reminders', text: 'Know what is covered, when it ends and when your next service is due.', icon: 'shield' },
];

/**
 * The frame of every customer sign-in page (sign in, forgot password, set a
 * new password) — the same split layout as the staff portal's AuthShell:
 * the brand panel with the wordmark, a short friendly write-up and soft
 * drifting orbs on the left; the form on a calm card on the right. On a
 * phone the brand collapses into a compact green header above the form.
 */
export function CustomerAuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <main className="flex min-h-[100dvh] flex-col bg-[var(--ejo-bg)] lg:flex-row">
      {/* Brand panel — large screens */}
      <section className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-[var(--ejo-secondary)] p-12 text-white lg:flex xl:p-16" aria-label={siteConfig.companyShortName}>
        <div className="ejo-media-placeholder absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="ejo-orb pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[var(--ejo-brand)]/25 blur-3xl" aria-hidden="true" />
        <div className="ejo-orb-slow pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[var(--ejo-accent)]/15 blur-3xl" aria-hidden="true" />
        <div className="ejo-rise relative">
          <Wordmark name={siteConfig.companyShortName} size="lg" tone="onDark" />
        </div>

        <div className="ejo-rise relative max-w-md" style={{ animationDelay: '80ms' }}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ejo-accent)]">Customer portal</p>
          <h2 className="mt-3 text-[2rem] font-bold leading-tight xl:text-4xl">Your vehicle, every step of the way.</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/70">Track your repairs and services, approve estimates, see what you owe and when your car is ready to collect — any time, from any device.</p>
          <ul className="mt-8 space-y-5">
            {HIGHLIGHTS.map((h, i) => (
              <li key={h.title} className="ejo-rise flex gap-4" style={{ animationDelay: `${160 + i * 70}ms` }}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[var(--ejo-accent)]">
                  <Icon name={h.icon} size={18} />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{h.title}</span>
                  <span className="mt-0.5 block text-sm text-white/65">{h.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="ejo-rise relative flex items-end justify-between gap-6" style={{ animationDelay: '240ms' }}>
          <PoweredByEjo tone="onDark" size="lg" />
          <p className="text-xs text-white/40">© {year} {siteConfig.companyShortName}</p>
        </div>
      </section>

      {/* Compact brand header — phones and tablets */}
      <section className="relative overflow-hidden bg-[var(--ejo-secondary)] px-5 pb-6 pt-5 text-white lg:hidden" aria-label={siteConfig.companyShortName}>
        <div className="ejo-media-placeholder absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="ejo-orb pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--ejo-brand)]/30 blur-3xl" aria-hidden="true" />
        <div className="relative flex items-center justify-between gap-3">
          <Wordmark name={siteConfig.companyShortName} tone="onDark" />
          <ThemeSwitch tone="onDark" />
        </div>
        <p className="relative mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ejo-accent)]">Customer portal</p>
        <p className="relative mt-1 text-lg font-semibold leading-snug">Your vehicle, every step of the way.</p>
      </section>

      {/* Form panel */}
      <section className="relative flex w-full flex-1 flex-col lg:w-[54%]">
        <div className="flex items-center justify-between px-5 pt-5 sm:px-10 sm:pt-6">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-full px-1 py-1 text-sm text-[var(--ejo-text-muted)] transition-colors hover:text-[var(--ejo-primary)]">
            <Icon name="arrowLeft" size={16} /> Back to website
          </Link>
          <div className="hidden lg:block"><ThemeSwitch /></div>
        </div>
        <div className="flex flex-1 items-start justify-center px-5 py-8 sm:items-center sm:px-10 sm:py-10">
          <div className="ejo-rise w-full max-w-[400px]">
            <h1 className="text-[1.6rem] font-bold tracking-tight text-[var(--ejo-text)] sm:text-[1.75rem]">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-sm leading-relaxed text-[var(--ejo-text-muted)]">{subtitle}</p> : null}
            <div className="mt-7">{children}</div>
            {footer ? <div className="mt-6">{footer}</div> : null}
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 px-5 pb-8 text-center sm:px-10">
          <p className="text-xs text-[var(--ejo-text-muted)]">
            <Icon name="lock" size={13} strokeWidth={2} className="mr-1 inline-block align-[-2px]" />
            Private and secure · we never ask for your password
          </p>
          <div className="lg:hidden"><PoweredByEjo /></div>
        </div>
      </section>
    </main>
  );
}
