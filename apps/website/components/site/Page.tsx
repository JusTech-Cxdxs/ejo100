import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { MediaBox } from '@/components/MediaBox';

/**
 * The building blocks every public page is made of, so the site reads as one
 * piece: an introduction (headline, lede, optional photo), sections with one
 * rhythm of spacing, and a few small pieces — a figure, a row of links, a
 * quiet card. Left-aligned throughout; one accent colour; motion only on the
 * page's first paint (ejo-intro), which reduced-motion turns off.
 */

export function PageIntro({ title, lede, kicker, image, imageAlt, children, tone = 'light' }: { title: ReactNode; lede?: ReactNode; kicker?: string; image?: string; imageAlt?: string; children?: ReactNode; tone?: 'light' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <section className={`relative overflow-hidden ${dark ? 'bg-[#0b2416] text-white' : 'bg-[var(--ejo-surface)] text-[var(--ejo-text)]'}`}>
      {image ? <MediaBox src={image} alt={imageAlt ?? ''} className="absolute inset-0" style={{ opacity: dark ? 0.35 : 0.18 }} /> : null}
      {dark ? <div aria-hidden className="ejo-ambient absolute inset-0" /> : null}
      <div className="relative mx-auto max-w-[1480px] px-4 pb-14 pt-28 sm:px-6 lg:px-10 sm:pb-20 sm:pt-36 lg:pt-44">
        <div className="ejo-intro max-w-3xl">
          {/* Always rendered (empty when there is no kicker), so the entrance animation's order holds. */}
          <p className={`mb-4 text-sm font-semibold ${dark ? 'text-[#7ee2a0]' : 'text-[var(--ejo-primary)]'} ${kicker ? '' : 'hidden'}`}>{kicker ?? ''}</p>
          <h1 className="text-[2.25rem] font-extrabold leading-[1.05] tracking-[-0.02em] sm:text-5xl lg:text-[3.75rem]">{title}</h1>
          <span aria-hidden className={`mt-6 block h-1 w-16 rounded-full ${dark ? 'bg-[#7ee2a0]' : 'bg-[var(--ejo-primary)]'}`} />
          {lede ? <p className={`mt-6 max-w-2xl text-lg leading-relaxed sm:text-xl ${dark ? 'text-white/80' : 'text-[var(--ejo-text-muted)]'}`}>{lede}</p> : null}
          {children ? <div className="mt-8">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}

export function Section({ id, title, lead, children, tone = 'plain', className = '', narrow = false, aside }: { id?: string; title?: ReactNode; lead?: ReactNode; children: ReactNode; tone?: 'plain' | 'tint' | 'dark'; className?: string; narrow?: boolean; aside?: ReactNode }) {
  const bg = tone === 'tint' ? 'bg-[var(--ejo-surface)]' : tone === 'dark' ? 'bg-[#0b2416] text-white' : '';
  return (
    <section id={id} className={`${bg} ${className}`}>
      <div className={`mx-auto px-4 py-16 sm:px-6 lg:px-10 sm:py-24 ${narrow ? 'max-w-3xl' : 'max-w-[1480px]'}`}>
        {title ? (
          <div className={`mb-10 sm:mb-14 ${aside ? 'grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-end' : 'max-w-3xl'}`}>
            <div>
              <h2 className="text-3xl font-bold leading-tight tracking-[-0.015em] sm:text-4xl">{title}</h2>
              {lead ? <p className={`mt-4 max-w-2xl text-lg leading-relaxed ${tone === 'dark' ? 'text-white/75' : 'text-[var(--ejo-text-muted)]'}`}>{lead}</p> : null}
            </div>
            {aside ? <div className="lg:justify-self-end">{aside}</div> : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}

/** A figure with its meaning, for a row of three or four. */
export function Figure({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="border-l-2 border-[var(--ejo-primary)] pl-4">
      <p className="text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
      {note ? <p className="mt-0.5 text-xs text-[var(--ejo-text-muted)]">{note}</p> : null}
    </div>
  );
}

export function Prose({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`max-w-2xl space-y-5 text-[1.0625rem] leading-[1.75] text-[var(--ejo-text)] [&_strong]:font-semibold ${className}`}>{children}</div>;
}

/** A link that reads as a destination: a title, one line, an arrow — not a card kit. */
export function LinkRow({ href, title, text, external = false }: { href: string; title: string; text?: string; external?: boolean }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-[var(--ejo-text)] group-hover:text-[var(--ejo-primary)]">{title}</span>
        {text ? <span className="mt-0.5 block text-sm text-[var(--ejo-text-muted)]">{text}</span> : null}
      </span>
      <span aria-hidden className="ml-4 shrink-0 text-[var(--ejo-primary)] transition-transform group-hover:translate-x-1">→</span>
    </>
  );
  const cls = 'group flex items-center border-b border-[var(--ejo-border)] py-4 last:border-b-0';
  return external ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a> : <Link href={href} className={cls}>{inner}</Link>;
}

export function Button({ href, children, variant = 'solid', external = false, className = '' }: { href: string; children: ReactNode; variant?: 'solid' | 'line' | 'light'; external?: boolean; className?: string }) {
  const base = 'inline-flex min-h-12 items-center justify-center rounded-full px-6 text-sm font-semibold transition-[transform,opacity] hover:-translate-y-px active:translate-y-0';
  const look = variant === 'solid' ? 'bg-[var(--ejo-primary)] text-white shadow-[0_8px_20px_-10px_rgba(34,152,63,0.7)] hover:opacity-90 hover:shadow-[0_12px_24px_-10px_rgba(34,152,63,0.8)]' : variant === 'light' ? 'bg-white text-[#0b2416] hover:opacity-90' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]';
  const cls = `${base} ${look} ${className}`;
  return external ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{children}</a> : <Link href={href} className={cls}>{children}</Link>;
}

/** A photo or themed block with a caption, used for business and story covers. */
export function Cover({ src, alt, className = '', style, children }: { src?: string | null; alt: string; className?: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div className={`relative overflow-hidden rounded-[var(--ejo-radius-lg)] ${className}`} style={style}>
      {src ? <MediaBox src={src} alt={alt} className="absolute inset-0" /> : <div aria-hidden className="ejo-media-placeholder absolute inset-0" />}
      {children}
    </div>
  );
}

/** Two-column fact list ("Head office — 8A Karimu Kotun Street…"). */
export function Facts({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-[var(--ejo-border)]">
      {items.map((i) => (
        <div key={i.k} className="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-4">
          <dt className="text-sm font-medium text-[var(--ejo-text-muted)]">{i.k}</dt>
          <dd className="text-[var(--ejo-text)]">{i.v}</dd>
        </div>
      ))}
    </dl>
  );
}
