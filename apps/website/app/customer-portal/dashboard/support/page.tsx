import { requireCustomer } from '@/lib/customer-portal/session';
import { loadContact } from '@/lib/customer-portal/data';
import { Card, PageHero, SectionTitle } from '@/components/customer/ui';
import { Icon, type IconName } from '@/components/customer/Icon';
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

const AI_FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'chat', title: 'Ask anything, any time', text: '“When will my car be ready?” — instant answers from your own records, day or night.' },
  { icon: 'receipt', title: 'Explain my estimate', text: 'Every line in plain words, and why it’s needed.' },
  { icon: 'calendar', title: 'Book and reschedule', text: 'Pick a time for your next service in a few taps.' },
  { icon: 'phone', title: 'A person when you need one', text: 'Hand over to our team, with the whole conversation attached.' },
];

/** Who to call, answers to common questions, and what's coming next. */
export default async function SupportPage() {
  const me = await requireCustomer();
  const c = await loadContact(me.id, me.organisationId);
  const lines = c ? [...new Set([...(c.hotlines ?? []), ...(c.orgHotlines ?? [])])] : [];
  const emails = c ? [...new Set([c.email, c.orgEmail].filter((x): x is string => Boolean(x)))] : [];
  return (
    <div className="space-y-6">
      <PageHero eyebrow="Help & support" icon="help" title="We’re here to help" subtitle="Talk to your branch about anything — your vehicle, an estimate, a payment or a warranty. Most answers are also below." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {/* AI support centre — coming soon (roadmap style) */}
          <section className="ejo-roadmap-hero ejo-rise relative overflow-hidden rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] p-6 sm:p-8" aria-labelledby="ai-title" data-testid="ai-support-coming-soon">
            <div className="ejo-orb pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-[var(--ejo-primary)]/20 blur-3xl" aria-hidden="true" />
            <div className="ejo-orb-slow pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-[var(--ejo-accent)]/10 blur-3xl" aria-hidden="true" />
            <div className="relative flex flex-wrap items-start gap-6">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
                <span className="ejo-spin absolute inset-0 rounded-full border-2 border-dashed border-[var(--ejo-primary)]/40" aria-hidden="true" />
                <span className="ejo-glow absolute inset-2 rounded-full bg-[var(--ejo-primary)]/30 blur-md" aria-hidden="true" />
                <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ejo-surface)] text-[var(--ejo-primary)] shadow-sm"><Icon name="sparkles" size={28} /></span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ejo-warning)]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--ejo-warning)]" />Coming soon</p>
                <h2 id="ai-title" className="mt-2 text-2xl font-bold text-[var(--ejo-text)]">AI support centre</h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--ejo-text-muted)]">A friendly assistant that knows your vehicles and visits — ready to help in seconds, with our team one tap away.</p>
              </div>
            </div>
            <ul className="relative mt-6 grid gap-3 sm:grid-cols-2">
              {AI_FEATURES.map((f, i) => (
                <li key={f.title} className="ejo-rise flex gap-3 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)]/80 p-3.5" style={{ animationDelay: `${120 + i * 60}ms` }}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ejo-primary)]/10 text-[var(--ejo-primary)]"><Icon name={f.icon} size={17} /></span>
                  <span><span className="block text-sm font-semibold text-[var(--ejo-text)]">{f.title}</span><span className="mt-0.5 block text-xs text-[var(--ejo-text-muted)]">{f.text}</span></span>
                </li>
              ))}
            </ul>
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
