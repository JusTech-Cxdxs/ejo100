import type { ReactNode } from 'react';
import Link from 'next/link';
import { siteConfig } from '@/lib/site-config';
import { Wordmark } from './Wordmark';
import { PoweredByEjo } from './PoweredByEjo';
import { ThemeSwitch } from './ThemeSwitch';
import { Icon, type IconName } from './Icon';

const HIGHLIGHTS: { title: string; text: string; icon: IconName }[] = [
  { title: 'Follow every step', text: 'Job Cards and services, from check-in to collection, as it happens.', icon: 'route' },
  { title: 'Estimates & payments', text: 'Approve estimates, see what is due, keep every receipt.', icon: 'wallet' },
  { title: 'Warranties', text: 'What is covered, for how long, and how to claim.', icon: 'shield' },
  { title: 'Service reminders', text: 'When your next service is due, before it is late.', icon: 'calendarCheck' },
  { title: 'Ask Enyo, any time', text: 'Our assistant answers about your own devices and orders, day or night.', icon: 'sparkles' },
  { title: 'Talk to a person', text: 'Open a request or complaint; our customer care replies by email or phone.', icon: 'chat' },
];

const STEPS = ['Checked in', 'Estimate approved', 'Work in progress', 'Quality check', 'Ready to collect'];

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
          <h2 className="mt-3 text-[2rem] font-bold leading-tight xl:text-4xl">Your devices, every step of the way.</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/70">Track your repairs and services, approve estimates, see what you owe and when your car is ready to collect — any time, from any device.</p>
          <ul className="mt-7 grid grid-cols-2 gap-x-5 gap-y-4">
            {HIGHLIGHTS.map((h, i) => (
              <li key={h.title} className="ejo-rise flex gap-3" style={{ animationDelay: `${160 + i * 50}ms` }}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[var(--ejo-accent)]">
                  <Icon name={h.icon} size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{h.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-white/60">{h.text}</span>
                </span>
              </li>
            ))}
          </ul>
          {/* How a visit moves along (the same steps the portal shows on each Job Card). */}
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-4 [@media(max-height:820px)]:hidden" aria-label="How your visit moves along">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Your visit, step by step</p>
            <ol className="mt-3 flex items-center gap-1.5">
              {STEPS.map((s, i) => (
                <li key={s} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${i < 3 ? 'bg-[var(--ejo-accent)] text-[var(--ejo-secondary)]' : 'border border-white/25 text-white/60'}`}>{i + 1}</span>
                  <span className="text-[10px] leading-tight text-white/65">{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/55">
            <span className="inline-flex items-center gap-1.5"><Icon name="lock" size={12} />Your records are private to you</span>
            <span className="inline-flex items-center gap-1.5"><Icon name="mail" size={12} />Updates by email too</span>
            {siteConfig.contact?.phone ? <span className="inline-flex items-center gap-1.5"><Icon name="phone" size={12} />{siteConfig.contact.phone}</span> : null}
          </p>
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
        <p className="relative mt-1 text-lg font-semibold leading-snug">Your devices, every step of the way.</p>
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
