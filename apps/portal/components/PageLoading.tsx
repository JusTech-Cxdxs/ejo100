import { EjoMarkSpinner } from './EjoMarkSpinner';

/**
 * Loading state inside the content area during navigation. EjoLoader is the
 * full-screen first-load version; this one leaves the sidebar and top bar
 * visible.
 */
export function PageLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <EjoMarkSpinner size={64} />
      <p className="text-sm text-[var(--ejo-text-muted)]">Loading…</p>
    </div>
  );
}
