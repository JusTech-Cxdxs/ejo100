'use client';

import { createPortal } from 'react-dom';
import { useFormStatus } from 'react-dom';
import { EjoMarkSpinner } from './EjoMarkSpinner';

/**
 * The missing piece in this app's "every load shows the branded EJO
 * loader" standing rule: `LoadingLink`/`NavigationLoadingProvider`
 * only ever covers a plain link click (`router.push`) — a form whose
 * `action` is a Server Action is a completely different navigation
 * path in Next.js's App Router, and never touched that mechanism at
 * all. That gap meant every form submission on the site — including
 * the moment a Server Action calls `redirect()`, whether on success or
 * to show a validation error — had no branded loading state, and could
 * show a blank flash while the browser waited for the new page.
 *
 * `useFormStatus()` only works inside the `<form>` it's reporting on,
 * which is why this needs to be its own small client component
 * dropped inside each form (same reason `SubmitButton` already works
 * this way) rather than something a Server Component page could just
 * compute. `pending` stays true for the whole round trip, including
 * through a `redirect()` inside the action, so this correctly covers
 * both the "saving" moment and the transition to wherever it redirects
 * — a success back to the plain view, or an error banner on the same
 * page.
 *
 * Rendered through a portal to `document.body` so it reliably covers
 * the full viewport regardless of where in the page the form itself
 * sits, or what overflow/stacking context its ancestors have.
 *
 * Usage: place `<FormPendingOverlay />` anywhere inside the `<form>`,
 * alongside the existing `<SubmitButton>` — it renders nothing of its
 * own until the form is actually submitting.
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
