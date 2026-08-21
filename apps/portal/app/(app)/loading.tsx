import { PageLoading } from '@/components/PageLoading';

/**
 * Next.js's built-in convention: a `loading.tsx` at this segment
 * automatically wraps every page under app/(app)/ in a Suspense
 * boundary, showing this the moment a navigation starts and swapping
 * to the real page the instant its data is ready — no per-page wiring
 * needed. Placed at this level (not per-route) so ONE file covers every
 * sidebar link at once: Dashboard, Company, Business Units, Countries,
 * States, Cities, Branches, Departments, Teams, Users, Roles,
 * Permissions, all of Workshop, Notifications, Audit Logs, and
 * everything else under this layout — directly addressing "click a
 * link, nothing visibly happens" across the whole app, not just the
 * few forms that already had their own loading states.
 *
 * Because `AppLayout` (the parent) renders Sidebar/Topbar around
 * `{children}`, and this loading.tsx only replaces `{children}` itself,
 * the Sidebar and Topbar stay mounted and visible throughout — nothing
 * flashes or disappears, only the content area shows the loading state.
 */
export default function AppLoading() {
  return <PageLoading />;
}
