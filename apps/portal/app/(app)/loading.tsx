import { PageLoading } from '@/components/PageLoading';

/**
 * Loading state for every page under app/(app)/. It replaces only the
 * content area, so the sidebar and top bar stay in place during navigation.
 */
export default function AppLoading() {
  return <PageLoading />;
}
