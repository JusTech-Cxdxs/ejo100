import { Reveal } from './Reveal';

/**
 * Customer stories. Until the communications team approves real ones (from
 * the customer portal's feedback and the Support centre), the three below
 * are SAMPLE text and say so on the page — nothing is presented as a real
 * person's words. Replace `sample: false` and the quote when a story is approved.
 */
type Story = { quote: string; who: string; where: string; sample: boolean; initials: string };

const STORIES: Story[] = [
  { quote: 'Our ten NPRs run Lagos–Onitsha every week. Scheduled servicing at Isolo and parts on the shelf mean a truck is never off the road for long.', who: 'Fleet manager, logistics company', where: 'Lagos', sample: true, initials: 'FM' },
  { quote: 'The estimate came by text before any work started, and I followed the job in the customer portal until it was ready. No surprises at the counter.', who: 'SUV owner', where: 'Lekki', sample: true, initials: 'SO' },
  { quote: 'We moved our staff shuttle to two View C2 buses. The drivers like them, the passengers like the cold air, and the finance was arranged in a week.', who: 'Administration manager, manufacturing company', where: 'Ikeja', sample: true, initials: 'AM' },
];

export function TestimonialsSection() {
  const anySample = STORIES.some((s) => s.sample);
  return (
    <section className="bg-[var(--ejo-surface)]" aria-labelledby="stories-title">
      <div className="mx-auto max-w-[1480px] px-4 py-16 sm:px-6 sm:py-24 lg:px-10">
        <Reveal>
          <p className="mb-3 text-xs font-semibold tracking-[0.2em] text-[var(--ejo-primary)]">CUSTOMER STORIES</p>
          <h2 id="stories-title" className="text-3xl font-bold text-[var(--ejo-text)] md:text-4xl">What it is like to be looked after here</h2>
          {anySample ? <p className="mt-3 max-w-2xl text-sm text-[var(--ejo-text-muted)]">Sample stories, shown until the first customer stories are approved by the communications team; the words below are not a real customer’s.</p> : null}
        </Reveal>
        <Reveal className="mt-10 grid gap-5 md:grid-cols-3">
          {STORIES.map((s, i) => (
            <figure key={s.who} data-stagger style={{ '--i': i } as never} className="ejo-card relative flex flex-col rounded-[var(--ejo-radius-xl)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] p-6 sm:p-7">
              <svg aria-hidden className="absolute right-6 top-6 text-[var(--ejo-primary)]/20" width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M7.2 11H4.6c.2-2.6 1.6-4.3 4.1-5.1l-.6-1.6C4.5 5.3 2.5 8 2.5 12.2V19h7v-8H7.2zm10 0h-2.6c.2-2.6 1.6-4.3 4.1-5.1l-.6-1.6c-3.6 1-5.6 3.7-5.6 7.9V19h7v-8h-2.3z" /></svg>
              <blockquote className="pr-10 text-[1.0625rem] leading-relaxed text-[var(--ejo-text)]">“{s.quote}”</blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-[var(--ejo-border)] pt-4">
                <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ejo-primary)]/12 text-sm font-bold text-[var(--ejo-primary)]">{s.initials}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[var(--ejo-text)]">{s.who}</span>
                  <span className="block text-xs text-[var(--ejo-text-muted)]">{s.where}{s.sample ? ' · sample' : ''}</span>
                </span>
                <span aria-label="Five stars" className="ml-auto flex gap-0.5 text-[#f5b301]">
                  {Array.from({ length: 5 }, (_, k) => <svg key={k} width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" /></svg>)}
                </span>
              </figcaption>
            </figure>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
