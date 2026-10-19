import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button, Cover, Facts, LinkRow, PageIntro, Prose, Section } from '@/components/site/Page';
import { BUSINESSES, COMPANIES } from '@/lib/content/group';
import { listStories } from '@/lib/news/data';
import { StoryList } from '@/components/site/StoryList';

export function businessMetadata(slug: string): Metadata {
  const b = BUSINESSES.find((x) => x.slug === slug);
  return b ? { title: b.name, description: b.summary } : {};
}

/** One business, one page: what it does, who does it, where, and the latest about it. */
export async function BusinessPage({ slug, children }: { slug: string; children?: React.ReactNode }) {
  const b = BUSINESSES.find((x) => x.slug === slug);
  if (!b) notFound();
  const companies = COMPANIES.filter((c) => c.business === slug);
  const stories = (await listStories()).filter((s) => (s.businessArea ?? '').toLowerCase() === b.name.toLowerCase()).slice(0, 3);
  const others = BUSINESSES.filter((x) => x.slug !== slug);
  return (
    <main>
      <PageIntro kicker="Our businesses" title={b.name} lede={b.summary} image={b.image} imageAlt="" tone="dark">
        <div className="flex flex-wrap gap-3">
          <Button href="/contact" variant="light">Talk to us</Button>
          {slug === 'automotive' ? <Button href="/customer-portal" variant="line" className="border-white/30 text-white hover:bg-white/10">Customer portal</Button> : null}
        </div>
      </PageIntro>

      <Section title="What we do" aside={<Cover src={b.image} alt="" className="aspect-[4/3] w-full lg:w-[22rem]" />}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ul className="space-y-3">
            {b.offers.map((o) => (
              <li key={o} className="flex gap-3 text-[1.0625rem] leading-relaxed"><span aria-hidden className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ejo-primary)]" />{o}</li>
            ))}
          </ul>
          <div>
            {b.brands ? (
              <>
                <h3 className="text-sm font-semibold text-[var(--ejo-text-muted)]">Brands we represent</h3>
                <p className="mt-2 text-lg leading-relaxed">{b.brands.join(' · ')}</p>
              </>
            ) : null}
            <h3 className={`text-sm font-semibold text-[var(--ejo-text-muted)] ${b.brands ? 'mt-6' : ''}`}>Where</h3>
            <ul className="mt-2 space-y-1 text-[1.0625rem]">{b.places.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        </div>
      </Section>

      {children}

      <Section tone="tint" title="The companies" lead="Each company has its own team and its own line; call the right one and you reach the people who do the work.">
        <div className="grid gap-8 lg:grid-cols-2">
          {companies.map((c) => (
            <div key={c.name} className="border-t border-[var(--ejo-border)] pt-5">
              <h3 className="text-xl font-semibold">{c.name}</h3>
              <p className="mt-1 text-[var(--ejo-text-muted)]">{c.does}</p>
              <Facts items={[
                ...(c.where ? [{ k: 'Where', v: c.where }] : []),
                ...(c.phone ? [{ k: 'Phone', v: <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="font-medium text-[var(--ejo-primary)] hover:underline">{c.phone}</a> }] : []),
                ...(c.email ? [{ k: 'Email', v: <a href={`mailto:${c.email}`} className="break-all font-medium text-[var(--ejo-primary)] hover:underline">{c.email}</a> }] : []),
              ]} />
            </div>
          ))}
        </div>
      </Section>

      {stories.length ? (
        <Section title={`Latest from ${b.name}`} aside={<Link href="/news" className="font-semibold text-[var(--ejo-primary)] hover:underline">All news →</Link>}>
          <StoryList stories={stories} />
        </Section>
      ) : null}

      <Section tone="dark" title="More of the group">
        <div className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((o) => <LinkRowDark key={o.slug} href={`/businesses/${o.slug}`} title={o.name} text={o.short} />)}
        </div>
      </Section>
    </main>
  );
}

function LinkRowDark({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="group flex items-center border-b border-white/15 py-4">
      <span className="min-w-0 flex-1"><span className="block font-semibold group-hover:text-[#7ee2a0]">{title}</span><span className="mt-0.5 block text-sm text-white/65">{text}</span></span>
      <span aria-hidden className="ml-4 shrink-0 text-[#7ee2a0] transition-transform group-hover:translate-x-1">→</span>
    </Link>
  );
}

export { LinkRow, Prose };
