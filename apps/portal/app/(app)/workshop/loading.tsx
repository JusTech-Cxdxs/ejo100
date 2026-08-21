import { PageLoading } from '@/components/PageLoading';

/**
 * A dedicated loading boundary specifically for the Workshop subtree —
 * not redundant with the one at app/(app)/loading.tsx.
 *
 * The top-level loading.tsx correctly fires the first time a whole new
 * section is entered (e.g. Dashboard → Workshop), but navigating
 * between SIBLING routes already inside that same, already-resolved
 * boundary (Customers → Vehicles → Job Cards) doesn't reliably re-show
 * it — a real, documented Next.js App Router nuance, not a bug in the
 * loading UI itself. This more specific boundary, placed right at the
 * `/workshop` segment, is what actually fixes that: Next.js creates a
 * fresh Suspense boundary here, one level closer to the actual pages
 * doing the data-fetching, so navigation between Customers, Vehicles,
 * Job Cards, and a Job Card's own detail page all correctly show this
 * while their data loads — not just the very first entry into Workshop.
 */
export default function WorkshopLoading() {
  return <PageLoading />;
}
