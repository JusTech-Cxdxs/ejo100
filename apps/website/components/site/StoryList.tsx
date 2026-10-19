import Link from 'next/link';
import { Cover } from '@/components/site/Page';
import { CATEGORY_LABEL, storyDate, type StoryCard } from '@/lib/news/data';

const COVER_TONE: Record<string, string> = {
  Automotive: 'linear-gradient(135deg, #0b2416 0%, #22983f 100%)',
  Agriculture: 'linear-gradient(135deg, #1a3a12 0%, #6cbf3c 100%)',
  Manufacturing: 'linear-gradient(135deg, #10231a 0%, #3f6b52 100%)',
  Food: 'linear-gradient(135deg, #3b2a0a 0%, #c9a227 100%)',
  Logistics: 'linear-gradient(135deg, #0f1f2e 0%, #2f6e8a 100%)',
  Healthcare: 'linear-gradient(135deg, #0f2a26 0%, #2ea48a 100%)',
};

const AREA_IMAGE: Record<string, string> = { automotive: '/images/business/automotive.jpg', agriculture: '/images/business/agriculture.jpg', manufacturing: '/images/business/manufacturing.jpg', food: '/images/business/food.jpg', logistics: '/images/business/logistics.jpg', healthcare: '/images/business/healthcare.jpg' };

/** A story's cover: its own picture; else the business's photograph under a tint, with the category. */
export function StoryCover({ s, className = '' }: { s: StoryCard; className?: string }) {
  if (s.coverImageUrl) return <Cover src={s.coverImageUrl} alt={s.coverAlt ?? ''} className={className} />;
  const area = (s.businessArea ?? '').toLowerCase();
  return (
    <Cover src={AREA_IMAGE[area] ?? '/images/about/about-img.jpg'} alt="" className={className} style={{ background: COVER_TONE[s.businessArea ?? ''] ?? COVER_TONE.Manufacturing }}>
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0b2416]/80 via-[#0b2416]/20 to-transparent" />
      <span aria-hidden className="absolute -bottom-2 right-4 select-none text-[4.5rem] font-extrabold leading-none tracking-[-0.05em] text-white/15 sm:text-[6rem]">{s.publishedAt.slice(0, 4)}</span>
      <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#0b2416]">{CATEGORY_LABEL[s.category]}</span>
    </Cover>
  );
}

export function StoryList({ stories, featuredFirst = false }: { stories: StoryCard[]; featuredFirst?: boolean }) {
  const [first, ...rest] = stories;
  if (!first) return null;
  if (featuredFirst) {
    return (
      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Link href={`/news/${first.slug}`} className="group block">
          <StoryCover s={first} className="aspect-[16/9]" />
          <p className="mt-5 text-sm text-[var(--ejo-text-muted)]">{CATEGORY_LABEL[first.category]} · {storyDate(first.publishedAt)}</p>
          <h3 className="mt-2 text-2xl font-bold leading-tight tracking-[-0.01em] group-hover:text-[var(--ejo-primary)] sm:text-3xl">{first.title}</h3>
          <p className="mt-3 max-w-2xl text-[1.0625rem] leading-relaxed text-[var(--ejo-text-muted)]">{first.summary}</p>
        </Link>
        <div className="divide-y divide-[var(--ejo-border)] lg:border-l lg:border-[var(--ejo-border)] lg:pl-10">
          {rest.map((s) => (
            <Link key={s.slug} href={`/news/${s.slug}`} className="group block py-5 first:pt-0">
              <p className="text-sm text-[var(--ejo-text-muted)]">{CATEGORY_LABEL[s.category]} · {storyDate(s.publishedAt)}</p>
              <h3 className="mt-1.5 text-lg font-semibold leading-snug group-hover:text-[var(--ejo-primary)]">{s.title}</h3>
              <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[var(--ejo-text-muted)]">{s.summary}</p>
            </Link>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {stories.map((s) => (
        <Link key={s.slug} href={`/news/${s.slug}`} className="group block">
          <StoryCover s={s} className="aspect-[16/10]" />
          <p className="mt-4 text-sm text-[var(--ejo-text-muted)]">{CATEGORY_LABEL[s.category]} · {storyDate(s.publishedAt)}</p>
          <h3 className="mt-1.5 text-lg font-semibold leading-snug group-hover:text-[var(--ejo-primary)]">{s.title}</h3>
          <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-[var(--ejo-text-muted)]">{s.summary}</p>
        </Link>
      ))}
    </div>
  );
}
