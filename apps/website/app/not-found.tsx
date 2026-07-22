import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center gap-4 px-6 pt-20 text-center">
      <p className="text-sm font-semibold text-[var(--ejo-primary)]">404</p>
      <h1 className="text-3xl font-bold text-[var(--ejo-text)]">Page not found</h1>
      <p className="text-[var(--ejo-text-muted)]">
        The page you&apos;re looking for doesn&apos;t exist or has moved.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
      >
        Back to Home
      </Link>
    </main>
  );
}
