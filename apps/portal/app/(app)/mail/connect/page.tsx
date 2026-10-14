import type { Metadata } from 'next';
import { currentAssist, NOT_DURING_ASSIST } from '@/lib/authz/server';
import { getMyMailbox } from '@/lib/actions/mail';
import { connectMailboxFormAction } from '@/lib/actions/mail-form-handlers';
import { PageHeader, EmptyState } from '@/components/ui';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { ConnectForm, type ConnectDefaults } from '@/components/mail/ConnectForm';
import { NOT_SET_UP } from '@/lib/mail/config';

export const metadata: Metadata = { title: 'Connect your mailbox' };

const KEYS = ['preset', 'address', 'displayName', 'imapHost', 'imapPort', 'imapSecurity', 'smtpHost', 'smtpPort', 'smtpSecurity', 'username'] as const;

export default async function ConnectMailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (await currentAssist()) {
    return <div className="p-4 sm:p-8"><PageHeader icon="mail" title="Connect your mailbox" /><EmptyState icon="lock" title="Not available during an assisted session">{NOT_DURING_ASSIST}</EmptyState></div>;
  }
  const box = await getMyMailbox();
  const error = typeof sp.error === 'string' ? sp.error : null;
  // Settings typed before an error come back (never the password); a reconnect starts from the saved settings.
  const defaults: ConnectDefaults = {};
  const a = box.account;
  if (a) Object.assign(defaults, { address: a.address, displayName: a.displayName ?? '', imapHost: a.imapHost, imapPort: String(a.imapPort), imapSecurity: a.imapSecurity, smtpHost: a.smtpHost, smtpPort: String(a.smtpPort), smtpSecurity: a.smtpSecurity, username: a.username, preset: a.imapHost === 'imap.gmail.com' ? 'gmail' : a.imapHost.startsWith('imap.zoho.') ? 'zoho' : 'custom' });
  for (const k of KEYS) {
    const v = sp[k];
    if (typeof v === 'string' && v && !(a && k === 'address')) defaults[k] = v.slice(0, 254);
  }
  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        icon="mail"
        title={a ? 'Update your mailbox password' : 'Connect your mailbox'}
        back={{ href: a ? '/mail/settings' : '/mail', label: a ? 'Mail settings' : 'Mail' }}
        description="Your own work mailbox only. Nobody else can see it here — administrators included."
      />
      {error ? <div className="max-w-2xl" role="alert"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {box.feature === 'not_set_up' ? (
        <EmptyState icon="settings" title={NOT_SET_UP}>Ask your administrator to set it up.</EmptyState>
      ) : (
        <ConnectForm action={connectMailboxFormAction} defaults={defaults} allowInsecure={box.allowInsecure} reconnect={Boolean(a)} />
      )}
    </div>
  );
}
