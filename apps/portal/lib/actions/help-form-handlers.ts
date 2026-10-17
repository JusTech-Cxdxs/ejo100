'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { answerMyHelpRequest, openHelpRequest, replyToMyHelpRequest } from './help';
import { requireUser } from './workshop';

/** <form action> wrappers for Get help (each calls the action, which works only on the person's own requests). */

const str = (f: FormData, k: string) => String(f.get(k) ?? '');
const page = (id: string) => `/support/help/${encodeURIComponent(id)}`;

export type HelpFormState = { error: string | null; subject: string; body: string; to: string; about?: string };

export async function openHelpRequestAction(_prev: HelpFormState, f: FormData): Promise<HelpFormState> {
  await requireUser();
  const input = { subject: str(f, 'subject'), body: str(f, 'body'), about: str(f, 'about'), to: str(f, 'about') === 'fault' ? 'platform' : 'organisation', ref: str(f, 'ref'), page: str(f, 'page') };
  let id = '';
  try {
    id = (await openHelpRequest(input)).id;
  } catch (err) {
    return { error: friendlyError(err, 'Could not send your request.', 'help-form-handlers'), subject: input.subject, body: input.body, to: input.to, about: input.about };
  }
  revalidatePath('/support/help');
  redirect(`${page(id)}?status=sent`);
}

export type HelpReplyState = { error: string | null; body: string };

export async function replyToMyHelpRequestAction(_prev: HelpReplyState, f: FormData): Promise<HelpReplyState> {
  await requireUser();
  const id = str(f, 'id');
  const body = str(f, 'body');
  try {
    await replyToMyHelpRequest(id, body);
  } catch (err) {
    return { error: friendlyError(err, 'Could not send your message.', 'help-form-handlers'), body };
  }
  revalidatePath(page(id));
  redirect(`${page(id)}?status=replied`);
}

export async function answerMyHelpRequestAction(f: FormData): Promise<void> {
  await requireUser();
  const id = str(f, 'id');
  let status = '';
  try {
    status = await answerMyHelpRequest(id, str(f, 'choice'));
  } catch (err) {
    redirect(`${page(id)}?error=${encodeURIComponent(friendlyError(err, 'Could not save that.', 'help-form-handlers'))}`);
  }
  revalidatePath(page(id));
  redirect(`${page(id)}?status=${status}`);
}
