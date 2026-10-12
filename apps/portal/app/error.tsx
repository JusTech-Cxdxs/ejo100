'use client';

import { ErrorScreen } from '@/components/ErrorScreen';

/** Sign-in pages, prints and anything else outside the signed-in shell. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-[var(--ejo-bg)]">
      <ErrorScreen error={error} reset={reset} />
    </main>
  );
}
