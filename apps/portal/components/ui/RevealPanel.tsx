import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * A form kept out of the way until it is wanted: a button ("Add a provider")
 * that opens the form in place. Works without JavaScript (a native
 * <details>), keeps the page calm, and opens by itself when `open` is set
 * (after a failed save, so the message is in view).
 */
export function RevealPanel({ label, icon = 'plus', open, children, className = '' }: { label: string; icon?: IconName; open?: boolean; children: ReactNode; className?: string }) {
  return (
    <details open={open || undefined} className={`group h-fit rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] open:shadow-sm ${className}`} data-reveal="">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 rounded-[var(--ejo-radius-lg)] px-4 text-sm font-semibold text-[var(--ejo-primary)] hover:bg-[color-mix(in_srgb,var(--ejo-primary)_5%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ejo-primary)] [&::-webkit-details-marker]:hidden">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--ejo-primary)]/10"><Icon name={icon} size={16} /></span>
        <span className="flex-1">{label}</span>
        <Icon name="chevron-down" size={16} className="text-[var(--ejo-text-muted)] transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-[var(--ejo-border)] p-4 sm:p-5">{children}</div>
    </details>
  );
}
