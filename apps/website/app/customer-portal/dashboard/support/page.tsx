import { requireCustomer } from '@/lib/customer-portal/session';
import { loadContact, loadSupportTickets } from '@/lib/customer-portal/data';
import { supportStatus } from '@/lib/customer-portal/status';
import { fmtDateTime } from '@/lib/customer-portal/format';
import { Badge, Card, EmptyState, KeepCodes, PageHero, SectionTitle } from '@/components/customer/ui';
import { Icon } from '@/components/customer/Icon';
import { SupportReplyForm } from '@/components/customer/SupportReplyForm';
import { NewSupportRequestForm } from '@/components/customer/NewSupportRequestForm';
import { MINIMUM_DEPOSIT_FRACTION } from '@/lib/workshop-payment-constants';
import { APPROVAL_DEADLINE_WORKING_DAYS, READY_FOR_COLLECTION_GRACE_WORKING_DAYS } from '@/lib/customer-portal/format';

export const metadata = { title: 'Help & support' };

const FAQS: { q: string; a: string }[] = [
  { q: 'How do I approve my estimate?', a: `When your estimate is ready we’ll email you and it appears under My services. Paying the minimum deposit (${Math.round(MINIMUM_DEPOSIT_FRACTION * 100)}% of the total) approves the work. Please approve within ${APPROVAL_DEADLINE_WORKING_DAYS} working days so we can keep your slot.` },
  { q: 'How do I pay?', a: 'By bank transfer to the account shown on your estimate (use your Job Card or service number as the reference), or in person at our office. Payments show here as soon as our cashier records them.' },
  { q: 'What does “Waiting for parts” mean?', a: 'We’re waiting for a part to arrive. Nothing is needed from you — work carries on the moment it’s here, and you’ll see the status change.' },
  { q: 'When should I collect my vehicle?', a: `As soon as it’s ready. Please collect within ${READY_FOR_COLLECTION_GRACE_WORKING_DAYS} working days of the ready-for-collection notice — after that, storage charges may apply. Any balance must be settled before collection.` },
  { q: 'Someone else is collecting my vehicle — is that OK?', a: 'Yes. Let your branch know their name in advance; they’ll need to show ID at the gate.' },
  { q: 'How do warranties work?', a: 'Parts and work that come with a warranty are listed under Warranties with their dates and what they cover. If something covered goes wrong, contact your branch — we handle the claim with the provider for you.' },
  { q: 'I didn’t get an email from you.', a: 'Check your spam or junk folder, and make sure “Email me updates too” is on in Profile & settings. Everything we send also appears here under Notifications.' },
  { q: 'How do I change my name or email?', a: 'Please contact your branch — we confirm these in person to keep your account safe. You can change your phone numbers and addresses yourself in Profile & settings.' },
];


/** Who to call, the customer's support requests (with replies), and answers to common questions. */
export default async function SupportPage() {
  const me = await requireCustomer();
  const [c, tickets] = await Promise.all([loadContact(me.id, me.organisationId), loadSupportTickets(me.id, me.organisationId, me.email)]);
  const lines = c ? [...new Set([...(c.hotlines ?? []), ...(c.orgHotlines ?? [])])] : [];
  const emails = c ? [...new Set([c.email, c.orgEmail].filter((x): x is string => Boolean(x)))] : [];
  return (
    <div className="space-y-6">
      <PageHero eyebrow="Help & support" icon="help" title="We’re here to help" subtitle="Ask the assistant any time, follow your support requests, or talk to your branch about anything — your vehicle, an estimate, a payment or a warranty." />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="new-request-title" className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4 sm:p-5">
            <details open={!tickets.length}>
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span id="new-request-title" className="flex items-center gap-2 text-base font-semibold text-[var(--ejo-text)]"><span className="text-[var(--ejo-primary)]"><Icon name="chat" size={18} /></span>Ask a question or make a complaint</span>
                <span className="text-sm font-medium text-[var(--ejo-primary)]">Write to us</span>
              </summary>
              <p className="mb-4 mt-1 text-sm text-[var(--ejo-text-muted)]">It goes straight to our team with a reference number. You can follow it below and you will get an email when they reply.</p>
              <NewSupportRequestForm />
            </details>
          </section>

          {/* The customer's own support requests (hand-overs from the assistant, requests written here) and the team's replies. */}
          <section aria-labelledby="tickets-title" data-testid="support-tickets">
            <SectionTitle id="tickets-title" icon="chat" title="Your support requests" />
            {tickets.length ? (
              <ul className="space-y-3">
                {tickets.map((t, i) => {
                  const info = supportStatus(t.status);
                  return (
                    <li key={t.id} className="ejo-rise rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4" style={{ animationDelay: `${i * 40}ms` }} data-testid={`support-ticket-${t.number}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--ejo-text)]"><KeepCodes text={t.number} /></p>
                          <p className="mt-0.5 break-words text-sm text-[var(--ejo-text-muted)]">{t.subject}</p>
                          {t.status !== 'CLOSED' && t.status !== 'RESOLVED' ? <p className="mt-1 text-xs text-[var(--ejo-text-muted)]">{t.withTeam ? 'A member of our customer care team is handling it.' : 'Received — it is being passed to the right team.'}</p> : null}
                        </div>
                        <Badge tone={info.tone}>{info.label}</Badge>
                      </div>
                      <ol className="mt-3 space-y-2" aria-label={`Messages on ${t.number}`}>
                        {t.replies.length === 0 ? (
                          <li className="text-sm text-[var(--ejo-text-muted)]">Opened {fmtDateTime(t.createdAt)}. {info.explain}</li>
                        ) : t.replies.map((r) => (
                          <li key={r.id} className={`rounded-[var(--ejo-radius-md)] px-3 py-2 text-sm ${r.fromCustomer ? 'ml-6 bg-[var(--ejo-primary)]/[0.07]' : 'mr-6 border border-[var(--ejo-border)] bg-[var(--ejo-bg)]'}`}>
                            <p className="text-xs font-medium text-[var(--ejo-text-muted)]">{r.fromCustomer ? 'You' : r.kind === 'AI' ? 'AI assistant' : 'Customer care'} · {fmtDateTime(r.createdAt)}</p>
                            <p className="mt-1 whitespace-pre-wrap break-words text-[var(--ejo-text)] [overflow-wrap:anywhere]">{r.body}</p>
                          </li>
                        ))}
                      </ol>
                      {t.status !== 'CLOSED' ? <SupportReplyForm ticketId={t.id} number={t.number} /> : <p className="mt-3 text-xs text-[var(--ejo-text-muted)]">{info.explain} Ask the assistant or call your branch if you need anything else.</p>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon="chat" title="No support requests yet" text="Ask the assistant (the chat button at the bottom of the screen). If it can’t help, it passes your question to our team, and their replies appear here and by email." />
            )}
          </section>

          <section aria-labelledby="faq-title">
            <SectionTitle id="faq-title" icon="help" title="Common questions" />
            <div className="space-y-2">
              {FAQS.map((f, i) => (
                <details key={f.q} className="ejo-rise group rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] open:bg-[var(--ejo-bg)]" style={{ animationDelay: `${i * 30}ms` }}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-[var(--ejo-text)] [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="shrink-0 text-[var(--ejo-text-muted)] transition-transform group-open:rotate-180"><Icon name="chevronDown" size={16} /></span>
                  </summary>
                  <p className="px-4 pb-4 text-sm leading-relaxed text-[var(--ejo-text-muted)]">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <Card className="p-5">
            <SectionTitle icon="building" title="Contact us" />
            {c ? (
              <>
                <p className="text-sm font-semibold text-[var(--ejo-text)]">{c.name}</p>
                {c.address || c.orgAddress ? <p className="mt-1 flex gap-2 text-sm text-[var(--ejo-text-muted)]"><span className="mt-0.5 shrink-0"><Icon name="pin" size={14} /></span>{c.address ?? c.orgAddress}</p> : null}
                <ul className="mt-4 space-y-2">
                  {lines.map((h) => (
                    <li key={h}><a href={`tel:${h.replace(/[^\d+]/g, '')}`} className="flex items-center gap-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/40"><span className="text-[var(--ejo-primary)]"><Icon name="phone" size={16} /></span>{h}</a></li>
                  ))}
                  {emails.map((e) => (
                    <li key={e}><a href={`mailto:${e}`} className="flex items-center gap-3 break-all rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm font-medium text-[var(--ejo-text)] hover:border-[var(--ejo-primary)]/40"><span className="shrink-0 text-[var(--ejo-primary)]"><Icon name="mail" size={16} /></span>{e}</a></li>
                  ))}
                </ul>
                {!lines.length && !emails.length ? <p className="mt-3 text-sm text-[var(--ejo-text-muted)]">Visit or call the branch that serviced your vehicle — their details are on your Job Card.</p> : null}
              </>
            ) : (
              <p className="text-sm text-[var(--ejo-text-muted)]">Visit or call the branch that serviced your vehicle — their details are on your Job Card.</p>
            )}
          </Card>
          <Card className="p-5" delay={140}>
            <SectionTitle icon="lock" title="Staying safe" />
            <ul className="space-y-2 text-sm text-[var(--ejo-text-muted)]">
              <li className="flex gap-2"><span className="mt-0.5 text-[var(--ejo-primary)]"><Icon name="check" size={14} strokeWidth={2.4} /></span>We will never ask for your password.</li>
              <li className="flex gap-2"><span className="mt-0.5 text-[var(--ejo-primary)]"><Icon name="check" size={14} strokeWidth={2.4} /></span>Only pay into the account shown in this portal or on our estimate.</li>
              <li className="flex gap-2"><span className="mt-0.5 text-[var(--ejo-primary)]"><Icon name="check" size={14} strokeWidth={2.4} /></span>Unsure about a message? Call your branch first.</li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
