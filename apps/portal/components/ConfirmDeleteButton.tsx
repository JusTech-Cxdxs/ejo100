'use client';

import { useFormStatus } from 'react-dom';
import { EjoSpinner } from './EjoSpinner';

/** Submit button for destructive actions: like SubmitButton, but asks confirm() first.
 * A form that is not filled in yet shows the browser's own hints instead of the question. */
export function ConfirmDeleteButton({
  confirmMessage,
  label = 'Delete',
  pendingLabel = 'Deleting…',
  className,
}: {
  confirmMessage: string;
  label?: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        const form = e.currentTarget.form;
        if (form && !form.checkValidity()) return;
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
      className={`${className ?? ''} inline-flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-70`}
    >
      {pending ? <EjoSpinner size={13} /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}
