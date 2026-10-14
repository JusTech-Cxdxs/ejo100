'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import {
  cancelReminder, completeReminder, createReminder, grantReminderDelegate, snoozeReminder, updateReminder, withdrawReminderDelegate, type ReminderInput,
} from './reminders';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Only our own pages are returned to (never an address from outside). */
function backTo(f: FormData, fallback = '/reminders'): string {
  const v = str(f, 'returnTo');
  return /^\/(reminders|dashboard|notifications)(\/[A-Za-z0-9_-]+)*\/?(\?[A-Za-z0-9_=&%.-]*)?$/.test(v) ? v : fallback;
}
function fail(path: string, err: unknown, fallback: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(friendlyError(err, fallback, 'reminders-form-handlers'))}`);
}
function done(path: string, status: string): never {
  revalidatePath('/reminders');
  redirect(`${path}${path.includes('?') ? '&' : '?'}status=${status}`);
}

function input(f: FormData): ReminderInput {
  return {
    forUserId: str(f, 'forUserId') || undefined,
    title: str(f, 'title'),
    notes: String(f.get('notes') ?? ''),
    dueAt: str(f, 'dueAt'),
    viaEmail: f.get('viaEmail') === 'on',
    recordType: str(f, 'recordType') || undefined,
    recordId: str(f, 'recordId') || undefined,
    source: str(f, 'source') === 'enyo' ? 'enyo' : 'form',
    removeRecord: f.get('removeRecord') === 'on',
  };
}

/** The form's own fields go back with an error, so nothing typed is lost. */
function keep(f: FormData): string {
  const q = new URLSearchParams();
  for (const k of ['title', 'notes', 'dueAt', 'recordType', 'recordId']) {
    const v = str(f, k);
    if (v) q.set(k, v.slice(0, k === 'notes' ? 2000 : 200));
  }
  const forId = str(f, 'forUserId');
  if (forId) q.set('for', forId);
  return q.toString();
}

export async function createReminderFormAction(f: FormData) {
  let forSomeoneElse = false;
  try {
    const i = input(f);
    await createReminder(i);
    forSomeoneElse = Boolean(i.forUserId);
  } catch (err) {
    const kept = keep(f);
    fail(`/reminders/new${kept ? `?${kept}` : ''}`, err, 'The reminder could not be saved.');
  }
  done('/reminders', forSomeoneElse ? 'set_for_colleague' : 'created');
}

export async function updateReminderFormAction(f: FormData) {
  const id = str(f, 'reminderId');
  try {
    await updateReminder(id, input(f));
  } catch (err) {
    fail(`/reminders/${encodeURIComponent(id)}/edit`, err, 'The reminder could not be saved.');
  }
  done('/reminders', 'updated');
}

export async function completeReminderFormAction(f: FormData) {
  const back = backTo(f);
  try {
    await completeReminder(str(f, 'reminderId'));
  } catch (err) {
    fail(back, err, 'The reminder could not be marked done.');
  }
  revalidatePath('/dashboard');
  done(back, 'done');
}

export async function cancelReminderFormAction(f: FormData) {
  const back = backTo(f);
  try {
    await cancelReminder(str(f, 'reminderId'));
  } catch (err) {
    fail(back, err, 'The reminder could not be cancelled.');
  }
  done(back, 'cancelled');
}

export async function snoozeReminderFormAction(f: FormData) {
  const back = backTo(f);
  try {
    await snoozeReminder(str(f, 'reminderId'), str(f, 'until') === 'tomorrow' ? 'tomorrow' : '1h');
  } catch (err) {
    fail(back, err, 'The reminder could not be snoozed.');
  }
  done(back, str(f, 'until') === 'tomorrow' ? 'snoozed_tomorrow' : 'snoozed_hour');
}

export async function grantDelegateFormAction(f: FormData) {
  try {
    await grantReminderDelegate(str(f, 'delegateId'));
  } catch (err) {
    fail('/reminders', err, 'That colleague could not be added.');
  }
  done('/reminders', 'delegate_granted');
}

export async function withdrawDelegateFormAction(f: FormData) {
  try {
    await withdrawReminderDelegate(str(f, 'delegateId'));
  } catch (err) {
    fail('/reminders', err, 'That permission could not be withdrawn.');
  }
  done('/reminders', 'delegate_withdrawn');
}
