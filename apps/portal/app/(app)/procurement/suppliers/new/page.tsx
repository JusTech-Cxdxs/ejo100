import { allows, guardAnyPage } from '@/lib/authz/server';
import { createSupplierFormAction } from '@/lib/actions/procurement-form-handlers';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { SupplierFields } from '@/components/procurement/SupplierFields';
import { PageHeader, EmptyState } from '@/components/ui';
import { Banners, BTN, CARD } from '@/components/warehouse/forms';

export default async function NewSupplierPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await guardAnyPage(['procurement.view'], '/procurement/suppliers/new');
  const { error } = await searchParams;
  const canManage = await allows('procurement.po.manage');
  return (
    <div className="p-8">
      <PageHeader icon="handshake" back={{ href: '/procurement/suppliers', label: 'Back to Suppliers' }} title="Add a supplier" />
      <Banners status={undefined} error={error} map={{}} />
      {!canManage ? <EmptyState icon="lock" title="Only Procurement adds suppliers." /> : (
        <form action={createSupplierFormAction} className={`${CARD} relative max-w-3xl space-y-4`}>
          <FormPendingOverlay />
          <SupplierFields />
          <SubmitButton label="Add supplier" pendingLabel="Adding…" className={BTN} />
        </form>
      )}
    </div>
  );
}
