import type { ReactNode } from 'react';

interface ComingSoonProps {
  title: string;
  description?: string;
  icon?: ReactNode;
}

/**
 * Premium "under development" placeholder used by every page that exists
 * in routing but isn't built yet — per the "no empty pages" rule. Never
 * render a blank page; render this instead.
 */
export function ComingSoon({ title, description, icon }: ComingSoonProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-2xl border border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-8 py-16 text-center">
      {icon}
      <h2 className="text-2xl font-semibold text-[var(--ejo-text)]">{title}</h2>
      <p className="max-w-md text-sm text-[var(--ejo-text-muted)]">
        {description ??
          'This section is currently under development and will be activated after project approval.'}
      </p>
    </div>
  );
}
