'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { removeLearnedAnswer } from './enyo';
import { friendlyError } from '@/lib/errors';

const PAGE = '/enyo/learning';

/** "Remove" on a learned answer (Enyo learning page). */
export async function removeLearnedAnswerFormAction(f: FormData) {
  try {
    await removeLearnedAnswer(String(f.get('learnedId') ?? ''));
  } catch (err) {
    redirect(`${PAGE}?error=${encodeURIComponent(friendlyError(err, 'That learned answer could not be removed.', 'enyo-learned'))}#learned`);
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?status=learned_removed#learned`);
}
