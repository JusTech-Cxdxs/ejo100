import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, Facts, Figure, PageIntro, Prose, Section } from '@/components/site/Page';
import { Ribbon } from '@/components/site/Ribbon';
import { siteConfig } from '@/lib/site-config';
import { BUSINESSES, COUNTRIES, FIGURES, GROUP_OFFICE, HEAD_OFFICE, PILLARS, PLANT } from '@/lib/content/group';

export const metadata: Metadata = {
  title: 'About',
  description: 'A family-owned, professionally led group trading since 1860 and in Nigeria since 1900: vehicles, agriculture, manufacturing, food, logistics and healthcare.',
};

export default function AboutPage() {
  const name = siteConfig.organisationName;
  return (
    <main>
      <PageIntro
        kicker="About the group"
        title={<>Trading since 1860. <br className="hidden sm:block" />In Nigeria since 1900.</>}
        lede={`${name} is a family-owned, professionally led group. It began as a textile trading house in Sindh and has grown into vehicles, agriculture, manufacturing, food, logistics and healthcare — building businesses that last, in markets that matter.`}
        image="/images/about/about-img.jpg"
        imageAlt=""
      >
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {FIGURES.map((f) => <Figure key={f.label} value={f.value} label={f.label} note={f.note} />)}
        </div>
      </PageIntro>

      <section aria-labelledby="heritage" className="overflow-hidden border-b border-[var(--ejo-border)]">
        <div className="mx-auto max-w-[1480px] px-4 pt-16 sm:px-6 lg:px-10 sm:pt-24">
          <h2 id="heritage" className="text-3xl font-bold leading-tight tracking-[-0.015em] sm:text-4xl">A hundred and sixty-six years, in thirteen moments</h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[var(--ejo-text-muted)]">From Sindh to Lagos, from handkerchiefs to assembly lines. Scroll along the line.</p>
        </div>
        <Ribbon />
      </section>

      <Section title="What we believe" lead="Four commitments guide every business the group starts, grows or hands on.">
        <div className="grid gap-x-10 gap-y-10 md:grid-cols-2">
          {PILLARS.map((p) => (
            <div key={p.title} className="border-t-2 border-[var(--ejo-primary)] pt-5">
              <h3 className="text-xl font-semibold">{p.title}</h3>
              <p className="mt-2 leading-relaxed text-[var(--ejo-text-muted)]">{p.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="tint" title="Family owned, professionally led" lead="The founding family still owns the group. Since 1993 its businesses have been run by professional managers, with the independence of owners and the accountability of a board.">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Prose>
            <p>The group has started companies that went on to stand on their own — Olam, now one of the world’s largest agribusinesses, began in Nigeria in 1989 to develop non-oil exports; Redington began distributing IT equipment in India in 1993; Afprint listed on the Lagos Stock Exchange. That is the pattern: find a market that matters, build a business that works, and let it grow beyond you.</p>
            <p>In Nigeria today the group runs {BUSINESSES.length} businesses from Lagos, Kano, Zaria and Yola, employing people in sales, engineering, farming, milling, logistics and care. Its Automobiles Manufacturing Hub in Isolo has assembled vehicles since 2016; its first locally assembled passenger SUVs left the line in 2026.</p>
            <p>The group received the inaugural EY–Barclays Family Business Award of Excellence in 2013.</p>
          </Prose>
          <div>
            <Facts items={[
              { k: 'Head office', v: <>{HEAD_OFFICE.address}<br /><span className="text-sm text-[var(--ejo-text-muted)]">{HEAD_OFFICE.box}</span></> },
              { k: 'Manufacturing', v: PLANT.address },
              { k: 'Group office', v: GROUP_OFFICE.address },
              { k: 'Countries', v: COUNTRIES.join(', ') },
            ]} />
            <div className="mt-6 flex flex-wrap gap-3">
              <Button href="/businesses">Our businesses</Button>
              <Button href="/news" variant="line">News & milestones</Button>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="dark" title="Where to find us" lead="Six businesses, one group. Each page has what it does, the companies behind it and where to reach them.">
        <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {BUSINESSES.map((b) => (
            <li key={b.slug}>
              <Link href={`/businesses/${b.slug}`} className="group flex items-start justify-between gap-4 border-b border-white/15 py-3">
                <span><span className="block text-lg font-semibold group-hover:text-[#7ee2a0]">{b.name}</span><span className="block text-sm text-white/65">{b.short}</span></span>
                <span aria-hidden className="mt-1 text-[#7ee2a0] transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}
