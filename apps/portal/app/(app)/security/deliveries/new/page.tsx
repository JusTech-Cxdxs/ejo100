import { guardAnyPage } from '@/lib/authz/server';
import { getSecurityRoles } from '@/lib/actions/security';
import { registerDeliveryFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { DeliveryForm } from '@/components/DeliveryForm';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { BackLink, PageTitle } from '@/components/ui';

export default async function NewDeliveryPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await guardAnyPage(['security.view', 'store.grn.record'], '/security/deliveries');
  const { error } = await searchParams;
  const roles = await getSecurityRoles();
  return (
    <div className="p-4 sm:p-8">
      <BackLink href="/security/deliveries" label="Back to Deliveries" className="mb-4" />
      <PageTitle icon="truck" className="mb-4">Record a delivery</PageTitle>
      <SecurityNav active="/security/deliveries" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="max-w-2xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
        <DeliveryForm canGate={roles.isGate} action={registerDeliveryFormAction} />
      </div>
    </div>
  );
}
