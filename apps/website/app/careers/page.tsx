import type { Metadata } from 'next';
import { Button, PageIntro, Prose, Section } from '@/components/site/Page';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = { title: 'Careers', description: 'Work in vehicle assembly, workshops, sales, farming, milling, logistics, healthcare and the group office — in Lagos, Kano, Zaria and Yola.' };

const AREAS = [
  { title: 'Assembly and the workshop', roles: 'Assembly technicians, diagnostic technicians, body and paint, quality inspectors, workshop supervisors', where: 'Isolo, Lagos' },
  { title: 'Sales and customer care', roles: 'Showroom sales, fleet account managers, parts counter, customer care', where: 'Lagos' },
  { title: 'Agriculture and milling', roles: 'Agronomists, field officers, mill operators, quality control, ginnery staff', where: 'Kano, Zaria, Yola' },
  { title: 'Logistics and the store', roles: 'Store officers, drivers, warehouse and clearing', where: 'Lagos and the north' },
  { title: 'Healthcare', roles: 'Pharmacists, regulatory and cold-chain staff, hospital sales', where: 'Lagos' },
  { title: 'The group office', roles: 'Finance, audit, IT, HR, communications, security', where: 'Victoria Island, Lagos' },
];

export default function CareersPage() {
  return (
    <main>
      <PageIntro kicker="Careers" title="Build something that stays" lede={`${siteConfig.organisationName} employs more than 4,600 people across its businesses. In Nigeria that means people who assemble vehicles, fix them, sell them, grow and mill crops, move goods and run the companies — in Lagos, Kano, Zaria and Yola.`} tone="dark" image="/images/business/manufacturing.jpg">
        <div className="flex flex-wrap gap-3"><Button href="/contact?topic=careers" variant="light">Send your application</Button></div>
      </PageIntro>
      <Section title="Where people work" lead="Six kinds of work, in four cities. Openings are posted as they come; applications for any area are welcome at any time.">
        <div className="grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
          {AREAS.map((a) => <div key={a.title} className="border-t border-[var(--ejo-border)] pt-4"><h3 className="text-lg font-semibold">{a.title}</h3><p className="mt-1 text-[15px] leading-relaxed text-[var(--ejo-text-muted)]">{a.roles}</p><p className="mt-2 text-sm font-medium text-[var(--ejo-primary)]">{a.where}</p></div>)}
        </div>
      </Section>
      <Section tone="tint" title="What it is like" >
        <div className="grid gap-10 lg:grid-cols-2">
          <Prose>
            <p><strong>You learn a trade on the brands we sell.</strong> New technicians are trained on each brand as it joins the line — SOUEAST, Isuzu, Foton, Mitsubishi — and supervisors come from the shop floor.</p>
            <p><strong>Your work is recorded, and so is your credit.</strong> Every job, approval and sale is on the group’s operating platform under your name; good work is visible to the people who decide promotions.</p>
            <p><strong>Professionally led since 1993.</strong> Managers run their businesses with the authority of owners and the accountability of a board; there is room to rise.</p>
          </Prose>
          <Prose>
            <p><strong>Students and graduates.</strong> The group takes interns in sales, marketing and diagnostics, and industrial-training students from Nigerian universities in its workshops and plants. Say which business and which months in your message.</p>
            <p><strong>How to apply.</strong> Send a short message with your CV attached or linked, the area you want and the city, through the contact page under “Careers”. You will get a reference number; the human resources team replies from there.</p>
          </Prose>
        </div>
        <div className="mt-8"><Button href="/contact?topic=careers">Apply or ask about openings</Button></div>
      </Section>
    </main>
  );
}
