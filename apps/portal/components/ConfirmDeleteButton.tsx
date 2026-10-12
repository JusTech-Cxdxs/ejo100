'use client';

import { useFormStatus } from 'react-dom';
import { EjoSpinner } from './EjoSpinner';

/** Submit button for destructive actions: like SubmitButton, but asks confirm() first. */
export function ConfirmDeleteButton({
  confirmMessage,
  label = 'Delete',
  className,
}: {
  confirmMessage: string;
  label?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
      className={`${className ?? ''} inline-flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-70`}
    >
      {pending ? <EjoSpinner size={13} /> : null}
      {pending ? 'Deleting…' : label}
    </button>
  );
}
