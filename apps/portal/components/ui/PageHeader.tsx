import type { ReactNode } from 'react';
import { LoadingLink } from '@/components/LoadingLink';
import { Icon, type IconName } from './Icon';

/**
 * The top of every page: an icon tile, the title (the page's one <h1>), a
 * short description and the page's main actions — on a soft green-tinted
 * surface with a slowly drifting glow, like the roadmap hero.
 *
 *  hero      bigger, with the animated ring around the icon (module home
 *            pages, the dashboard, analytics)
 *  back      a small "← Back to …" link above the header
 *  eyebrow   a tiny line above the title (module · status)
 *  meta      chips/trail under the description
 */
export function PageHeader({
  icon,
  title,
  description,
  actions,
  back,
  eyebrow,
  meta,
  hero = false,
  live = false,
  className = '',
}: {
  icon: IconName;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  eyebrow?: ReactNode;
  meta?: ReactNode;
  hero?: boolean;
  /** Shows a green "Live" pulse next to the eyebrow. */
  live?: boolean;
  className?: string;
}) {
  return (
    <div className={`mb-6 ${className}`}>
      {back ? (
        <LoadingLink href={back.href} className="group mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--ejo-text-muted)] transition-colors hover:text-[var(--ejo-primary)]">
          <span aria-hidden="true" className="inline-flex transition-transform group-hover:-translate-x-0.5"><Icon name="arrow-left" size={15} /></span>
          {back.label}
        </LoadingLink>
      ) : null}
      <section className={`ejo-hero relative overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] ${hero ? 'p-5 sm:p-8' : 'p-4 sm:p-6'}`}>
        <div className="ejo-orb pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--ejo-primary)]/15 blur-3xl" aria-hidden="true" />
        {hero ? <div className="ejo-orb ejo-orb-slow pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-[var(--ejo-accent)]/10 blur-3xl" aria-hidden="true" /> : null}
        <div className="relative flex flex-wrap items-start gap-4 sm:gap-5">
          {hero ? (
            <div className="relative hidden h-16 w-16 shrink-0 items-center justify-center sm:flex">
              <span className="ejo-spin absolute inset-0 rounded-full border-2 border-dashed border-[var(--ejo-primary)]/35" aria-hidden="true" />
              <span className="ejo-glow absolute inset-2 rounded-full bg-[var(--ejo-primary)]/30 blur-md" aria-hidden="true" />
              <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--ejo-surface)] text-[var(--ejo-primary)] shadow-sm"><Icon name={icon} size={22} /></span>
            </div>
          ) : null}
          <span className={`${hero ? 'flex sm:hidden' : 'flex'} h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)] ring-1 ring-[var(--ejo-primary)]/15`}>
            <Icon name={icon} size={22} />
          </span>
          <div className="min-w-0 flex-1 basis-56">
            {eyebrow || live ? (
              <p className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ejo-text-muted)]">
                {live ? <span className="inline-flex items-center gap-1.5 text-[var(--ejo-primary)]"><span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--ejo-primary)] opacity-60 motion-reduce:hidden" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--ejo-primary)]" /></span>Live</span> : null}
                {eyebrow ? <span>{eyebrow}</span> : null}
              </p>
            ) : null}
            <h1 className={`break-words font-bold leading-tight text-[var(--ejo-text)] ${hero ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'}`}>{title}</h1>
            {description ? <div className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--ejo-text-muted)]">{description}</div> : null}
            {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
          </div>
          {actions ? <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div> : null}
        </div>
      </section>
    </div>
  );
}

/** The green call-to-action used in page headers ("Record Goods Receipt", "New …"). */
export function HeaderAction({ href, children, icon = 'plus', variant = 'primary' }: { href: string; children: ReactNode; icon?: IconName; variant?: 'primary' | 'secondary' }) {
  return (
    <LoadingLink
      href={href}
      className={variant === 'primary'
        ? 'ejo-press inline-flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm shadow-[var(--ejo-primary)]/20 transition hover:brightness-110'
        : 'ejo-press inline-flex items-center gap-1.5 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] transition hover:border-[var(--ejo-primary)]/60 hover:text-[var(--ejo-primary)]'}
    >
      <Icon name={icon} size={16} />
      {children}
    </LoadingLink>
  );
}

/** "← Back to …" above a page (the same look everywhere). */
export function BackLink({ href, label, className = 'mb-4' }: { href: string; label: ReactNode; className?: string }) {
  return (
    <LoadingLink href={href} className={`group inline-flex items-center gap-1.5 text-sm text-[var(--ejo-text-muted)] transition-colors hover:text-[var(--ejo-primary)] ${className}`}>
      <span aria-hidden="true" className="inline-flex transition-transform group-hover:-translate-x-0.5"><Icon name="arrow-left" size={15} /></span>
      {label}
    </LoadingLink>
  );
}

/**
 * Just the title with its icon tile — a drop-in for a page's <h1> where the
 * header around it carries its own controls (record pages, admin forms).
 */
export function PageTitle({ icon, children, className = '', size = 'md' }: { icon: IconName; children: ReactNode; className?: string; size?: 'md' | 'lg' }) {
  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)] ring-1 ring-[var(--ejo-primary)]/15">
        <Icon name={icon} size={20} />
      </span>
      <h1 className={`min-w-0 break-words font-bold leading-tight text-[var(--ejo-text)] ${size === 'lg' ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'}`}>{children}</h1>
    </div>
  );
}
