import Link from 'next/link';
import { StoryList } from '@/components/site/StoryList';
import { listStories } from '@/lib/news/data';
import { siteConfig } from '@/lib/site-config';

/** The home page's news: the featured story and the three latest, from News & media in the staff portal. */
export async function NewsSection() {
  const stories = (await listStories()).slice(0, 4);
  if (!stories.length) return null;
  return (
    <section className="mx-auto max-w-[1480px] px-4 py-20 sm:px-6 lg:px-10 sm:py-28" aria-labelledby="home-news">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4 sm:mb-14">
        <div>
          <p className="text-sm font-semibold text-[var(--ejo-primary)]">News & media</p>
          <h2 id="home-news" className="mt-2 text-3xl font-bold leading-tight tracking-[-0.015em] sm:text-4xl">What’s happening at {siteConfig.organisationName}</h2>
        </div>
        <Link href="/news" className="font-semibold text-[var(--ejo-primary)] hover:underline">All news →</Link>
      </div>
      <StoryList stories={stories} featuredFirst />
    </section>
  );
}
