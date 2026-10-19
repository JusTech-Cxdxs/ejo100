import type { Metadata } from 'next';
import Link from 'next/link';
import { PageIntro, Section } from '@/components/site/Page';
import { StoryList } from '@/components/site/StoryList';
import { CATEGORY_LABEL, listStories } from '@/lib/news/data';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = { title: 'News & media', description: 'Stories, milestones, press releases and events from the group’s businesses in Nigeria.' };
export const dynamic = 'force-dynamic';

const KINDS = ['ALL', 'MILESTONE', 'NEWS', 'PRESS_RELEASE', 'EVENT', 'COMMUNITY'] as const;

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const all = await listStories();
  const current = (KINDS as readonly string[]).includes(kind ?? '') ? (kind as (typeof KINDS)[number]) : 'ALL';
  const shown = current === 'ALL' ? all : all.filter((s) => s.category === current);
  const present = KINDS.filter((k) => k === 'ALL' || all.some((s) => s.category === k));
  return (
    <main>
      <PageIntro kicker="News & media" title={`What’s happening at ${siteConfig.organisationName}`} lede="Milestones, launches, plants opened, people and programmes — from the businesses, as they happen." />
      <Section>
        {present.length > 2 ? (
          <nav aria-label="Kind of story" className="mb-10 flex flex-wrap gap-2">
            {present.map((k) => <Link key={k} href={k === 'ALL' ? '/news' : `/news?kind=${k}`} aria-current={current === k ? 'page' : undefined} className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium ${current === k ? 'border-[var(--ejo-primary)] bg-[var(--ejo-primary)] text-white' : 'border-[var(--ejo-border)] text-[var(--ejo-text)] hover:bg-[var(--ejo-surface)]'}`}>{k === 'ALL' ? 'Everything' : CATEGORY_LABEL[k]}</Link>)}
          </nav>
        ) : null}
        {shown.length ? <StoryList stories={shown} featuredFirst={current === 'ALL'} /> : <p className="text-[var(--ejo-text-muted)]">Nothing here yet.</p>}
      </Section>
      <Section tone="tint" narrow title="Press and media enquiries" lead="Interviews, statements, pictures and facts about the group.">
        <Link href="/contact?topic=media" className="inline-flex min-h-12 items-center rounded-full bg-[var(--ejo-primary)] px-6 text-sm font-semibold text-white hover:opacity-90">Contact Corporate Communications</Link>
      </Section>
    </main>
  );
}
