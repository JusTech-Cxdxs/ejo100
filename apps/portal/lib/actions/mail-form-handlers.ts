'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { connectMailbox, disconnectMailbox, sendMyMail, setMailConsent, setMyMessageFlags } from './mail';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

function fail(path: string, err: unknown, fallback: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(friendlyError(err, fallback, 'mail-form-handlers'))}`);
}

/** Only back to a Mail page (never an address from outside). */
function backTo(f: FormData): string {
  const v = str(f, 'returnTo');
  return /^\/mail(\/[a-z]+)?(\?[A-Za-z0-9_=&%.+-]*)?$/.test(v) ? v : '/mail';
}

/** The connect form: on a problem, back with the settings typed (never the password). */
export async function connectMailboxFormAction(f: FormData) {
  const fields = ['preset', 'address', 'displayName', 'imapHost', 'imapPort', 'imapSecurity', 'smtpHost', 'smtpPort', 'smtpSecurity', 'username'] as const;
  const raw: Record<string, unknown> = {};
  for (const k of fields) raw[k] = str(f, k);
  raw.password = String(f.get('password') ?? '');
  let created = false;
  try {
    created = (await connectMailbox(raw)).created;
  } catch (err) {
    const keep = new URLSearchParams();
    for (const k of fields) if (raw[k]) keep.set(k, String(raw[k]).slice(0, 254));
    fail(`/mail/connect?${keep.toString()}`, err, 'The mailbox could not be connected.');
  }
  revalidatePath('/mail');
  redirect(created ? '/mail/consent' : '/mail/settings?status=reconnected');
}

export async function mailConsentFormAction(f: FormData) {
  const choice = str(f, 'choice');
  const back = str(f, 'from') === 'settings' ? '/mail/settings' : '/mail';
  try {
    await setMailConsent(choice === 'allow');
  } catch (err) {
    fail(back, err, 'Your choice could not be saved.');
  }
  revalidatePath('/mail');
  redirect(`${back}?status=${choice === 'allow' ? 'consent_given' : str(f, 'from') === 'settings' ? 'consent_withdrawn' : 'consent_declined'}`);
}

export async function disconnectMailboxFormAction(f: FormData) {
  if (str(f, 'confirm') !== 'yes') fail('/mail/settings', new Error('Tick the box to confirm, then press Disconnect.'), 'Not disconnected.');
  try {
    await disconnectMailbox();
  } catch (err) {
    fail('/mail/settings', err, 'The mailbox could not be disconnected.');
  }
  revalidatePath('/mail');
  redirect('/mail?status=disconnected');
}

export async function messageFlagsFormAction(f: FormData) {
  const back = backTo(f);
  const flags: { seen?: boolean; flagged?: boolean } = {};
  if (str(f, 'seen')) flags.seen = str(f, 'seen') === '1';
  if (str(f, 'flagged')) flags.flagged = str(f, 'flagged') === '1';
  try {
    await setMyMessageFlags(str(f, 'messageId'), flags);
  } catch (err) {
    fail(back, err, 'That could not be changed.');
  }
  revalidatePath('/mail');
  redirect(back);
}

export async function sendMailFormAction(f: FormData) {
  const input = { to: str(f, 'to'), cc: str(f, 'cc'), subject: str(f, 'subject'), body: String(f.get('body') ?? ''), inReplyTo: str(f, 'inReplyTo') || undefined, style: str(f, 'style') || 'standard' };
  try {
    await sendMyMail(input);
  } catch (err) {
    // Back to the form with what was written (clipped), so nothing is lost.
    const keep = new URLSearchParams();
    if (input.to) keep.set('to', input.to.slice(0, 1000));
    if (input.cc) keep.set('cc', input.cc.slice(0, 1000));
    if (input.subject) keep.set('subject', input.subject.slice(0, 300));
    if (input.body) keep.set('body', input.body.slice(0, 6000));
    if (input.inReplyTo) keep.set('inReplyTo', input.inReplyTo);
    keep.set('style', input.style);
    keep.set('kept', '1');
    fail(`/mail/compose?${keep.toString()}`, err, 'The message could not be sent.');
  }
  revalidatePath('/mail');
  redirect(`/mail?status=sent${input.inReplyTo ? `&m=${encodeURIComponent(input.inReplyTo)}` : ''}`);
}
