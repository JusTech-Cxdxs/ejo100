import { getMe, searchStaffOptions, loadStaffOptions } from '@/lib/actions/security';
import { createExitPassFormAction } from '@/lib/actions/security-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { SecurityNav } from '@/components/SecurityNav';
import { ExitPassForm } from '@/components/ExitPassForm';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

export default async function NewExitPassPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const me = await getMe();
  return (
    <div className="p-4 sm:p-8">
      <LoadingLink href="/security/exit-passes" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Exit passes</LoadingLink>
      <h1 className="text-2xl font-bold text-[var(--ejo-text)]">Request an exit pass</h1>
      <p className="mb-4 mt-1 max-w-2xl text-sm text-[var(--ejo-text-muted)]">Authorised by the Department Head, then approved by the Manager. Security records the actual time out and time in.</p>
      <SecurityNav active="/security/exit-passes" />
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      <div className="max-w-2xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
        <ExitPassForm me={{ id: me.id, name: me.fullName }} action={createExitPassFormAction} search={searchStaffOptions} loadDefaultOptions={loadStaffOptions} />
      </div>
    </div>
  );
}
