import { notFound } from 'next/navigation';
import { guardPage, NOT_AVAILABLE } from '@/lib/authz/server';
import { getSupportTicket } from '@/lib/actions/support';
import { assignSupportTicketAction, setSupportTicketStatusAction } from '@/lib/actions/support-form-handlers';
import { PageHeader, SectionCard, StatusChip, EmptyState, type Tone } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { SupportReplyForm } from '@/components/support/SupportReplyForm';
import { formatDateTime } from '@/lib/utils/format-date';
import { SUPPORT_STATUSES, SUPPORT_STATUS_LABEL, type SupportStatus } from '@/lib/support-rules';

export const metadata = { title: 'Support ticket' };
export const dynamic = 'force-dynamic';

const TONE: Record<SupportStatus, Tone> = { OPEN: 'info', WAITING_ON_CUSTOMER: 'warning', RESOLVED: 'success', CLOSED: 'neutral' };

const STATUS_NOTICE: Record<string, { kind: 'success' | 'warning'; text: string }> = {
  replied_emailed: { kind: 'success', text: 'Reply sent and emailed to the customer.' },
  replied_no_email: { kind: 'warning', text: 'Reply saved. There is no email address on this ticket, so please call the customer.' },
  replied_email_failed: { kind: 'warning', text: 'Reply saved, but the email could not be sent. It shows in their customer portal; consider calling them.' },
  replied: { kind: 'success', text: 'Reply sent.' },
  status_changed: { kind: 'success', text: 'Status changed.' },
  assigned: { kind: 'success', text: 'Ticket assigned.' },
  unassigned: { kind: 'success', text: 'Ticket is no longer assigned to anyone.' },
};

const btn = 'min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50';
const select = 'min-h-11 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm text-[var(--ejo-text)]';

/** One support ticket: Enyo's summary, the replies and a reply box, status and assignment, and the conversation (read-only). */
export default async function SupportTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardPage('support.tickets.manage', '/crm/support/[id]');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const t = await getSupportTicket(id).catch((err: unknown) => {
    if (err instanceof Error && err.message === NOT_AVAILABLE) return null;
    throw err;
  });
  if (!t) notFound();
  const notice = sp.status ? STATUS_NOTICE[sp.status] : null;

  return (
    <div className="w-full max-w-6xl p-4 sm:p-8">
      <PageHeader
        icon="inbox"
        title={t.number}
        back={{ href: '/crm/support', label: 'Support inbox' }}
        eyebrow={t.channel === 'WEBSITE' ? 'Website enquiry' : 'Customer portal'}
        description={t.subject}
        meta={<>
          <StatusChip tone={TONE[t.status]} label={t.statusLabel} />
          {t.branchName ? <span className="text-xs text-[var(--ejo-text-muted)]">{t.branchName}</span> : null}
        </>}
      />
      {sp.error ? <FormFeedbackBanner kind="error" message={sp.error} /> : null}
      {notice ? <FormFeedbackBanner kind={notice.kind} message={notice.text} /> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <SectionCard icon="sparkles" title="Enyo’s summary" description="Written by Enyo from the conversation. Check the conversation below before relying on it.">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--ejo-text)]">{t.summary}</p>
          </SectionCard>

          <SectionCard icon="mail" title="Replies" id="replies" description={t.replies.length ? `${t.replies.length === 1 ? '1 message' : `${t.replies.length} messages`} on this ticket` : 'No replies yet'}>
            {t.replies.length ? (
              <ol className="mb-5 space-y-3" aria-label="Messages on this ticket">
                {t.replies.map((r) => (
                  <li key={r.id} className={`rounded-[var(--ejo-radius-md)] border px-3 py-2.5 ${r.fromCustomer ? 'mr-6 border-[var(--ejo-border)] bg-[var(--ejo-bg)]' : 'ml-6 border-[var(--ejo-primary)]/20 bg-[var(--ejo-primary)]/[0.06]'}`}>
                    <p className="text-xs text-[var(--ejo-text-muted)]"><span className="font-semibold text-[var(--ejo-text)]">{r.fromCustomer ? `${r.author} (customer)` : r.author}</span> · {formatDateTime(r.createdAt)}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--ejo-text)]">{r.body}</p>
                  </li>
                ))}
              </ol>
            ) : null}
            <SupportReplyForm ticketId={t.id} emailTo={t.emailTo} phone={t.contactPhone} />
          </SectionCard>

          <SectionCard icon="list" title="Conversation with Enyo" description="Read-only. What the customer asked and what Enyo answered before the hand-over.">
            {t.transcript.length ? (
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-[var(--ejo-primary)]">Show the conversation ({t.transcript.length === 1 ? '1 message' : `${t.transcript.length} messages`})</summary>
                <ol className="mt-3 space-y-2" data-testid="support-transcript">
                  {t.transcript.map((m) => (
                    <li key={m.id} className={`rounded-[var(--ejo-radius-md)] px-3 py-2 text-sm ${m.role === 'customer' ? 'bg-[var(--ejo-bg)]' : 'border border-[var(--ejo-border)]'}`}>
                      <p className="text-xs text-[var(--ejo-text-muted)]"><span className="font-semibold">{m.role === 'customer' ? t.contactName : 'Enyo'}</span> · {formatDateTime(m.at)}</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-[var(--ejo-text)]">{m.text}</p>
                    </li>
                  ))}
                </ol>
              </details>
            ) : <EmptyState icon="list" title="No conversation kept" compact>The conversation may have been removed after its retention period.</EmptyState>}
          </SectionCard>
        </div>

        <aside className="min-w-0 space-y-6">
          <SectionCard icon="user" title="Customer">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-[var(--ejo-text-muted)]">Name</dt><dd className="font-medium text-[var(--ejo-text)]">{t.customerId ? <CustomerLink id={t.customerId} name={t.customerName ?? t.contactName} canView={t.canCrm} /> : t.contactName}</dd></div>
              {t.contactPhone ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">Phone</dt><dd><a className="font-medium text-[var(--ejo-primary)] underline" href={`tel:${t.contactPhone.replace(/[^\d+]/g, '')}`}>{t.contactPhone}</a></dd></div> : null}
              {t.emailTo ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">Email</dt><dd className="break-all font-medium text-[var(--ejo-text)]">{t.emailTo}</dd></div> : null}
              <div><dt className="text-xs text-[var(--ejo-text-muted)]">Opened</dt><dd className="text-[var(--ejo-text)]">{formatDateTime(t.createdAt)}</dd></div>
              <div><dt className="text-xs text-[var(--ejo-text-muted)]">First response</dt><dd className="text-[var(--ejo-text)]">{t.firstResponse ? `${t.firstResponse} after opening` : 'Not answered yet'}</dd></div>
              {t.resolvedAt ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">Resolved</dt><dd className="text-[var(--ejo-text)]">{formatDateTime(t.resolvedAt)}</dd></div> : null}
            </dl>
          </SectionCard>

          <SectionCard icon="user-plus" title="Assigned to" description={t.assignedTo ? (t.mine ? 'You' : t.assignedTo) : 'Nobody yet'}>
            <div className="space-y-3">
              {!t.mine ? (
                <form action={assignSupportTicketAction}>
                  <input type="hidden" name="ticketId" value={t.id} />
                  <input type="hidden" name="assignee" value="me" />
                  <SubmitButton label="Assign to me" pendingLabel="Assigning…" className={`${btn} w-full`} />
                </form>
              ) : null}
              {t.colleagues.length ? (
                <form action={assignSupportTicketAction} className="space-y-2">
                  <input type="hidden" name="ticketId" value={t.id} />
                  <label htmlFor="support-assignee" className="block text-xs font-medium text-[var(--ejo-text-muted)]">Give it to a colleague</label>
                  <select id="support-assignee" name="assignee" defaultValue={t.assignedToId ?? ''} className={select}>
                    <option value="">Nobody</option>
                    {t.colleagues.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <SubmitButton label="Assign" pendingLabel="Assigning…" className={`${btn} w-full`} />
                </form>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard icon="check-circle" title="Status">
            <form action={setSupportTicketStatusAction} className="space-y-2">
              <input type="hidden" name="ticketId" value={t.id} />
              <label htmlFor="support-status" className="block text-xs font-medium text-[var(--ejo-text-muted)]">Set the status</label>
              <select id="support-status" name="status" defaultValue={t.status} className={select}>
                {SUPPORT_STATUSES.map((s) => <option key={s} value={s}>{SUPPORT_STATUS_LABEL[s]}</option>)}
              </select>
              <SubmitButton label="Change status" pendingLabel="Saving…" className={`${btn} w-full`} />
            </form>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
