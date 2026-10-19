import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleBody } from '@ejo/ui';
import { Section } from '@/components/site/Page';
import { StoryCover, StoryList } from '@/components/site/StoryList';
import { CATEGORY_LABEL, getStory, listStories, storyDate } from '@/lib/news/data';
import { siteConfig } from '@/lib/site-config';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = await getStory(slug);
  if (!s) return { title: 'Story not found' };
  return { title: s.title, description: s.summary, openGraph: { title: s.title, description: s.summary, type: 'article', publishedTime: s.publishedAt, ...(s.coverImageUrl ? { images: [s.coverImageUrl] } : {}) } };
}

export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await getStory(slug);
  if (!s) notFound();
  const more = (await listStories()).filter((x) => x.slug !== s.slug).slice(0, 3);
  const jsonLd = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: s.title, description: s.summary, datePublished: s.publishedAt, author: { '@type': 'Organization', name: s.authorName ?? siteConfig.organisationName }, publisher: { '@type': 'Organization', name: siteConfig.organisationName }, ...(s.coverImageUrl ? { image: [s.coverImageUrl] } : {}) };
  return (
    <main>
      <article>
        <header className="mx-auto max-w-3xl px-4 pt-28 sm:px-6 lg:px-10 sm:pt-36">
          <p className="ejo-intro text-sm font-semibold text-[var(--ejo-primary)]"><Link href="/news" className="hover:underline">News & media</Link> · {CATEGORY_LABEL[s.category]}{s.businessArea ? ` · ${s.businessArea}` : ''}</p>
          <h1 className="mt-4 text-[2.125rem] font-extrabold leading-[1.08] tracking-[-0.02em] sm:text-5xl">{s.title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-[var(--ejo-text-muted)] sm:text-xl">{s.summary}</p>
          <p className="mt-6 text-sm text-[var(--ejo-text-muted)]"><time dateTime={s.publishedAt}>{storyDate(s.publishedAt)}</time> · {s.readMinutes} min read{s.authorName ? ` · ${s.authorName}` : ''}</p>
        </header>
        <div className="mx-auto mt-10 max-w-5xl px-4 sm:px-6 lg:px-10"><StoryCover s={s} className="aspect-[16/9] sm:aspect-[21/9]" /></div>
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-10 sm:py-16">
          <ArticleBody markdown={s.body} linkElement={(href, children, key) => href.startsWith('/') ? <Link key={key} href={href} className="font-medium text-[var(--ejo-primary)] underline decoration-[var(--ejo-primary)]/40 underline-offset-[3px] hover:decoration-[var(--ejo-primary)]">{children}</Link> : <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--ejo-primary)] underline decoration-[var(--ejo-primary)]/40 underline-offset-[3px] hover:decoration-[var(--ejo-primary)]">{children}</a>} />
          <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-[var(--ejo-border)] pt-6">
            <Link href="/news" className="font-semibold text-[var(--ejo-primary)] hover:underline">← All news</Link>
            <Link href="/contact?topic=media" className="text-sm text-[var(--ejo-text-muted)] hover:text-[var(--ejo-text)]">Press enquiries</Link>
          </div>
        </div>
      </article>
      {more.length ? <Section tone="tint" title="More from the group"><StoryList stories={more} /></Section> : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
    </main>
  );
}
