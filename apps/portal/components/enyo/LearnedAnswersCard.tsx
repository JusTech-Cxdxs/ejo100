import { listLearnedAnswers } from '@/lib/actions/enyo';
import { removeLearnedAnswerFormAction } from '@/lib/actions/enyo-learned-form';
import { SectionCard } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { formatDateOnly } from '@/lib/utils/format-date';

/**
 * What Enyo has learned from people in this organisation: answers marked
 * helpful (and, with Support, replies colleagues wrote). Enyo uses them as
 * examples and answers near-identical questions straight from them. Remove
 * one that is wrong or out of date.
 */
export async function LearnedAnswersCard() {
  const rows = await listLearnedAnswers();
  return (
    <div id="learned" className="scroll-mt-24">
      <SectionCard icon="sparkles" title="What Enyo has learned" description="Answers people marked helpful, for questions that read nobody's records. Enyo follows them as examples and answers the same question again instantly, with no model cost. Remove anything wrong or out of date.">
        {rows.length ? (
          <ul className="divide-y divide-[var(--ejo-border)]">
            {rows.map((r) => (
              <li key={r.id} className="py-3">
                <details className="group">
                  <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[var(--ejo-text)]">{r.question}</span>
                      <span className="mt-0.5 block text-xs text-[var(--ejo-text-muted)]">{r.source === 'rating' ? 'Marked helpful' : 'From a colleague’s reply'} · {formatDateOnly(r.createdAt)} · used {r.uses} time{r.uses === 1 ? '' : 's'}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-[var(--ejo-primary)] group-open:hidden">Show</span>
                  </summary>
                  <p className="mt-2 whitespace-pre-line rounded-[var(--ejo-radius-md)] bg-[var(--ejo-bg)] p-3 text-sm text-[var(--ejo-text)]">{r.answer}</p>
                  <form action={removeLearnedAnswerFormAction} className="mt-2">
                    <FormPendingOverlay />
                    <input type="hidden" name="learnedId" value={r.id} />
                    <SubmitButton label="Remove" pendingLabel="Removing…" className="min-h-10 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 text-xs font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10" />
                  </form>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--ejo-text-muted)]">Nothing yet. When someone presses the thumbs-up under a helpful answer to a how-to or general question, Enyo keeps it here.</p>
        )}
      </SectionCard>
    </div>
  );
}
