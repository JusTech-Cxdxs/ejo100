import { mailConsentFormAction } from '@/lib/actions/mail-form-handlers';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';

/** The consent question, asked in the same words everywhere. */
export const CONSENT_QUESTION = 'Allow Enyo to read, sort and summarise your email? It never sends anything without you.';

const EXPLAIN = [
  'Enyo reads new messages to write a one-line summary, sort them (customer, supplier, warranty, finance, internal) and mark what needs you today.',
  'It points out Job Cards, services, warranty claims, plates and customers it finds — only ones you can already open.',
  'It can prepare a reply or a reminder for you to check. It never sends, deletes or moves anything.',
  'Instructions written inside an email are ignored. Summaries stay in the portal with your mail and are deleted if you change your mind.',
];

export function ConsentChoice({ from, current }: { from: 'connect' | 'settings'; current: boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-base font-semibold text-[var(--ejo-text)]">{CONSENT_QUESTION}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--ejo-text-muted)]">{EXPLAIN.map((e) => <li key={e}>{e}</li>)}</ul>
      <div className="flex flex-wrap gap-3">
        {current ? (
          <form action={mailConsentFormAction}>
            <FormPendingOverlay />
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="choice" value="withdraw" />
            <SubmitButton label="Withdraw and delete summaries" pendingLabel="Saving…" className="min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/40 px-4 py-2.5 text-sm font-medium text-[var(--ejo-error)] hover:bg-[var(--ejo-error)]/10" />
          </form>
        ) : (
          <>
            <form action={mailConsentFormAction}>
              <FormPendingOverlay />
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="choice" value="allow" />
              <SubmitButton label="Yes, allow Enyo" pendingLabel="Saving…" className="min-h-11 rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110" />
            </form>
            <form action={mailConsentFormAction}>
              <FormPendingOverlay />
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="choice" value="decline" />
              <SubmitButton label="No, thank you" pendingLabel="Saving…" className="min-h-11 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-5 py-2.5 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/60" />
            </form>
          </>
        )}
      </div>
    </div>
  );
}
