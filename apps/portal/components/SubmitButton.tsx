'use client';

import { useFormStatus } from 'react-dom';
import { EjoSpinner } from './EjoSpinner';

/**
 * Submit button for server-action forms. Disabled while pending (prevents
 * double submission) and shows a spinner with the pending label.
 * useFormStatus() only works inside the form, hence a client component.
 */
export function SubmitButton({
  label,
  pendingLabel,
  className,
  ariaLabel,
  name,
  value,
}: {
  label: string;
  pendingLabel: string;
  className?: string;
  /** For icon-like labels ("×"): what the button does, for screen readers. */
  ariaLabel?: string;
  /** A second submit on the same form ("Save and publish"): the field it sets. */
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={ariaLabel}
      aria-busy={pending || undefined}
      name={name}
      value={value}
      className={`${className ?? ''} inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70`}
    >
      {pending ? <EjoSpinner size={16} /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}
