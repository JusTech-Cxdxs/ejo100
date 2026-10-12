'use client';

import { ErrorScreen } from '@/components/ErrorScreen';

/** A calm message if a page fails, with the reference our team can look up. Never technical details. */
export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="pt-20">
      <ErrorScreen error={error} reset={reset} title="Something went wrong" message="Nothing you entered has been lost. Please try again. If it keeps happening, contact us and quote the reference below." />
    </main>
  );
}
