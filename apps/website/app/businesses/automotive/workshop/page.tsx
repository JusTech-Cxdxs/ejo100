import type { Metadata } from 'next';
import { Button, Facts, PageIntro, Prose, Section } from '@/components/site/Page';
import { PLANT } from '@/lib/content/group';

export const metadata: Metadata = { title: 'Workshop', description: 'Maintenance, diagnostics, repairs, body and paint for cars, SUVs, pickups and trucks — every job followed online.' };

const STEPS = [
  ['Book', 'Call, write, or book in the customer portal. Tell us the vehicle and what you have noticed.'],
  ['Inspect and estimate', 'A technician inspects the vehicle; a supervisor checks the estimate before it reaches you — nothing is done without your approval.'],
  ['Repair', 'Genuine parts from our own store, fitted by technicians trained on the brands we sell. Parts and labour are itemised.'],
  ['Ready', 'You are told the moment it is ready. Pay in the portal or at the branch; the receipt and service history stay in your account.'],
];

export default function WorkshopPage() {
  return (
    <main>
      <PageIntro kicker="Automotive" title="The workshop" lede="Maintenance, diagnostics, mechanical and electrical repairs, body and paint — for passenger cars, SUVs, pickups and trucks. Every job has a number you can follow from your phone." tone="dark" image="/images/business/automotive.jpg">
        <div className="flex flex-wrap gap-3"><Button href="/customer-portal" variant="light">Book or follow a job</Button><Button href="/contact" variant="line" className="border-white/30 text-white hover:bg-white/10">Ask a question</Button></div>
      </PageIntro>
      <Section title="How a job runs" lead="Four steps, the same every time, so you always know where your vehicle is.">
        <ol className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, x], i) => (
            <li key={t} className="border-t-2 border-[var(--ejo-primary)] pt-4"><p className="text-sm font-semibold text-[var(--ejo-primary)]">Step {i + 1}</p><h3 className="mt-1 text-xl font-semibold">{t}</h3><p className="mt-2 leading-relaxed text-[var(--ejo-text-muted)]">{x}</p></li>
          ))}
        </ol>
      </Section>
      <Section tone="tint" title="What we service">
        <div className="grid gap-10 lg:grid-cols-2">
          <Prose>
            <p>Passenger cars and SUVs, pickups, minibuses and light and medium trucks — the brands we sell first, and most others besides. Periodic maintenance, diagnostics, engine and transmission work, brakes, suspension and steering, air-conditioning, electrical faults, tyres and wheel alignment, body repair and paint.</p>
            <p>Warranty work on vehicles we sold is handled in the same workshop, with the claim raised and tracked for you.</p>
          </Prose>
          <Facts items={[{ k: 'Where', v: PLANT.address }, { k: 'Hours', v: 'Monday to Friday 8:00–17:00, Saturday 9:00–13:00' }, { k: 'Follow a job', v: 'Customer portal — estimates, approvals, payments, service history' }]} />
        </div>
      </Section>
    </main>
  );
}
