/**
 * News & media rules (pure, tested): a story is checked before it is saved or
 * published; the web address (slug) is made from the title; Markdown bodies
 * are rendered on the website through a safe renderer, so the body here is
 * only limited in size. No contact details in the summary (the website's
 * assistant may read it aloud to anyone).
 */
export const NEWS_CATEGORIES = ['NEWS', 'MILESTONE', 'PRESS_RELEASE', 'EVENT', 'COMMUNITY'] as const;
export type NewsCategoryKey = (typeof NEWS_CATEGORIES)[number];
export const NEWS_CATEGORY_LABEL: Record<NewsCategoryKey, string> = {
  NEWS: 'News', MILESTONE: 'Milestone', PRESS_RELEASE: 'Press release', EVENT: 'Event', COMMUNITY: 'Community',
};
export const NEWS_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type NewsStatusKey = (typeof NEWS_STATUSES)[number];
export const NEWS_STATUS_LABEL: Record<NewsStatusKey, string> = { DRAFT: 'Draft', PUBLISHED: 'Published', ARCHIVED: 'Archived' };

export type NewsInput = {
  title?: unknown; summary?: unknown; body?: unknown; category?: unknown; coverImageUrl?: unknown; coverAlt?: unknown;
  isFeatured?: unknown; businessArea?: unknown; publishedAt?: unknown; authorName?: unknown; slug?: unknown;
};
export type NewsValue = {
  title: string; summary: string; body: string; category: NewsCategoryKey; coverImageUrl: string | null; coverAlt: string | null;
  isFeatured: boolean; businessArea: string | null; publishedAt: Date | null; authorName: string | null; slug: string;
};

const line = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const flag = (v: unknown) => v === true || v === 'on' || v === 'true';

/** "SOUEAST assembly begins in Lagos!" → "soueast-assembly-begins-in-lagos". */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '') || 'story';
}

export const isSlug = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(v);

export function checkNews(input: NewsInput): { ok: true; value: NewsValue } | { ok: false; message: string } {
  const title = line(input.title, 140);
  const summary = line(input.summary, 320);
  const body = typeof input.body === 'string' ? input.body.replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, 20_000) : '';
  if (title.length < 6) return { ok: false, message: 'Give the story a headline (at least six characters).' };
  if (summary.length < 20) return { ok: false, message: 'Write a one- or two-sentence summary (at least 20 characters) — it is what the home page and search results show.' };
  if (body.length < 40) return { ok: false, message: 'Write the story itself (at least 40 characters). Markdown works: ## headings, lists, [links](https://…).' };
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(summary) || /(?:\+?\d[\s.-]?){9,}/.test(summary)) return { ok: false, message: 'Please leave phone numbers and email addresses out of the summary; put contact details in the story body if needed.' };
  if (/<\s*(script|iframe|object|embed|style)\b/i.test(body)) return { ok: false, message: 'The story cannot contain scripts or embedded frames.' };
  const category = (NEWS_CATEGORIES as readonly string[]).includes(String(input.category)) ? (input.category as NewsCategoryKey) : 'NEWS';
  let coverImageUrl: string | null = null;
  const cover = line(input.coverImageUrl, 500);
  if (cover) {
    let u: URL;
    try { u = new URL(cover); } catch { return { ok: false, message: 'The cover picture must be a full https:// address of an image.' }; }
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return { ok: false, message: 'The cover picture must be an https:// address.' };
    coverImageUrl = u.toString();
  }
  let publishedAt: Date | null = null;
  if (typeof input.publishedAt === 'string' && input.publishedAt.trim()) {
    const d = new Date(input.publishedAt.length <= 10 ? `${input.publishedAt}T09:00:00+01:00` : input.publishedAt);
    if (Number.isNaN(d.getTime())) return { ok: false, message: 'The date is not valid.' };
    publishedAt = d;
  } else if (input.publishedAt instanceof Date && !Number.isNaN(input.publishedAt.getTime())) {
    publishedAt = input.publishedAt;
  }
  const wanted = line(input.slug, 80).toLowerCase();
  const slug = wanted ? (isSlug(wanted) ? wanted : slugify(wanted)) : slugify(title);
  return {
    ok: true,
    value: {
      title, summary, body, category, coverImageUrl, coverAlt: coverImageUrl ? line(input.coverAlt, 160) || null : null,
      isFeatured: flag(input.isFeatured), businessArea: line(input.businessArea, 60) || null, publishedAt, authorName: line(input.authorName, 80) || null, slug,
    },
  };
}

/** Reading time from the body's word count (about 200 words a minute, at least one). */
export function readingMinutes(body: string): number {
  return Math.max(1, Math.round(body.trim().split(/\s+/).filter(Boolean).length / 200));
}
