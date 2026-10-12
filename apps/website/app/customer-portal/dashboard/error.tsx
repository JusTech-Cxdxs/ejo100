'use client';

import { ErrorScreen } from '@/components/ErrorScreen';

/** A friendly message if a portal page fails to load, with a reference the branch can look up. */
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorScreen
      error={error}
      reset={reset}
      title="Something didn’t load"
      message="It’s not you, and nothing you entered has been lost. Please try again. If it keeps happening, call your branch and quote the reference below."
      homeHref="/customer-portal/dashboard"
      homeLabel="Go to overview"
    />
  );
}
