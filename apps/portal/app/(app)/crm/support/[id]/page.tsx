import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardPage, NOT_AVAILABLE } from '@/lib/authz/server';
import { getSupportTicket } from '@/lib/actions/support';
import {
  assignSupportTicketAction, moveSupportTicketAction, saveSupportAnswerAction, setSupportPriorityAction, setSupportTicketStatusAction, summariseSupportTicketAction,
} from '@/lib/actions/support-form-handlers';
import { PageHeader, SectionCard, StatusChip, EmptyState, Icon, type Tone } from '@/components/ui';
import { CustomerLink } from '@/components/CustomerLink';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { SupportReplyForm } from '@/components/support/SupportReplyForm';
import { SupportNoteForm } from '@/components/support/SupportNoteForm';
import { SupportSenderCard } from '@/components/support/SupportSenderCard';
import { formatDateTime } from '@/lib/utils/format-date';
import { SUPPORT_STATUSES, SUPPORT_STATUS_LABEL, type SupportStatus } from '@/lib/support-rules';
import { CHANNEL_LABEL, PRIORITIES, PRIORITY_LABEL } from '@/lib/support/core';
import { formatSize } from '@/lib/mail/parse-core';

export const metadata = { title: 'Support request' };
export const dynamic = 'force-dynamic';

const TONE: Record<SupportStatus, Tone> = { OPEN: 'info', WAITING_ON_CUSTOMER: 'warning', ON_HOLD: 'neutral', RESOLVED: 'success', CLOSED: 'neutral' };

const STATUS_NOTICE: Record<string, { kind: 'success' | 'warning'; text: string }> = {
  replied_emailed: { kind: 'success', text: 'Reply sent and emailed to the customer.' },
  replied_no_email: { kind: 'warning', text: 'Reply saved. There is no email address on this ticket, so please call the customer.' },
  replied_email_failed: { kind: 'warning', text: 'Reply saved, but the email could not be sent. It shows in their customer portal; consider calling them.' },
  replied: { kind: 'success', text: 'Reply sent.' },
  note_added: { kind: 'success', text: 'Note added. Only colleagues can see it.' },
  status_changed: { kind: 'success', text: 'Status changed.' },
  assigned: { kind: 'success', text: 'Ticket assigned.' },
  unassigned: { kind: 'success', text: 'Ticket is no longer assigned to anyone.' },
  priority_changed: { kind: 'success', text: 'Priority changed. The target moves with it until the first answer.' },
  moved: { kind: 'success', text: 'Moved to the other team.' },
  summarised: { kind: 'success', text: 'Enyo wrote a new summary of the whole conversation.' },
  answer_saved: { kind: 'success', text: 'Saved for Enyo to learn. An administrator approves it on the Enyo learning page before Enyo uses it.' },
  answer_skipped: { kind: 'warning', text: 'Not saved: this answer is about one customer’s own records (or names a plate or record), so it would not help others.' },
  created: { kind: 'success', text: 'Request opened. It has a number, a team and a target like any other.' },
};

const btn = 'min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-4 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50';
const select = 'min-h-11 w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 text-sm text-[var(--ejo-text)]';
const SLA_TEXT: Record<string, string> = { breached: 'text-[var(--ejo-error)]', due_soon: 'text-[var(--ejo-warning-text)]', on_track: 'text-[var(--ejo-text)]', met: 'text-[var(--ejo-success)]', none: 'text-[var(--ejo-text-muted)]' };

/** One support request: summary and why a person is needed, the whole thread with notes, reply (with Enyo's draft), the customer's vehicles and jobs, and the controls. */
export default async function SupportTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  await guardPage('support.tickets.manage', '/crm/support/[id]');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const t = await getSupportTicket(id).catch((err: unknown) => {
    if (err instanceof Error && err.message === NOT_AVAILABLE) return null;
    throw err;
  });
  if (!t) notFound();
  const notice = sp.status ? STATUS_NOTICE[sp.status] : null;
  const lastAgentReply = [...t.replies].reverse().find((r) => r.kind === 'AGENT' && !r.internal);

  return (
    <div className="w-full max-w-7xl p-4 sm:p-8">
      <PageHeader
        icon="inbox"
        title={t.number}
        back={{ href: '/crm/support', label: 'Support centre' }}
        eyebrow={CHANNEL_LABEL[t.channel] ?? t.channel}
        description={t.subject}
        meta={<>
          <StatusChip tone={TONE[t.status]} label={t.statusLabel} />
          {t.priority !== 'NORMAL' ? <StatusChip tone={t.priority === 'URGENT' ? 'error' as Tone : t.priority === 'HIGH' ? 'warning' : 'neutral'} label={`${PRIORITY_LABEL[t.priority]} priority`} /> : null}
          {t.queueName ? <span className="text-xs text-[var(--ejo-text-muted)]">{t.queueName}</span> : null}
          {t.branchName ? <span className="text-xs text-[var(--ejo-text-muted)]">{t.branchName}</span> : null}
          {t.dueLabel ? <span className={`text-xs font-semibold ${SLA_TEXT[t.sla]}`}>First answer: {t.dueLabel}</span> : null}
        </>}
      />
      {sp.error ? <FormFeedbackBanner kind="error" message={sp.error} /> : null}
      {notice ? <FormFeedbackBanner kind={notice.kind} message={notice.text} /> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <SectionCard icon="sparkles" title="Enyo’s summary" description="Written by Enyo. Check the messages below before relying on it."
            actions={<form action={summariseSupportTicketAction}><input type="hidden" name="ticketId" value={t.id} /><SubmitButton label="Summarise again" pendingLabel="Summarising…" className="min-h-9 rounded-full px-3 text-xs font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/10" /></form>}>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--ejo-text)]">{t.summary}</p>
            {t.handover.length || t.topic || t.sentiment ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {t.topic ? <span className="rounded-full bg-[var(--ejo-bg)] px-2.5 py-1 text-xs text-[var(--ejo-text)] ring-1 ring-inset ring-[var(--ejo-border)]">{t.topic}</span> : null}
                {t.sentiment === 'negative' ? <span className="rounded-full bg-[var(--ejo-error)]/10 px-2.5 py-1 text-xs font-medium text-[var(--ejo-error)]">Sounds upset</span> : null}
                {t.handover.map((h) => <span key={h} className="rounded-full bg-[var(--ejo-warning)]/12 px-2.5 py-1 text-xs text-[var(--ejo-warning-text)]">{h}</span>)}
              </div>
            ) : null}
            {t.aiOutcome ? (
              <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">
                {t.aiOutcome === 'CONFIRMED' ? 'Enyo answered and the customer confirmed it solved the problem.'
                  : t.aiOutcome === 'ASSUMED' ? 'Enyo answered and the customer did not ask anything more.'
                    : t.aiOutcome === 'ESCALATED' ? 'Enyo answered, but the customer still needed a person.'
                      : 'Enyo answered; waiting to hear whether it helped.'}
              </p>
            ) : null}
          </SectionCard>

          <SectionCard icon="mail" title="Messages" id="replies" description={t.replies.length ? `${t.replies.length === 1 ? '1 message' : `${t.replies.length} messages`} on this request` : 'No messages yet'}>
            {t.replies.length ? (
              <ol className="mb-5 space-y-3" aria-label="Messages on this request">
                {t.replies.map((r) => (
                  <li key={r.id} className={`rounded-[var(--ejo-radius-md)] border px-3 py-2.5 ${r.internal ? 'border-[var(--ejo-warning)]/35 bg-[var(--ejo-warning)]/[0.07]' : r.kind === 'SYSTEM' ? 'border-dashed border-[var(--ejo-border)] bg-transparent' : r.fromCustomer ? 'mr-6 border-[var(--ejo-border)] bg-[var(--ejo-bg)]' : 'ml-6 border-[var(--ejo-primary)]/20 bg-[var(--ejo-primary)]/[0.06]'}`}>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--ejo-text-muted)]">
                      <span className="font-semibold text-[var(--ejo-text)]">{r.fromCustomer ? `${r.author} (customer)` : r.author}</span>
                      {r.internal ? <span className="rounded-full bg-[var(--ejo-warning)]/20 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ejo-warning-text)]">Internal note</span> : null}
                      {r.aiDrafted && r.kind === 'AGENT' ? <span className="text-[10px]">written with Enyo</span> : null}
                      <span>· {formatDateTime(r.createdAt)}</span>
                    </p>
                    <p className={`mt-1 whitespace-pre-wrap break-words ${r.kind === 'SYSTEM' ? 'text-xs text-[var(--ejo-text-muted)]' : 'text-sm text-[var(--ejo-text)]'}`}>{r.body}</p>
                    {r.attachments.length ? <p className="mt-1.5 text-xs text-[var(--ejo-text-muted)]"><Icon name="file" size={12} /> {r.attachments.map((a) => `${a.name} (${formatSize(a.size)})`).join(', ')} — open the original email in the team mailbox to download.</p> : null}
                    {r.kind === 'AGENT' && !r.internal && r.id === lastAgentReply?.id ? (
                      <form action={saveSupportAnswerAction} className="mt-1.5">
                        <input type="hidden" name="ticketId" value={t.id} />
                        <input type="hidden" name="replyId" value={r.id} />
                        <SubmitButton label="Save as an answer for Enyo" pendingLabel="Saving…" className="min-h-8 rounded-full px-2 text-xs font-medium text-[var(--ejo-primary)] hover:bg-[var(--ejo-primary)]/10" />
                      </form>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}
            {t.status === 'CLOSED' ? (
              <p className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] p-3 text-sm text-[var(--ejo-text-muted)]">This request is closed. If the customer writes again, a follow-up request opens. To reply now, set it back to Open.</p>
            ) : (
              <div className="space-y-6">
                <SupportReplyForm ticketId={t.id} emailTo={t.emailTo} phone={t.contactPhone} seenAt={t.seenAt} draft={t.draft?.body ?? null} viaEmail={t.channel === 'EMAIL'} />
                <details className="group rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-medium text-[var(--ejo-text)] [&::-webkit-details-marker]:hidden"><Icon name="lock" size={15} /> Add an internal note</summary>
                  <div className="mt-3"><SupportNoteForm ticketId={t.id} /></div>
                </details>
              </div>
            )}
          </SectionCard>

          {t.transcript.length || t.channel === 'CUSTOMER_PORTAL' || t.channel === 'WEBSITE' ? (
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
          ) : null}
        </div>

        <aside className="min-w-0 space-y-6">
          {t.sender ? <SupportSenderCard s={t.sender} /> : null}
          <SectionCard icon="user" title={t.colleagueRequest ? 'Colleague' : 'Contact'}>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-[var(--ejo-text-muted)]">Name</dt><dd className="font-medium text-[var(--ejo-text)]">{t.customerId ? <CustomerLink id={t.customerId} name={t.customerName ?? t.contactName} canView={t.canCrm} /> : t.contactName}</dd></div>
              {t.contactPhone ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">Phone</dt><dd><a className="font-medium text-[var(--ejo-primary)] underline" href={`tel:${t.contactPhone.replace(/[^\d+]/g, '')}`}>{t.contactPhone}</a></dd></div> : null}
              {t.emailTo ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">Email</dt><dd className="break-all font-medium text-[var(--ejo-text)]">{t.emailTo}</dd></div> : null}
              {!t.sender ? (
                <div>
                  <dt className="text-xs text-[var(--ejo-text-muted)]">Identity</dt>
                  <dd className={t.verified ? 'font-medium text-[var(--ejo-success)]' : 'text-[var(--ejo-warning-text)]'}>
                    {t.verified ? 'Verified — signed in, or their email server proved the address' : t.customerId ? 'Not verified — check before discussing their vehicle, jobs or money' : 'Not a known customer'}
                  </dd>
                </div>
              ) : null}
              <div><dt className="text-xs text-[var(--ejo-text-muted)]">Opened</dt><dd className="text-[var(--ejo-text)]">{formatDateTime(t.createdAt)}</dd></div>
              <div><dt className="text-xs text-[var(--ejo-text-muted)]">First response</dt><dd className={SLA_TEXT[t.sla]}>{t.firstResponse ? `${t.firstResponse} after opening${t.sla === 'breached' ? ' (late)' : ''}` : t.dueLabel ? `Not answered yet — ${t.dueLabel}` : 'Not answered yet'}</dd></div>
              {t.resolvedAt ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">Resolved</dt><dd className="text-[var(--ejo-text)]">{formatDateTime(t.resolvedAt)}</dd></div> : null}
              {t.reopenCount ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">Reopened</dt><dd className="text-[var(--ejo-text)]">{t.reopenCount} time{t.reopenCount === 1 ? '' : 's'}</dd></div> : null}
              {t.csat ? <div><dt className="text-xs text-[var(--ejo-text-muted)]">Their rating</dt><dd className="font-medium text-[var(--ejo-text)]">{t.csat.score} out of 5{t.csat.comment ? <span className="mt-0.5 block whitespace-pre-wrap font-normal text-[var(--ejo-text-muted)]">“{t.csat.comment}”</span> : null}</dd></div> : null}
            </dl>
          </SectionCard>

          {t.links.length || t.vehicles.length || t.jobs.length || t.entities.vins.length ? (
            <SectionCard icon="car" title="Vehicles and records" description="Found in the messages, or on the customer’s file — only what you may open.">
              <ul className="space-y-1.5 text-sm">
                {t.links.map((l) => <li key={`${l.kind}-${l.value}`}><Link href={l.href} prefetch={false} className="font-medium text-[var(--ejo-primary)] hover:underline">{l.label}</Link></li>)}
                {t.vehicles.map((v) => <li key={v.id} className="text-[var(--ejo-text)]">{v.label}{v.plate ? <span className="text-[var(--ejo-text-muted)]"> · {v.plate}</span> : null}</li>)}
                {t.jobs.map((j) => <li key={j.id}><Link href={j.href} prefetch={false} className="font-medium text-[var(--ejo-primary)] hover:underline">{j.number}</Link> <span className="text-xs text-[var(--ejo-text-muted)]">{j.status}</span></li>)}
                {t.entities.vins.map((v) => <li key={v} className="text-xs text-[var(--ejo-text-muted)]">VIN mentioned: {v}</li>)}
              </ul>
            </SectionCard>
          ) : null}

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

          <SectionCard icon="check-circle" title="Status and priority">
            <div className="space-y-4">
              <form action={setSupportTicketStatusAction} className="space-y-2">
                <input type="hidden" name="ticketId" value={t.id} />
                <label htmlFor="support-status" className="block text-xs font-medium text-[var(--ejo-text-muted)]">Set the status</label>
                <select id="support-status" name="status" defaultValue={t.status} className={select}>
                  {SUPPORT_STATUSES.map((s) => <option key={s} value={s}>{SUPPORT_STATUS_LABEL[s]}</option>)}
                </select>
                <SubmitButton label="Change status" pendingLabel="Saving…" className={`${btn} w-full`} />
              </form>
              <form action={setSupportPriorityAction} className="space-y-2">
                <input type="hidden" name="ticketId" value={t.id} />
                <label htmlFor="support-priority-set" className="block text-xs font-medium text-[var(--ejo-text-muted)]">Priority</label>
                <select id="support-priority-set" name="priority" defaultValue={t.priority} className={select}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </select>
                <SubmitButton label="Change priority" pendingLabel="Saving…" className={`${btn} w-full`} />
              </form>
              {t.queues.length > 1 ? (
                <form action={moveSupportTicketAction} className="space-y-2">
                  <input type="hidden" name="ticketId" value={t.id} />
                  <label htmlFor="support-queue" className="block text-xs font-medium text-[var(--ejo-text-muted)]">Team</label>
                  <select id="support-queue" name="queueId" defaultValue={t.queueId ?? ''} className={select}>
                    {t.queues.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <SubmitButton label="Move to this team" pendingLabel="Moving…" className={`${btn} w-full`} />
                </form>
              ) : null}
            </div>
          </SectionCard>
        </aside>
      </div>
    </div>
  );
}
