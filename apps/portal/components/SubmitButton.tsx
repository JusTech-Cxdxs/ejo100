'use client';

import { useFormStatus } from 'react-dom';
import { EjoSpinner } from './EjoSpinner';

/**
 * Drop-in replacement for a plain <button type="submit">, for any form
 * whose `action` is a Server Action. `useFormStatus()` only works inside
 * the <form> it reports on, which is why this is its own small client
 * component rather than something the parent Server Component page can
 * just compute directly — the page itself stays a Server Component.
 *
 * Fixes the double-submission bug (rapid clicks while nothing visibly
 * happened created duplicate records): disabled while pending, and shows
 * the existing EjoSpinner + a pending label so it's obvious something is
 * happening.
 */
export function SubmitButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className ?? ''} inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70`}
    >
      {pending ? <EjoSpinner size={16} /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}
