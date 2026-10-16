import Link from 'next/link';
import { guardPage } from '@/lib/authz/server';
import { getEnyoMonitor } from '@/lib/actions/support-monitor';
import { reviewEnyoReplyAction } from '@/lib/actions/support-form-handlers';
import { PageHeader, SectionCard, EmptyState, StatTile } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { ENYO_REPLY_FILTERS, FAILURE_LABEL, FAILURE_REASONS, type EnyoReplyFilter } from '@/lib/support/monitor-core';
import { SENDER_KIND_LABEL, type SenderKind } from '@/lib/support/context-core';
import { formatDateTime } from '@/lib/utils/format-date';

export const metadata = { title: 'Enyo’s replies' };
export const dynamic = 'force-dynamic';

const TAB_LABEL: Record<EnyoReplyFilter, string> = { to_check: 'To check', sent: 'Sent by Enyo', drafts: 'Drafts', checked: 'Checked', wrong: 'Wrong or escalated' };
const EMPTY: Record<EnyoReplyFilter, string> = {
  to_check: 'Every answer Enyo sent by itself has been checked.',
  sent: 'Enyo has not answered anything by itself in this period.',
  drafts: 'Enyo has not drafted any replies in this period.',
  checked: 'Nothing has been checked yet in this period.',
  wrong: 'No wrong answers and no customers asking for a person after Enyo answered. ',
};
const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-base text-[var(--ejo-text)] sm:text-sm';
const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

/**
 * Enyo's replies: everything Enyo sent or drafted, with the question, what it
 * knew about the sender and why it handed over — for the support team to
 * check, correct (a correction becomes an answer to approve) and see what to
 * fix so Enyo resolves more by itself.
 */
export default async function EnyoRepliesPage({ searchParams }: { searchParams: Promise<{ filter?: string; days?: string; status?: string; error?: string }> }) {
  await guardPage('support.tickets.manage', '/crm/support/enyo');
  const sp = await searchParams;
  const m = await getEnyoMonitor({ filter: sp.filter, days: Number(sp.days) || 30 });
  const href = (o: { filter?: string; days?: number }) => `/crm/support/enyo?filter=${o.filter ?? m.filter}&days=${o.days ?? m.days}`;

  return (
    <div className="w-full max-w-7xl p-4 sm:p-8">
      <PageHeader icon="sparkles" title="Enyo’s replies" back={{ href: '/crm/support', label: 'Support centre' }} eyebrow="Support centre"
        description="Check what Enyo sent and drafted, correct it, and see why it could not resolve requests — every correction can become an answer Enyo learns once an administrator approves it." />
      {sp.error ? <FormFeedbackBanner kind="error" message={sp.error} /> : null}
      {sp.status === 'reviewed' ? <FormFeedbackBanner kind="success" message="Saved. Thank you — this is how Enyo gets better." /> : null}
      {sp.status === 'reviewed_learned' ? <FormFeedbackBanner kind="success" message="Saved, and your corrected answer is waiting for approval on the Enyo learning page." /> : null}

      <nav aria-label="Period" className="mb-4 flex flex-wrap gap-2 text-sm">
        {[7, 30, 90].map((d) => <Link key={d} href={href({ days: d })} aria-current={m.days === d ? 'page' : undefined} className={`min-h-10 rounded-full px-3 py-2 ${m.days === d ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)]'}`}>Last {d} days</Link>)}
      </nav>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile icon="sparkles" label="Answered by Enyo" value={m.measures.answered} />
        <StatTile icon="check-circle" label="Checked by a person" value={pct(m.measures.reviewedShare)} />
        <StatTile icon="check-circle" label="Right when checked" value={pct(m.measures.accuracy)} />
        <StatTile icon="mail" label="Drafts used" value={pct(m.measures.draftAcceptance)} />
        <StatTile icon="user" label="Customer said it solved it" value={pct(m.measures.confirmedByCustomer)} />
        <StatTile icon="user-plus" label="Still needed a person" value={pct(m.measures.escalatedAfterAnswer)} tone={(m.measures.escalatedAfterAnswer ?? 0) > 20 ? 'warning' : 'brand'} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <nav aria-label="Which replies" className="mb-4 flex flex-wrap gap-2">
            {ENYO_REPLY_FILTERS.map((f) => (
              <Link key={f} href={href({ filter: f })} aria-current={m.filter === f ? 'page' : undefined}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm ${m.filter === f ? 'bg-[var(--ejo-primary)] text-white' : 'border border-[var(--ejo-border)] text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/50'}`}>
                {TAB_LABEL[f]} <span className={m.filter === f ? 'text-white/80' : 'text-[var(--ejo-text-muted)]'}>{m.counts[f]}</span>
              </Link>
            ))}
          </nav>
          {m.rows.length ? (
            <ol className="space-y-4">
              {m.rows.map((r) => (
                <li key={r.id} id={`r-${r.id}`} className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--ejo-text-muted)]">
                    <Link href={`/crm/support/${r.ticket.id}`} className="font-semibold text-[var(--ejo-primary)] hover:underline">{r.ticket.number}</Link>
                    <span>{r.kind === 'AI' ? 'Sent by Enyo' : 'Draft'}</span>
                    {r.ticket.topic ? <span>· {r.ticket.topic}</span> : null}
                    {r.confidence !== null ? <span>· {Math.round(r.confidence * 100)}% sure</span> : null}
                    {r.sender.kind ? <span>· {SENDER_KIND_LABEL[r.sender.kind as SenderKind] ?? r.sender.kind}{r.sender.proven === false ? ' (not proven)' : r.sender.proven ? ' (proven)' : ''}</span> : null}
                    <span>· {formatDateTime(r.createdAt)}</span>
                    {r.ticket.outcome === 'ESCALATED' ? <span className="rounded-full bg-[var(--ejo-warning)]/15 px-2 font-medium text-[var(--ejo-warning-text)]">Still needed a person</span> : null}
                    {r.ticket.outcome === 'CONFIRMED' ? <span className="rounded-full bg-[var(--ejo-success)]/12 px-2 font-medium text-[var(--ejo-success)]">Customer said it solved it</span> : null}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--ejo-text)]">{r.ticket.subject} <span className="font-normal text-[var(--ejo-text-muted)]">— {r.ticket.contactName}</span></p>
                  {r.question ? (
                    <details className="mt-2">
                      <summary className="flex min-h-9 cursor-pointer items-center text-xs font-medium text-[var(--ejo-primary)]">Their message</summary>
                      <p className="mt-1 whitespace-pre-wrap break-words rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] p-3 text-sm text-[var(--ejo-text)]">{r.question}</p>
                    </details>
                  ) : null}
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-[var(--ejo-radius-md)] border border-[var(--ejo-primary)]/20 bg-[var(--ejo-primary)]/[0.05] p-3 text-sm text-[var(--ejo-text)]">{r.body}</p>
                  {r.sender.records.length ? <p className="mt-1.5 text-xs text-[var(--ejo-text-muted)]">Records Enyo was given: {r.sender.records.join(', ')}</p> : null}
                  {r.ticket.handover.length ? <p className="mt-1.5 flex flex-wrap gap-1">{r.ticket.handover.map((h) => <span key={h} className="rounded-full bg-[var(--ejo-warning)]/12 px-2 py-0.5 text-[11px] text-[var(--ejo-warning-text)]">{h}</span>)}</p> : null}
                  {r.review.status ? (
                    <p className="mt-2 text-xs text-[var(--ejo-text)]"><span className="font-semibold">{r.review.label}</span>{r.review.reasonLabel ? ` — ${r.review.reasonLabel}` : ''}{r.review.note ? `: “${r.review.note}”` : ''}{r.review.by ? <span className="text-[var(--ejo-text-muted)]"> · {r.review.by}{r.review.at ? `, ${formatDateTime(r.review.at)}` : ''}</span> : null}</p>
                  ) : null}
                  <details className="mt-3" open={m.filter === 'to_check' && !r.review.status}>
                    <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium text-[var(--ejo-primary)]">{r.review.status ? 'Check again' : 'Check this reply'}</summary>
                    <form action={reviewEnyoReplyAction} className="mt-2 space-y-3">
                      <input type="hidden" name="replyId" value={r.id} />
                      <input type="hidden" name="filter" value={m.filter} />
                      <input type="hidden" name="days" value={m.days} />
                      <fieldset className="flex flex-wrap gap-2">
                        <legend className="sr-only">Verdict</legend>
                        {([['GOOD', 'Good'], ['FIXED', 'Needed a correction'], ['WRONG', 'Wrong']] as const).map(([v, label]) => (
                          <label key={v} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-[var(--ejo-border)] px-3 text-sm has-[:checked]:border-[var(--ejo-primary)] has-[:checked]:bg-[var(--ejo-primary)]/10">
                            <input type="radio" name="verdict" value={v} required className="h-4 w-4 accent-[var(--ejo-primary)]" defaultChecked={r.review.status === v} />{label}
                          </label>
                        ))}
                      </fieldset>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor={`reason-${r.id}`} className="block text-xs font-medium text-[var(--ejo-text-muted)]">Why (when not good)</label>
                          <select id={`reason-${r.id}`} name="reason" defaultValue={r.review.reason ?? ''} className={field}>
                            <option value="">—</option>
                            {FAILURE_REASONS.map((x) => <option key={x} value={x}>{FAILURE_LABEL[x]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label htmlFor={`note-${r.id}`} className="block text-xs font-medium text-[var(--ejo-text-muted)]">Note (optional)</label>
                          <input id={`note-${r.id}`} name="note" maxLength={500} defaultValue={r.review.note ?? ''} className={field} />
                        </div>
                      </div>
                      <div>
                        <label htmlFor={`fix-${r.id}`} className="block text-xs font-medium text-[var(--ejo-text-muted)]">The right answer (when you choose “Needed a correction”) — it goes to the Enyo learning page for approval</label>
                        <textarea id={`fix-${r.id}`} name="corrected" rows={4} maxLength={8000} className={field} placeholder="Write the answer as it should have been, without the customer’s name or personal details." />
                      </div>
                      <SubmitButton label="Save my check" pendingLabel="Saving…" className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 text-sm font-semibold text-white" />
                    </form>
                  </details>
                </li>
              ))}
            </ol>
          ) : <EmptyState icon="sparkles" title="Nothing here">{EMPTY[m.filter]}</EmptyState>}
        </div>

        <aside className="min-w-0 space-y-6">
          <SectionCard icon="chart" title="Why Enyo could not resolve them" description={`Hand-overs and corrections in the last ${m.days} days, with what to fix.`}>
            {m.gaps.length ? (
              <ol className="space-y-3">
                {m.gaps.map((g) => (
                  <li key={g.key} className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
                    <p className="flex items-start justify-between gap-2 text-sm"><span className="font-medium text-[var(--ejo-text)]">{g.topic}: {g.reasonLabel}</span><span className="shrink-0 rounded-full bg-[var(--ejo-bg)] px-2 text-xs font-semibold text-[var(--ejo-text)]">{g.count}</span></p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--ejo-text-muted)]">{g.fix} <Link href={g.href} className="font-medium text-[var(--ejo-primary)] hover:underline">Go</Link></p>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-[var(--ejo-text-muted)]">No gaps found in this period.</p>}
          </SectionCard>
          {m.rightlyHuman.length ? (
            <SectionCard icon="user" title="Rightly handed to a person" description="Money, safety, complaints and people asking for a person always go to the team.">
              <ul className="space-y-1.5 text-sm">
                {m.rightlyHuman.map((h) => <li key={h.reason} className="flex justify-between gap-2"><span className="text-[var(--ejo-text)]">{h.label}</span><span className="text-[var(--ejo-text-muted)]">{h.count}</span></li>)}
              </ul>
            </SectionCard>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
