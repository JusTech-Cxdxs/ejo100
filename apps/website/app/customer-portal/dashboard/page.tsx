import { PagePlaceholder } from '@/components/PagePlaceholder';

/**
 * Customer accounts land here after signing in (see /customer-portal).
 * Protected by middleware.ts. Real content (vehicles, invoices, job
 * history) arrives with the Workshop module's customer-facing views in
 * a later phase — this route exists now so the redirect-after-login
 * target is real, not a 404.
 */
export default function CustomerDashboardPage() {
  return (
    <PagePlaceholder
      title="Customer Dashboard"
      description="Your vehicles, job history and invoices will appear here once the Workshop module is live."
    />
  );
}
