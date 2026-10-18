import { allows, guardAnyPage } from '@/lib/authz/server';
import { listWarrantyPolicyOptions } from '@/lib/actions/catalogue';
import { createProductFormAction } from '@/lib/actions/catalogue-form-handlers';
import { ProductFields } from '@/components/catalogue/ProductFields';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { EmptyState, PageHeader } from '@/components/ui';
import { btn } from '@/components/production/styles';

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await guardAnyPage(['catalogue.view'], '/catalogue/products/new');
  const { error } = await searchParams;
  const [canManage, policies] = await Promise.all([allows('catalogue.manage'), listWarrantyPolicyOptions()]);
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader icon="package" title="New product" back={{ href: '/catalogue/products', label: 'Back to Products' }} description="A sellable model. Add its configurations and bill of materials on the product page afterwards." />
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}
      {!canManage ? (
        <EmptyState icon="lock" title="Only the Catalogue team adds products">The Production Manager and the Commercial Director manage the catalogue. Ask them to add this model.</EmptyState>
      ) : (
        <form action={createProductFormAction} className="max-w-3xl space-y-5 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-6">
          <FormPendingOverlay />
          <ProductFields policies={policies} />
          <SubmitButton label="Add product" pendingLabel="Adding…" className={btn} />
        </form>
      )}
    </div>
  );
}
