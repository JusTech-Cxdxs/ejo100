import { notFound } from 'next/navigation';
import { NOT_AVAILABLE } from '@/lib/authz/server';
import { getMyHelpRequest } from '@/lib/actions/help';
import { answerMyHelpRequestAction } from '@/lib/actions/help-form-handlers';
import { PageHeader, SectionCard, StatusChip, type Tone } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { HelpReplyForm } from '@/components/support/HelpForms';
import { LinkedText } from '@/components/support/LinkedText';
import { formatDateTime } from '@/lib/utils/format-date';

export const metadata = { title: 'My request for help' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, Tone> = { OPEN: 'info', WAITING_ON_CUSTOMER: 'warning', ON_HOLD: 'neutral', RESOLVED: 'success', CLOSED: 'neutral' };
const NOTICE: Record<string, { kind: 'success' | 'warning'; text: string }> = {
  sent: { kind: 'success', text: 'Sent. You will see answers here, in your notifications and by email.' },
  replied: { kind: 'success', text: 'Message sent to the support team.' },
  solved: { kind: 'success', text: 'Glad it is sorted. The request is marked resolved; write again here if you need to.' },
  person: { kind: 'success', text: 'A person on the support team will pick this up.' },
};

/** One of my own requests for help: the conversation, "did this solve it?", and my reply. */
export default async function MyHelpRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string; a?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const t = await getMyHelpRequest(id).catch((err: unknown) => {
    if (err instanceof Error && err.message === NOT_AVAILABLE) return null;
    throw err;
  });
  if (!t) notFound();
  const notice = sp.status ? NOTICE[sp.status] : null;
  // From the email's buttons (?a=solved / ?a=person): confirm with one press (a link never changes anything by itself).
  const suggested = sp.a === 'solved' || sp.a === 'person' ? sp.a : null;
  return (
    <div className="w-full max-w-3xl p-4 sm:p-8">
      <PageHeader icon="help" title={t.subject} back={{ href: '/support/help', label: 'Get help' }} eyebrow={t.number}
        meta={<><StatusChip tone={TONE[t.status] ?? 'neutral'} label={t.statusLabel} /><span className="text-xs text-[var(--ejo-text-muted)]">{t.to === 'platform' ? 'EJO platform team' : 'Our administrators'}</span></>} />
      {sp.error ? <FormFeedbackBanner kind="error" message={sp.error} /> : null}
      {notice ? <FormFeedbackBanner kind={notice.kind} message={notice.text} /> : null}

      {t.askHelped || suggested ? (
        <SectionCard icon="check-circle" title="Did this solve it?">
          <div className="flex flex-wrap gap-2">
            {(['solved', 'person'] as const).map((choice) => (
              <form key={choice} action={answerMyHelpRequestAction}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="choice" value={choice} />
                <SubmitButton label={choice === 'solved' ? 'Yes, this solved it' : 'I still need a person'} pendingLabel="Saving…"
                  className={choice === suggested || (!suggested && choice === 'solved') ? 'min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 text-sm font-semibold text-white' : 'min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 text-sm font-medium text-[var(--ejo-text)]'} />
              </form>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard icon="mail" title="Conversation">
        <ol className="space-y-3" aria-label="Messages">
          {t.messages.map((m) => (
            <li key={m.id} className={`rounded-[var(--ejo-radius-md)] border px-3 py-2.5 ${m.mine ? 'mr-6 border-[var(--ejo-border)] bg-[var(--ejo-bg)]' : 'ml-6 border-[var(--ejo-primary)]/20 bg-[var(--ejo-primary)]/[0.06]'}`}>
              <p className="text-xs text-[var(--ejo-text-muted)]"><span className="font-semibold text-[var(--ejo-text)]">{m.author}</span> · {formatDateTime(m.at)}</p>
              <div className="mt-1 text-sm text-[var(--ejo-text)]"><LinkedText text={m.body} /></div>
            </li>
          ))}
        </ol>
        <div className="mt-5"><HelpReplyForm id={t.id} /></div>
      </SectionCard>
    </div>
  );
}
