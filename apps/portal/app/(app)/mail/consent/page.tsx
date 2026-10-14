import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentAssist, NOT_DURING_ASSIST } from '@/lib/authz/server';
import { getMyMailbox } from '@/lib/actions/mail';
import { PageHeader, EmptyState, HeaderAction } from '@/components/ui';
import { ConsentChoice } from '@/components/mail/ConsentChoice';

export const metadata: Metadata = { title: 'Enyo and your email' };

/** Right after connecting: the person decides whether Enyo may read their mail. */
export default async function MailConsentPage() {
  if (await currentAssist()) {
    return <div className="p-4 sm:p-8"><PageHeader icon="mail" title="Enyo and your email" /><EmptyState icon="lock" title="Not available during an assisted session">{NOT_DURING_ASSIST}</EmptyState></div>;
  }
  const box = await getMyMailbox();
  if (!box.account) redirect('/mail');
  return (
    <div className="p-4 sm:p-8">
      <PageHeader icon="sparkles" title="Enyo and your email" description={`Your mailbox ${box.account.address} is connected.`} />
      {box.aiAvailable ? (
        <section className="max-w-2xl rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
          <ConsentChoice from="connect" current={box.account.aiConsent} />
        </section>
      ) : (
        <EmptyState icon="check-circle" title="Your mailbox is connected" action={<HeaderAction href="/mail" icon="mail">Open Mail</HeaderAction>}>
          Enyo for email is switched off for your organisation, so Enyo will not read your mail.
        </EmptyState>
      )}
    </div>
  );
}
