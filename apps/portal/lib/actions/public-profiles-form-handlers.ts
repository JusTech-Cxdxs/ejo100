'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { movePublicProfile, removePublicProfile, savePublicProfile } from './public-profiles';

const PAGE = '/organisation/people';
const s = (f: FormData, k: string) => { const v = f.get(k); return typeof v === 'string' ? v : ''; };

export async function savePublicProfileFormAction(f: FormData) {
  const id = s(f, 'id') || null;
  try {
    await savePublicProfile(id, { name: s(f, 'name'), title: s(f, 'title'), area: s(f, 'area'), bio: s(f, 'bio'), profileUrl: s(f, 'profileUrl'), isPublic: s(f, 'isPublic') });
  } catch (err) {
    redirect(`${PAGE}?error=${encodeURIComponent(friendlyError(err, 'That could not be saved.', 'public-profiles-form-handlers'))}${id ? `&edit=${encodeURIComponent(id)}` : '&add=1'}`);
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?status=${id ? 'saved' : 'added'}`);
}

export async function removePublicProfileFormAction(f: FormData) {
  try {
    await removePublicProfile(s(f, 'id'));
  } catch (err) {
    redirect(`${PAGE}?error=${encodeURIComponent(friendlyError(err, 'That could not be removed.', 'public-profiles-form-handlers'))}`);
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?status=removed`);
}

export async function movePublicProfileFormAction(f: FormData) {
  try {
    await movePublicProfile(s(f, 'id'), s(f, 'direction') === 'down' ? 'down' : 'up');
  } catch (err) {
    redirect(`${PAGE}?error=${encodeURIComponent(friendlyError(err, 'That could not be moved.', 'public-profiles-form-handlers'))}`);
  }
  revalidatePath(PAGE);
  redirect(PAGE);
}
