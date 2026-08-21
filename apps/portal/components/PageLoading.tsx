import { EjoSpinner } from './EjoSpinner';

/**
 * The loading state shown while a page's data is being fetched during
 * in-app navigation (clicking a sidebar link, submitting a search,
 * etc.) — deliberately NOT EjoLoader, which is a full-screen, fixed-
 * position takeover meant for the very first app load, before the
 * Sidebar/Topbar even exist. Using that here would cover them on every
 * single click. This is sized to sit inside the existing content area
 * instead — Sidebar and Topbar stay fully visible and stable, only the
 * page content itself shows the loading state, exactly matching how
 * Next.js's `loading.tsx` convention is meant to be used: it replaces
 * only `{children}` within the parent layout, not the whole screen.
 */
export function PageLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-[var(--ejo-primary)]">
      <EjoSpinner size={32} />
      <p className="text-sm text-[var(--ejo-text-muted)]">Loading…</p>
    </div>
  );
}
