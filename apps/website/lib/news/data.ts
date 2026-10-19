import 'server-only';
import { cache } from 'react';
import { prisma } from '@ejo/database';
import { siteOrganisation } from '@/lib/enyo/settings';
import { FIRST_STORIES, type Story } from './stories';

/**
 * Published stories for this website's organisation, newest first. A
 * database without the news table yet (older than v41), or with nothing
 * falls back to the first stories; an organisation that has archived every story shows none.
 */
export type StoryCard = Story & { readMinutes: number };

const minutes = (body: string) => Math.max(1, Math.round(body.trim().split(/\s+/).filter(Boolean).length / 200));
const card = (s: Story): StoryCard => ({ ...s, readMinutes: minutes(s.body) });

export const listStories = cache(async (): Promise<StoryCard[]> => {
  try {
    const org = await siteOrganisation();
    if (!org) return FIRST_STORIES.map(card);
    const rows = await prisma.newsPost.findMany({
      where: { organisationId: org.id, status: 'PUBLISHED', publishedAt: { lte: new Date() } },
      orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }],
      take: 200,
      select: { slug: true, title: true, summary: true, body: true, category: true, businessArea: true, publishedAt: true, isFeatured: true, coverImageUrl: true, coverAlt: true, authorName: true },
    });
    // Nothing published (the team archived everything) shows nothing — the built-in stories are only for a site with no organisation or no news table yet.
    return rows.map((r) => card({ ...r, publishedAt: (r.publishedAt ?? new Date()).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) }));
  } catch {
    return FIRST_STORIES.map(card);
  }
});

export const getStory = cache(async (slug: string): Promise<StoryCard | null> => {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const all = await listStories();
  return all.find((s) => s.slug === slug) ?? null;
});

export function storyDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00+01:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
}

export const CATEGORY_LABEL: Record<Story['category'], string> = { NEWS: 'News', MILESTONE: 'Milestone', PRESS_RELEASE: 'Press release', EVENT: 'Event', COMMUNITY: 'Community' };
