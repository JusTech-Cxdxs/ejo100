import { PageLoading } from './PageLoading';

/**
 * The branded loading state for every page segment (each folder's
 * loading.tsx re-exports this). Without one in a segment, moving between its
 * sub-pages (Settings → Enyo, a Job Card → another) kept the old page on
 * screen with no sign of progress; now the content area shows the EJO mark
 * at once, while the sidebar and top bar stay in place.
 */
export default function RouteLoading() {
  return <PageLoading />;
}
