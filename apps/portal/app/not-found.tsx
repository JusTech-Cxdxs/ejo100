import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-semibold text-[var(--ejo-text)]">Page not found</h1>
      <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">The page may have moved, or the record was removed. Use the search at the top, or go back to the dashboard.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/dashboard" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Back to the dashboard</Link>
        <Link href="/notifications" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)]">Notification Center</Link>
      </div>
    </div>
  );
}
