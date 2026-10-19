'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { deleteNews, saveNews, setNewsStatus } from './news';
import type { NewsStatusKey } from '@/lib/news/core';

const PAGE = '/news';
const s = (f: FormData, k: string) => { const v = f.get(k); return typeof v === 'string' ? v : ''; };

export async function saveNewsFormAction(f: FormData) {
  const id = s(f, 'id') || null;
  let saved = '';
  try {
    saved = await saveNews(id, {
      title: s(f, 'title'), summary: s(f, 'summary'), body: s(f, 'body'), category: s(f, 'category'), coverImageUrl: s(f, 'coverImageUrl'), coverAlt: s(f, 'coverAlt'),
      isFeatured: s(f, 'isFeatured'), businessArea: s(f, 'businessArea'), publishedAt: s(f, 'publishedAt'), authorName: s(f, 'authorName'), slug: s(f, 'slug'),
    });
    if (s(f, 'then') === 'publish') await setNewsStatus(saved, 'PUBLISHED');
  } catch (err) {
    redirect(`${id ? `${PAGE}/${id}` : `${PAGE}/new`}?error=${encodeURIComponent(friendlyError(err, 'That could not be saved.', 'news-form-handlers'))}`);
  }
  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${saved}`);
  redirect(`${PAGE}/${saved}?status=${s(f, 'then') === 'publish' ? 'published' : 'saved'}`);
}

export async function newsStatusFormAction(f: FormData) {
  const id = s(f, 'id');
  const status = s(f, 'status') as NewsStatusKey;
  try {
    if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) throw new Error('Unknown status.');
    await setNewsStatus(id, status);
  } catch (err) {
    redirect(`${PAGE}/${id}?error=${encodeURIComponent(friendlyError(err, 'That could not be changed.', 'news-form-handlers'))}`);
  }
  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${id}`);
  redirect(`${PAGE}/${id}?status=${status.toLowerCase()}`);
}

export async function deleteNewsFormAction(f: FormData) {
  const id = s(f, 'id');
  try {
    await deleteNews(id);
  } catch (err) {
    redirect(`${PAGE}/${id}?error=${encodeURIComponent(friendlyError(err, 'That could not be deleted.', 'news-form-handlers'))}`);
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?status=deleted`);
}
