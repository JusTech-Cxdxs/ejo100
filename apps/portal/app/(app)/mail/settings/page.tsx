import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentAssist, NOT_DURING_ASSIST } from '@/lib/authz/server';
import { getMyMailbox } from '@/lib/actions/mail';
import { disconnectMailboxFormAction } from '@/lib/actions/mail-form-handlers';
import { PageHeader, SectionCard, EmptyState, HeaderAction } from '@/components/ui';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { ConsentChoice } from '@/components/mail/ConsentChoice';
import { formatLagos, relativeTime } from '@/lib/reminders-rules';

export const metadata: Metadata = { title: 'Mail settings' };

const STATUS: Record<string, string> = {
  reconnected: 'Password updated. Your mail will be checked again.',
  consent_given: 'Thank you. Enyo will sort and summarise new mail.',
  consent_withdrawn: 'Withdrawn. Enyo no longer reads your mail, and every summary was deleted.',
  consent_declined: 'Understood. Enyo will not read your email.',
};
const SECURITY = { tls: 'SSL/TLS', starttls: 'STARTTLS', none: 'None (test server)' } as const;

export default async function MailSettingsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string }> }) {
  const sp = await searchParams;
  if (await currentAssist()) {
    return <div className="p-4 sm:p-8"><PageHeader icon="settings" title="Mail settings" /><EmptyState icon="lock" title="Not available during an assisted session">{NOT_DURING_ASSIST}</EmptyState></div>;
  }
  const box = await getMyMailbox();
  const a = box.account;
  if (!a) redirect('/mail');
  return (
    <div className="p-4 sm:p-8">
      <PageHeader icon="settings" title="Mail settings" back={{ href: '/mail', label: 'Mail' }} description="Your own mailbox. Only you can see or change these settings." />
      {sp.status && STATUS[sp.status] ? <div className="max-w-3xl" role="status"><FormFeedbackBanner kind="success" message={STATUS[sp.status]!} /></div> : null}
      {sp.error ? <div className="max-w-3xl" role="alert"><FormFeedbackBanner kind="error" message={sp.error} /></div> : null}
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <SectionCard icon="mail" title="Mailbox" actions={<HeaderAction href="/mail/connect" icon="key" variant="secondary">Update password</HeaderAction>}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-[var(--ejo-text-muted)]">Address</dt><dd className="break-all text-[var(--ejo-text)]">{a.address}</dd>
            <dt className="text-[var(--ejo-text-muted)]">Name</dt><dd className="text-[var(--ejo-text)]">{a.displayName || '—'}</dd>
            <dt className="text-[var(--ejo-text-muted)]">Incoming</dt><dd className="break-all text-[var(--ejo-text)]">{a.imapHost}:{a.imapPort} · {SECURITY[a.imapSecurity]}</dd>
            <dt className="text-[var(--ejo-text-muted)]">Outgoing</dt><dd className="break-all text-[var(--ejo-text)]">{a.smtpHost}:{a.smtpPort} · {SECURITY[a.smtpSecurity]}</dd>
            <dt className="text-[var(--ejo-text-muted)]">Password</dt><dd className="text-[var(--ejo-text)]">Saved, encrypted — never shown</dd>
            <dt className="text-[var(--ejo-text-muted)]">Last checked</dt><dd className="text-[var(--ejo-text)]">{a.lastSyncAt ? `${formatLagos(a.lastSyncAt)} (${relativeTime(a.lastSyncAt)})` : 'Not yet'}</dd>
            <dt className="text-[var(--ejo-text-muted)]">Status</dt>
            <dd className={a.status === 'ERROR' ? 'text-[var(--ejo-error)]' : 'text-[var(--ejo-success)]'}>{a.status === 'ERROR' ? a.lastError ?? 'There is a problem reading the mailbox.' : 'Working'}</dd>
          </dl>
          <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">The portal keeps copies of the last 90 days of your inbox (text only) so you can search them. Your mailbox itself is never changed, except for read, flag and answered marks.</p>
        </SectionCard>

        <SectionCard id="enyo" icon="sparkles" title="Enyo and your email">
          {box.aiAvailable ? (
            <>
              <p className="mb-3 text-sm text-[var(--ejo-text-muted)]">{a.aiConsent && a.aiConsentAt ? `You allowed this on ${formatLagos(a.aiConsentAt)}.` : 'Enyo does not read your email at the moment.'}</p>
              <ConsentChoice from="settings" current={a.aiConsent} />
            </>
          ) : <p className="text-sm text-[var(--ejo-text-muted)]">Enyo for email is switched off for your organisation, so Enyo does not read your mail.</p>}
        </SectionCard>

        <SectionCard icon="trash" tone="error" title="Disconnect" description="Removes the mailbox from the portal: its settings, the encrypted password, every stored copy and every summary. Your mailbox itself is not touched.">
          <form action={disconnectMailboxFormAction} className="space-y-3">
            <FormPendingOverlay />
            <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--ejo-text)]">
              <input type="checkbox" name="confirm" value="yes" required className="h-5 w-5 accent-[var(--ejo-error)]" />
              Yes, disconnect {a.address}
            </label>
            <SubmitButton label="Disconnect mailbox" pendingLabel="Disconnecting…" className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-error)] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110" />
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
