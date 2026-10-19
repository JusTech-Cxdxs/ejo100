import type { Metadata } from 'next';
import { Button, PageIntro, Prose, Section } from '@/components/site/Page';

export const metadata: Metadata = { title: 'Sustainability', description: 'How the group creates value that lasts in Nigeria: local manufacturing, farming that pays, jobs with training, and operations that waste less.' };

const COMMITMENTS = [
  { title: 'Make it here', text: 'Vehicles assembled in Lagos instead of shipped whole; grain processed in Kano instead of exported raw. Local manufacturing keeps value, skills and jobs in Nigeria — and cuts the shipping behind every product.', proof: 'Automobiles Manufacturing Hub, Isolo (2016); Afcott Grains, Kano (2026)' },
  { title: 'Farming that pays the farmer', text: 'The group buys cotton, sesame and grain from smallholders in the north, supplies them with seed and inputs through Springfield Agro, and processes close to the farm so more of the price reaches the grower.', proof: 'Afcott, Yola; Sunseed, Zaria; Afcott Grains, Kano — 500+ jobs, most from Kano' },
  { title: 'Jobs with a trade', text: 'Assembly, diagnostics, body and paint, milling: the group trains the people it hires, on the brands it sells, and promotes from the line.', proof: 'Technician training on each new brand; supervisors from the shop floor' },
  { title: 'Waste less', text: 'Service oils, batteries and tyres are collected for licensed recycling; parts are reserved to jobs so nothing is ordered twice; estimates are approved before work starts so nothing is done twice.', proof: 'Workshop and store practice on the operating platform' },
  { title: 'Safer roads', text: 'Vehicles delivered after pre-delivery inspection; tyres fitted and balanced by trained fitters; road tests signed off by a manager; drivers briefed on the vehicle they collect.', proof: 'PDI and road-test approvals, recorded for every vehicle' },
  { title: 'Honest records', text: 'Every approval, payment and claim is recorded and kept. Customers see their own history; auditors see the trail; nothing is edited after the fact.', proof: 'Append-only audit trail across the group’s operations' },
];

export default function SustainabilityPage() {
  return (
    <main>
      <PageIntro kicker="Sustainability" title="Value that lasts" lede="Sustainable growth is one of the group’s four founding commitments. In practice it means six things we do, and can show, rather than targets we announce." tone="dark" image="/images/business/agriculture.jpg" />
      <Section>
        <div className="grid gap-x-10 gap-y-12 md:grid-cols-2">
          {COMMITMENTS.map((c) => (
            <article key={c.title} className="border-t-2 border-[var(--ejo-primary)] pt-5">
              <h2 className="text-2xl font-bold tracking-[-0.01em]">{c.title}</h2>
              <p className="mt-3 leading-relaxed text-[var(--ejo-text-muted)]">{c.text}</p>
              <p className="mt-3 text-sm"><span className="font-semibold">In practice: </span><span className="text-[var(--ejo-text-muted)]">{c.proof}</span></p>
            </article>
          ))}
        </div>
      </Section>
      <Section tone="tint" title="What we do not claim" narrow>
        <Prose>
          <p>The group does not publish environmental certifications it does not hold, or figures it cannot audit. As programmes are measured — energy at the plant, oil and tyres recycled, farmers supplied — the numbers will appear here, with their dates.</p>
          <p>Community programmes run by the group’s companies are reported in News & media as they happen.</p>
        </Prose>
        <div className="mt-8"><Button href="/news">Community and milestones in the news</Button></div>
      </Section>
    </main>
  );
}
