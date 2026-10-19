'use server';

import { prisma } from '@ejo/database';
import { authorize, myOrganisationId, refuseDuringAssist } from '@/lib/authz/server';
import { requireUser } from './workshop';
import { writeAuditLog } from '@/lib/workshop-core';
import { checkNews, isSlug, slugify, type NewsCategoryKey, type NewsInput, type NewsStatusKey } from '@/lib/news/core';

/**
 * News & media: what the communications team publishes on the public
 * website. Stories are written here as drafts, previewed, published (with a
 * date) and later archived; the website shows only PUBLISHED stories of its
 * own organisation. website.news.manage, the person's own organisation only,
 * refused in an assisted session, every change in the audit trail.
 */
class NewsError extends Error {}
const PERM = 'website.news.manage' as const;

async function newsOrg(where: string): Promise<{ organisationId: string; userId: string }> {
  await authorize(PERM, undefined, where, 'Only the communications team and administrators manage news & media.');
  const user = await requireUser();
  const organisationId = await myOrganisationId();
  if (!organisationId) throw new NewsError('This account is not placed in an organisation yet.');
  return { organisationId, userId: user.id };
}

export type NewsRow = {
  id: string; slug: string; title: string; summary: string; body: string; category: NewsCategoryKey; status: NewsStatusKey;
  coverImageUrl: string | null; coverAlt: string | null; isFeatured: boolean; businessArea: string | null; publishedAt: Date | null;
  authorName: string | null; updatedAt: Date; createdAt: Date;
};
const SELECT = { id: true, slug: true, title: true, summary: true, body: true, category: true, status: true, coverImageUrl: true, coverAlt: true, isFeatured: true, businessArea: true, publishedAt: true, authorName: true, updatedAt: true, createdAt: true } as const;

export async function listNews(): Promise<{ rows: NewsRow[]; areas: string[]; websiteUrl: string | null }> {
  const { organisationId } = await newsOrg('news.list');
  const [rows, units] = await Promise.all([
    prisma.newsPost.findMany({ where: { organisationId }, orderBy: [{ status: 'asc' }, { publishedAt: 'desc' }, { updatedAt: 'desc' }], take: 300, select: SELECT }),
    prisma.businessUnit.findMany({ where: { organisationId, isActive: true }, orderBy: { name: 'asc' }, take: 50, select: { name: true } }),
  ]);
  const { websiteBaseUrl } = await import('@/lib/portal-url');
  return { rows: rows as NewsRow[], areas: [...new Set(['Group', ...units.map((u) => u.name)])], websiteUrl: websiteBaseUrl() || null };
}

export async function getNews(id: string): Promise<NewsRow | null> {
  const { organisationId } = await newsOrg('news.get');
  // The story's own organisation only (inMyOrganisation by the fence in the query).
  return (await prisma.newsPost.findFirst({ where: { id, organisationId }, select: SELECT })) as NewsRow | null;
}

async function freeSlug(organisationId: string, wanted: string, exceptId: string | null): Promise<string> {
  let slug = isSlug(wanted) ? wanted : slugify(wanted);
  for (let n = 2; n < 50; n++) {
    const clash = await prisma.newsPost.findFirst({ where: { organisationId, slug, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { id: true } });
    if (!clash) return slug;
    slug = `${(isSlug(wanted) ? wanted : slugify(wanted)).slice(0, 74)}-${n}`;
  }
  throw new NewsError('Choose a different web address for this story — this one is taken.');
}

/** Saves a draft or an edit; publishing is a separate step (publishNews). */
export async function saveNews(id: string | null, input: NewsInput): Promise<string> {
  const { organisationId, userId } = await newsOrg('news.save');
  await refuseDuringAssist('news.save');
  const checked = checkNews(input);
  if (!checked.ok) throw new NewsError(checked.message);
  const v = checked.value;
  const slug = await freeSlug(organisationId, v.slug, id);
  const data = { title: v.title, summary: v.summary, body: v.body, category: v.category, coverImageUrl: v.coverImageUrl, coverAlt: v.coverAlt, isFeatured: v.isFeatured, businessArea: v.businessArea, authorName: v.authorName, slug, updatedById: userId, ...(v.publishedAt ? { publishedAt: v.publishedAt } : {}) };
  if (id) {
    const res = await prisma.newsPost.updateMany({ where: { id, organisationId }, data });
    if (!res.count) throw new NewsError('That story no longer exists. Refresh the page.');
  } else {
    const count = await prisma.newsPost.count({ where: { organisationId } });
    if (count >= 2000) throw new NewsError('The archive holds at most 2,000 stories. Delete old drafts first.');
    const row = await prisma.newsPost.create({ data: { ...data, organisationId, createdById: userId }, select: { id: true } });
    id = row.id;
  }
  // Only one PUBLISHED story is featured at a time; a featured draft takes over when it is published (setNewsStatus).
  const saved = await prisma.newsPost.findFirst({ where: { id, organisationId }, select: { status: true } });
  if (v.isFeatured && saved?.status === 'PUBLISHED') await prisma.newsPost.updateMany({ where: { organisationId, isFeatured: true, status: 'PUBLISHED', NOT: { id } }, data: { isFeatured: false } });
  await writeAuditLog({ userId, action: 'news.saved', entityType: 'NewsPost', entityId: id, metadata: { title: v.title, category: v.category, slug } });
  return id;
}

/** Published → on the website from its date (now when none was set). Archived → taken off; its address keeps working for staff only. */
export async function setNewsStatus(id: string, status: NewsStatusKey): Promise<void> {
  const { organisationId, userId } = await newsOrg('news.status');
  await refuseDuringAssist('news.status');
  const row = await prisma.newsPost.findFirst({ where: { id, organisationId }, select: { publishedAt: true, status: true, title: true, isFeatured: true } });
  if (!row) throw new NewsError('That story no longer exists.');
  if (status === row.status) return;
  const data = status === 'PUBLISHED' && !row.publishedAt ? { status, publishedAt: new Date(), updatedById: userId } : { status, updatedById: userId };
  await prisma.newsPost.updateMany({ where: { id, organisationId }, data });
  if (status === 'PUBLISHED' && row.isFeatured) await prisma.newsPost.updateMany({ where: { organisationId, isFeatured: true, status: 'PUBLISHED', NOT: { id } }, data: { isFeatured: false } });
  await writeAuditLog({ userId, action: status === 'PUBLISHED' ? 'news.published' : status === 'ARCHIVED' ? 'news.archived' : 'news.unpublished', entityType: 'NewsPost', entityId: id, metadata: { title: row.title } });
}

/** Drafts only: a published or archived story is part of the record and is archived instead. */
export async function deleteNews(id: string): Promise<void> {
  const { organisationId, userId } = await newsOrg('news.delete');
  await refuseDuringAssist('news.delete');
  const row = await prisma.newsPost.findFirst({ where: { id, organisationId }, select: { status: true, title: true } });
  if (!row) throw new NewsError('That story no longer exists.');
  if (row.status !== 'DRAFT') throw new NewsError('A story that has been published is archived, not deleted — so the record stays whole.');
  await prisma.newsPost.deleteMany({ where: { id, organisationId, status: 'DRAFT' } });
  await writeAuditLog({ userId, action: 'news.draft_deleted', entityType: 'NewsPost', entityId: id, metadata: { title: row.title } });
}
