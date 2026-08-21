'use client';

import { useFormStatus } from 'react-dom';
import { EjoSpinner } from './EjoSpinner';

/**
 * A destructive-action submit button — like SubmitButton (same pending/
 * spinner behavior, same useFormStatus mechanism), but gated behind a
 * native browser confirm() before the form is allowed to actually
 * submit. Kept as its own small component rather than adding a confirm
 * option onto SubmitButton itself, since SubmitButton is used in many
 * non-destructive places and shouldn't need to carry that concern.
 */
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
