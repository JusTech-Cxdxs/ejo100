import { listAudienceOptions, canBroadcast } from '@/lib/actions/notifications';
import { createBroadcastFormAction } from '@/lib/actions/notification-form-handlers';
import { LoadingLink } from '@/components/LoadingLink';
import { BroadcastForm } from '@/components/BroadcastForm';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';

export default async function NewBroadcastPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [options, allowed] = await Promise.all([listAudienceOptions(), canBroadcast()]);
  return (
    <div className="w-full p-4 sm:p-8">
      <LoadingLink href="/notifications/broadcasts" className="mb-4 inline-block text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">← Back to Broadcasts</LoadingLink>
      <h1 className="mb-4 text-2xl font-bold text-[var(--ejo-text)]">New broadcast</h1>
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {!allowed ? <p className="text-sm text-[var(--ejo-text-muted)]">Only a Broadcaster or an administrator can publish broadcasts.</p> : (
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <BroadcastForm options={options} action={createBroadcastFormAction} />
        </div>
      )}
    </div>
  );
}
