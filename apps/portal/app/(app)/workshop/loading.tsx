import { PageLoading } from '@/components/PageLoading';

/**
 * The top-level loading boundary doesn't re-show when moving between sibling
 * routes inside Workshop, so this segment has its own.
 */
export default function WorkshopLoading() {
  return <PageLoading />;
}
