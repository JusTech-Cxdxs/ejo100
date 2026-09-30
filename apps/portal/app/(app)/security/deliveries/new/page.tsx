import { getSecurityRoles } from '@/lib/actions/security';
import { registerDeliveryFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { DeliveryForm } from '@/components/DeliveryForm';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

export default async function NewDeliveryPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const roles = await getSecurityRoles();
  return (
    <div className="p-4 sm:p-8">
      <LoadingLink href="/security/deliveries" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Deliveries</LoadingLink>
      <h1 className="mb-4 text-2xl font-bold text-[var(--ejo-text)]">Record a delivery</h1>
      <SecurityNav active="/security/deliveries" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="max-w-2xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
        <DeliveryForm canGate={roles.isGate} action={registerDeliveryFormAction} />
      </div>
    </div>
  );
}
