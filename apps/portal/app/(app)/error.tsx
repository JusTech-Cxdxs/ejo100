'use client';

import { ErrorScreen } from '@/components/ErrorScreen';

/** Shown inside the portal when a page fails: plain words, the reference IT can look up, never technical text. */
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen error={error} reset={reset} helpLink />;
}
