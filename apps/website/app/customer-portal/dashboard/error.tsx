'use client';

import Link from 'next/link';
import { Icon } from '@/components/customer/Icon';

/** A friendly message if a portal page fails to load — never a stack trace. */
export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="ejo-rise mx-auto max-w-md rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning)]"><Icon name="alert" size={22} /></span>
      <h1 className="mt-4 text-lg font-semibold text-[var(--ejo-text)]">Something didn’t load</h1>
      <p className="mt-1 text-sm text-[var(--ejo-text-muted)]">It’s not you — please try again. If it keeps happening, call your branch and we’ll help.</p>
      <div className="mt-5 flex justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white">Try again</button>
        <Link href="/customer-portal/dashboard" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)]">Go to overview</Link>
      </div>
    </div>
  );
}
