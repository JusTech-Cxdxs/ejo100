import Link from 'next/link';

/** A missing page or a record outside what this person can see: the same calm answer for both. */
export default function NotFound() {
  return (
    <main className="relative flex min-h-[80vh] items-center justify-center overflow-hidden bg-[var(--ejo-bg)] px-4 py-12">
      <div className="ejo-orb pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full bg-[var(--ejo-primary)]/10 blur-3xl" aria-hidden="true" />
      <div className="ejo-orb ejo-orb-slow pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-[var(--ejo-accent)]/10 blur-3xl" aria-hidden="true" />
      <section className="ejo-rise relative w-full max-w-md rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6 text-center shadow-sm sm:p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5M8.5 11h5" /></svg>
        </span>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ejo-primary)]">404</p>
        <h1 className="mt-1 text-xl font-semibold text-[var(--ejo-text)]">Page not found</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ejo-text-muted)]">The page may have moved, or the record was removed or is outside what you can see. Use the search at the top, or go back to the dashboard.</p>
        <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row sm:gap-3">
          <Link href="/notifications" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] transition hover:-translate-y-0.5 hover:bg-[var(--ejo-bg)] motion-reduce:transform-none">Notification Center</Link>
          <Link href="/dashboard" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:opacity-90 motion-reduce:transform-none">Back to the dashboard</Link>
        </div>
      </section>
    </main>
  );
}
