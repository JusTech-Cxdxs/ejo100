import type { Metadata } from 'next';
import { currentAssist, NOT_DURING_ASSIST } from '@/lib/authz/server';
import { getMessageForCompose, getMyMailbox } from '@/lib/actions/mail';
import { sendMailFormAction } from '@/lib/actions/mail-form-handlers';
import { PageHeader, EmptyState, HeaderAction } from '@/components/ui';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { LoadingLink } from '@/components/LoadingLink';
import { NOT_SET_UP } from '@/lib/mail/config';
import { BODY_MAX, parseComposePrefill, quoteForReply, replySubject, SUBJECT_MAX } from '@/lib/mail/rules';
import { formatLagos } from '@/lib/reminders-rules';
import { RefineTextButton } from '@/components/enyo/RefineTextButton';
import { MailStyleField } from '@/components/mail/MailStyleField';
import { RecipientField } from '@/components/mail/RecipientField';
import { LiveMailPreview } from '@/components/mail/LiveMailPreview';
import { MAIL_STYLES, type MailStyle } from '@/lib/email-templates/personal-mail-styles';

export const metadata: Metadata = { title: 'New message' };

const input = 'min-h-11 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

/**
 * Write, reply or forward. Pre-fill (from a Reply button or an Enyo draft):
 * ?to= &cc= &subject= &body= &inReplyTo=<message> [&all=1] | &forward=<message>
 * — every value checked and clipped. Nothing is sent until Send is pressed.
 * Sent through the person's own mail server; nothing is stored here.
 */
export default async function ComposePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (await currentAssist()) {
    return <div className="p-4 sm:p-8"><PageHeader icon="mail" title="New message" /><EmptyState icon="lock" title="Not available during an assisted session">{NOT_DURING_ASSIST}</EmptyState></div>;
  }
  const box = await getMyMailbox();
  if (box.feature === 'not_set_up' || !box.account) {
    return (
      <div className="p-4 sm:p-8">
        <PageHeader icon="mail" title="New message" back={{ href: '/mail', label: 'Mail' }} />
        {box.feature === 'not_set_up'
          ? <EmptyState icon="settings" title={NOT_SET_UP}>Ask your administrator to set it up.</EmptyState>
          : <EmptyState icon="mail" title="Connect your mailbox first" action={<HeaderAction href="/mail/connect" icon="mail">Connect mailbox</HeaderAction>}>Messages are sent from your own work address.</EmptyState>}
      </div>
    );
  }
  const p = parseComposePrefill(sp);
  const error = typeof sp.error === 'string' ? sp.error : null;
  const kept = sp.kept === '1';
  const refId = p.inReplyTo ?? p.forwardOf ?? null;
  const original = refId ? await getMessageForCompose(refId).catch(() => null) : null;
  let { to, cc, subject, body } = p;
  let heading = 'New message';
  if (original && p.inReplyTo) {
    heading = p.replyAll ? 'Reply all' : 'Reply';
    const own = original.ownAddress.toLowerCase();
    if (!to) {
      const all = p.replyAll ? [original.fromAddress, ...original.to.map((a) => a.address)] : [original.fromAddress];
      to = [...new Set(all.map((a) => a.toLowerCase()).filter((a) => a !== own))].join(', ');
    }
    if (!cc && p.replyAll) cc = [...new Set(original.cc.map((a) => a.address.toLowerCase()).filter((a) => a !== own))].join(', ');
    if (!subject) subject = replySubject(original.subject, 'reply');
    if (!kept) body = `${body}${quoteForReply({ fromName: original.fromName, fromAddress: original.fromAddress, when: formatLagos(original.receivedAt), body: original.body })}`.slice(0, BODY_MAX);
  } else if (original && p.forwardOf) {
    heading = 'Forward';
    if (!subject) subject = replySubject(original.subject, 'forward');
    if (!kept) {
      const header = ['', '', '---------- Forwarded message ----------', `From: ${original.fromName ? `${original.fromName} <${original.fromAddress}>` : original.fromAddress}`, `Date: ${formatLagos(original.receivedAt)}`, `Subject: ${original.subject}`, `To: ${original.to.map((a) => a.address).join(', ')}`, ''].join('\n');
      body = `${body}${header}\n${original.body}`.slice(0, BODY_MAX);
    }
  }
  const replyGone = Boolean(refId) && !original;
  const initialStyle: MailStyle = (MAIL_STYLES as readonly string[]).includes(String(sp.style)) ? (sp.style as MailStyle) : 'standard';
  return (
    <div className="p-4 sm:p-8">
      <PageHeader icon="mail" title={heading} back={{ href: original ? `/mail?m=${original.id}` : '/mail', label: 'Mail' }}
        description={`From ${box.account.displayName ? `${box.account.displayName} <${box.account.address}>` : box.account.address} · read it and change anything you like before you press Send.`} />
      {error ? <div className="max-w-3xl" role="alert"><FormFeedbackBanner kind="error" message={error} /></div> : null}
      {replyGone ? <div className="max-w-3xl" role="status"><FormFeedbackBanner kind="warning" message="The message you are answering is no longer here, so this is sent as a new message." /></div> : null}
      {p.forwardOf && original?.hasAttachments ? <div className="max-w-3xl" role="status"><FormFeedbackBanner kind="warning" message="Attachments are not forwarded from here. To forward them, use your usual mail app." /></div> : null}
      {/* The form on the left; on wide screens, what the recipient sees on the right, live. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,48rem)_minmax(0,1fr)]">
      <form id="mail-compose" action={sendMailFormAction} className="relative min-w-0 space-y-4 rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-6">
        <FormPendingOverlay />
        {original && p.inReplyTo ? <input type="hidden" name="inReplyTo" value={original.id} /> : null}
        <RecipientField id="mail-to" name="to" label="To" required defaultValue={to} placeholder="Type a name, branch or department — or an email address" className={input} />
        {/* Cc stays out of the way until wanted (open when a reply-all filled it). */}
        <details open={Boolean(cc) || undefined} className="group">
          <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-[var(--ejo-radius-md)] text-sm font-medium text-[var(--ejo-primary)] hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">+ Add Cc</span><span className="hidden group-open:inline">Cc</span>
          </summary>
          <div className="mt-1">
            <RecipientField id="mail-cc" name="cc" label="Cc" defaultValue={cc} placeholder="Copy others (optional)" className={input} />
          </div>
        </details>
        <div>
          <label htmlFor="mail-subject" className={label}>Subject</label>
          <input id="mail-subject" name="subject" required maxLength={SUBJECT_MAX} defaultValue={subject} className={input} autoComplete="off" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label htmlFor="mail-body" className={label.replace('mb-1 ', '')}>Message</label>
            <RefineTextButton targetId="mail-body" />
          </div>
          <textarea id="mail-body" name="body" required rows={14} maxLength={BODY_MAX} defaultValue={body} className={`${input} min-h-64 font-[inherit] leading-relaxed`} />
          <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">Sent from your own mailbox. Your text is placed in the organisation&apos;s letterhead unless you choose plain text.</p>
        </div>
        <MailStyleField initial={initialStyle} />
        <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap items-center gap-3 border-t border-[var(--ejo-border)] bg-[var(--ejo-surface)] px-4 py-3 sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:p-0">
          <SubmitButton label="Send" pendingLabel="Sending…" className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-6 py-2.5 text-sm font-medium text-white hover:brightness-110" />
          <LoadingLink href={original ? `/mail?m=${original.id}` : '/mail'} className="min-h-11 rounded-[var(--ejo-radius-md)] px-4 py-2.5 text-sm font-medium text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">Discard</LoadingLink>
        </div>
      </form>
      <LiveMailPreview formId="mail-compose" initialStyle={initialStyle} />
      </div>
    </div>
  );
}
