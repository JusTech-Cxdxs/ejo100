import { getSecurityRoles, searchStaffOptions, loadStaffOptions } from '@/lib/actions/security';
import { requestContractorFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { ContractorForm } from '@/components/ContractorForm';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

export default async function NewContractorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const roles = await getSecurityRoles();
  return (
    <div className="p-4 sm:p-8">
      <LoadingLink href="/security/contractors" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Contractors</LoadingLink>
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Request a contractor pass</h1>
      <p className="mb-4 mt-1 max-w-2xl text-sm text-[var(--ejo-text-muted)]">The Manager approves it; Security then signs the team in and out at the gate on each working day it covers.</p>
      <SecurityNav active="/security/contractors" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="max-w-2xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
        <ContractorForm isFrontDesk={roles.isFrontDesk} action={requestContractorFormAction} search={searchStaffOptions} loadDefaultOptions={loadStaffOptions} />
      </div>
    </div>
  );
}
