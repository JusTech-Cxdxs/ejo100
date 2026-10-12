'use client';

import { createPortal } from 'react-dom';
import { useFormStatus } from 'react-dom';
import { EjoMarkSpinner } from './EjoMarkSpinner';

/**
 * Full-screen loader while a form's server action runs, including any
 * redirect() it ends with. Place it inside the <form>: useFormStatus() only
 * sees its own form. Portalled to document.body so it covers the viewport.
 */
export function FormPendingOverlay() {
  const { pending } = useFormStatus();
  if (!pending || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[var(--ejo-bg)]">
      <EjoMarkSpinner size={64} />
      <p className="text-sm text-[var(--ejo-text-muted)]">Loading…</p>
    </div>,
    document.body,
  );
}
