import { listLearnedAnswers } from '@/lib/actions/enyo';
import { approveLearnedAnswerFormAction, removeLearnedAnswerFormAction } from '@/lib/actions/enyo-learned-form';
import { SectionCard } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { formatDateOnly } from '@/lib/utils/format-date';

/**
 * What Enyo has learned from people in this organisation: answers marked
 * helpful (and, with Support, replies colleagues wrote). Each waits for an
 * administrator's approval; only approved ones are used as examples or
 * reused for the same question. Remove one that is wrong or out of date.
 */
export async function LearnedAnswersCard() {
  const rows = await listLearnedAnswers();
  const waiting = rows.filter((r) => r.status === 'PENDING').length;
  return (
    <div id="learned" className="scroll-mt-24">
      <SectionCard icon="sparkles" title="What Enyo has learned" description="Answers people marked helpful, for general questions that read nobody's records, with names and contact details removed. Approve the good ones: Enyo then follows them as examples and answers the same general question again instantly, with no model cost. Remove anything wrong, out of date or personal.">
        {waiting ? <p className="mb-3 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-warning)]/10 p-3 text-sm text-[var(--ejo-warning-text)]" role="status">{waiting} waiting for your approval. Enyo does not use them until you approve.</p> : null}
        {rows.length ? (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {rows.map((r) => (
              <li key={r.id} className="py-3">
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[var(--ejo-text)]">{r.question}</span>
                      <span className="mt-0.5 block text-xs text-[var(--ejo-text-muted)]"><span className={`mr-1.5 inline-block rounded-full px-2 py-0.5 font-medium ${r.status === 'APPROVED' ? 'bg-[var(--ejo-success)]/10 text-[var(--ejo-success)]' : 'bg-[var(--ejo-warning)]/15 text-[var(--ejo-warning-text)]'}`}>{r.status === 'APPROVED' ? 'Approved' : 'Waiting'}</span>{r.source === 'rating' ? 'Marked helpful by a colleague' : r.source === 'support' ? 'From a colleague’s support reply' : r.source === 'chat' ? `From a ${r.channel === 'PUBLIC' ? 'website' : 'customer'} chat` : 'Learned'} · {formatDateOnly(r.createdAt)} · used {r.uses} time{r.uses === 1 ? '' : 's'}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-[var(--ejo-primary)] group-open:hidden">Show</span>
                  </summary>
                  <p className="mt-2 whitespace-pre-line rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] p-3 text-sm text-[var(--ejo-text)]">{r.answer}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.status !== 'APPROVED' ? (
                      <form action={approveLearnedAnswerFormAction}>
                        <FormPendingOverlay />
                        <input type="hidden" name="learnedId" value={r.id} />
                        <SubmitButton label="Approve" pendingLabel="Approving…" className="min-h-10 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-3 text-xs font-medium text-white hover:brightness-110" />
                      </form>
                    ) : null}
                    <form action={removeLearnedAnswerFormAction}>
                      <FormPendingOverlay />
                      <input type="hidden" name="learnedId" value={r.id} />
                      <SubmitButton label="Remove" pendingLabel="Removing…" className="min-h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 text-xs font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10" />
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--ejo-text-muted)]">Nothing yet. When someone presses the thumbs-up under a helpful answer to a how-to or general question, Enyo keeps it here for your approval.</p>
        )}
      </SectionCard>
    </div>
  );
}
