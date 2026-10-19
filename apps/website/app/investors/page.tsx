import type { Metadata } from 'next';
import { Button, Facts, Figure, PageIntro, Prose, Section } from '@/components/site/Page';
import { PILLARS } from '@/lib/content/group';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = { title: 'Investors and partners', description: 'A privately held, professionally managed group since 1860: how it is run, what it has built, and how to work with it.' };

export default function InvestorsPage() {
  return (
    <main>
      <PageIntro kicker="Investors and partners" title="Privately held. Professionally run. Built to last." lede={`${siteConfig.organisationName} is not listed, and does not need to be: it has financed its growth for a hundred and sixty years from the businesses it builds. This page is for the partners, lenders, principals and suppliers who work with it.`}>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Figure value="1860" label="Founded" />
          <Figure value="1993" label="Professional management since" />
          <Figure value="3" label="Companies taken to a stock exchange" note="Olam, Redington, Afprint" />
          <Figure value="12" label="Countries" />
        </div>
      </PageIntro>
      <Section title="How the group is run" lead="The founding family owns the group; its businesses are run by professional managers, each with a board, a budget and a mandate.">
        <div className="grid gap-10 lg:grid-cols-2">
          <Prose>
            <p>Since 1993 the group has separated ownership from management. Each business is a company with its own managing director, its own accounts and its own targets. Group functions — finance, audit, treasury, information technology — set standards and check them.</p>
            <p>Capital is allocated to businesses that earn it: the group has started companies, grown them, brought in partners, and listed or sold them when that served the business best. Olam, started in Nigeria in 1989, listed in Singapore in 2005; Redington listed in India in 2007; Afprint listed in Lagos.</p>
          </Prose>
          <div>
            {PILLARS.map((p) => <div key={p.title} className="border-b border-[var(--ejo-border)] py-4 first:pt-0"><h3 className="font-semibold">{p.title}</h3><p className="mt-1 text-[15px] leading-relaxed text-[var(--ejo-text-muted)]">{p.text}</p></div>)}
          </div>
        </div>
      </Section>
      <Section tone="tint" title="Working with us" lead="Three ways partners join the group’s work in Nigeria.">
        <div className="grid gap-8 md:grid-cols-3">
          {[
            ['Principals', 'Vehicle, tyre, machinery and pharmaceutical manufacturers who want a distributor with its own showrooms, workshops, assembly line and balance sheet. SOUEAST, Isuzu, Foton, Mitsubishi (with CFAO), Bridgestone and Firestone are among them.'],
            ['Joint ventures', 'Massilia Motors, with CFAO, brought Mitsubishi to Nigeria in 2017. The group brings local operations, assembly and after-sales; the partner brings the product and the network.'],
            ['Suppliers and lenders', 'Banks, insurers, component suppliers and farmers who supply the group’s mills. We pay on time and keep records that can be audited.'],
          ].map(([t, x]) => <div key={t} className="border-t-2 border-[var(--ejo-primary)] pt-4"><h3 className="text-xl font-semibold">{t}</h3><p className="mt-2 leading-relaxed text-[var(--ejo-text-muted)]">{x}</p></div>)}
        </div>
      </Section>
      <Section title="Governance and records">
        <div className="grid gap-10 lg:grid-cols-2">
          <Facts items={[
            { k: 'Ownership', v: 'Privately held by the founding family' },
            { k: 'Management', v: 'Professional, since 1993; each company with its own board' },
            { k: 'Group office', v: 'Kewalram Singapore Ltd, 65 Chulia Street, Singapore' },
            { k: 'Nigeria', v: 'Chanrai Nigeria Ltd and Kewalram Nigeria Ltd, 8A Karimu Kotun Street, Victoria Island, Lagos' },
            { k: 'Recognition', v: 'EY–Barclays Family Business Award of Excellence, 2013 (inaugural)' },
          ]} />
          <Prose>
            <p>The group’s operations in Nigeria run on one operating platform: every job, estimate, approval, payment, part and pass is recorded, approved by the right person and kept in an audit trail. Partners who need operational reporting — sales by model, service volumes, parts movements, warranty claims — get it from the same records.</p>
            <p>For partnership, supply or financing enquiries, write to the group through the contact page and choose “Business or partnership”; the message reaches the group office in Lagos.</p>
          </Prose>
        </div>
        <div className="mt-8"><Button href="/contact?topic=business">Business and partnership enquiries</Button></div>
      </Section>
    </main>
  );
}
