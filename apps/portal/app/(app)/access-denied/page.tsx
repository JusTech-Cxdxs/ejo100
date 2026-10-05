import Link from 'next/link';

export default async function AccessDenied({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const { area } = await searchParams;
  return (
    <div className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-semibold text-[var(--ejo-text)]">You don&apos;t have access to this</h1>
      <p className="mt-2 text-sm text-[var(--ejo-text-muted)]">{area ? `This needs permission to “${area.slice(0, 120)}”. ` : ''}Your role doesn&apos;t include it. If you need it for your work, ask an administrator to review your role.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/dashboard" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">Back to the dashboard</Link>
      </div>
    </div>
  );
}
