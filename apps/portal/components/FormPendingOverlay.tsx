'use client';

import { createPortal } from 'react-dom';
import { useFormStatus } from 'react-dom';
import { EjoMarkSpinner } from './EjoMarkSpinner';
import { contentArea } from './content-area';

/**
 * Loader while a form's server action runs, including any redirect() it ends
 * with. Place it inside the <form>: useFormStatus() only sees its own form.
 * Inside the signed-in frame it covers only the working area, so the menu and
 * header stay; on the sign-in pages it covers the screen.
 */
export function FormPendingOverlay() {
  const { pending } = useFormStatus();
  if (!pending || typeof document === 'undefined') return null;

  const area = contentArea();
  return createPortal(
    <div className={`${area ? 'absolute' : 'fixed'} ejo-fade inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[var(--ejo-bg)]/90 backdrop-blur-[1px]`} role="status" aria-live="polite">
      <EjoMarkSpinner size={64} />
      <p className="text-sm text-[var(--ejo-text-muted)]">Saving…</p>
    </div>,
    area ?? document.body,
  );
}
