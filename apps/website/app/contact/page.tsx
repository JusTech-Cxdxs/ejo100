import type { Metadata } from 'next';
import { Facts, PageIntro, Section } from '@/components/site/Page';
import { ContactForm } from '@/components/site/ContactForm';
import { COMPANIES, GROUP_OFFICE, HEAD_OFFICE, PLANT } from '@/lib/content/group';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = { title: 'Contact', description: 'Head office in Victoria Island, the manufacturing hub in Isolo, and the phone numbers and email addresses of each company.' };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const c = siteConfig.contact;
  return (
    <main>
      <PageIntro kicker="Contact" title="Talk to the people who do the work" lede="Write once and the right team answers with a reference you can follow — or call the company directly." />
      <Section>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="relative">
            <h2 className="text-2xl font-bold tracking-[-0.01em]">Send a message</h2>
            <p className="mt-2 mb-6 text-[var(--ejo-text-muted)]">Sales, service, parts, partnerships, careers, press or a complaint.</p>
            <ContactForm topic={topic ?? ''} />
          </div>
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.01em]">Offices</h2>
              <Facts items={[
                { k: HEAD_OFFICE.name, v: <>{c.address || HEAD_OFFICE.address}<br /><span className="text-sm text-[var(--ejo-text-muted)]">{HEAD_OFFICE.box}</span></> },
                { k: PLANT.name, v: PLANT.address },
                { k: GROUP_OFFICE.name, v: GROUP_OFFICE.address },
                ...(c.phone ? [{ k: 'Switchboard', v: <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{c.phone}</a> }] : []),
                ...(c.email ? [{ k: 'Email', v: <a href={`mailto:${c.email}`} className="break-all font-medium text-[var(--ejo-primary)] hover:underline">{c.email}</a> }] : []),
              ]} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-[-0.01em]">Hours</h2>
              <Facts items={[{ k: 'Offices and showrooms', v: 'Monday to Friday 8:00–17:00' }, { k: 'Workshop', v: 'Monday to Friday 8:00–17:00, Saturday 9:00–13:00' }, { k: 'Online', v: 'The assistant at the bottom of the page answers day and night; the customer portal is always open.' }]} />
            </div>
          </div>
        </div>
      </Section>
      <Section tone="tint" title="Call the company directly" lead="Each business has its own line. Choose the one that does what you need.">
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {COMPANIES.map((co) => (
            <div key={co.name} className="border-t border-[var(--ejo-border)] pt-4">
              <h3 className="font-semibold">{co.name}</h3>
              <p className="mt-0.5 text-sm text-[var(--ejo-text-muted)]">{co.does}{co.where ? ` · ${co.where}` : ''}</p>
              {co.phone ? <a href={`tel:${co.phone.replace(/[^\d+]/g, '')}`} className="mt-2 block text-[15px] font-medium text-[var(--ejo-primary)] hover:underline">{co.phone}</a> : null}
              {co.email ? <a href={`mailto:${co.email}`} className="block break-all text-[15px] font-medium text-[var(--ejo-primary)] hover:underline">{co.email}</a> : null}
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
