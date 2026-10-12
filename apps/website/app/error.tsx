'use client';

import Link from 'next/link';

/** A calm message if a page fails — never technical details (LOG-03). */
export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="text-xl font-semibold text-[var(--ejo-text)]">Something went wrong</h1>
      <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">
        Please try again. If it keeps happening, contact us{error.digest ? <> and quote reference <span className="font-mono">{error.digest}</span></> : null}.
      </p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={reset} className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-semibold text-white">Try again</button>
        <Link href="/" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)]">Home</Link>
      </div>
    </main>
  );
}
