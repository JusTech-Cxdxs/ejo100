'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/** Shown inside the portal when a page fails — never technical text. */
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The full detail is in the server log under this reference.
    console.error('Page error', error.digest ?? '');
  }, [error]);
  return (
    <div className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-semibold text-[var(--ejo-text)]">Something went wrong on this page</h1>
      <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">Nothing you entered has been lost. Please try again — if it keeps happening, tell IT and quote the reference below.</p>
      {error.digest ? <p className="mt-3 font-mono text-xs text-[var(--ejo-text-muted)]">Reference: {error.digest}</p> : null}
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={() => reset()} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Try again</button>
        <Link href="/dashboard" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)]">Back to the dashboard</Link>
      </div>
    </div>
  );
}
