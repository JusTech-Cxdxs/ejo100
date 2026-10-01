'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { markNotificationsRead, markAllRead, createBroadcast, stopBroadcast, reactivateBroadcast, deleteBroadcast } from './notifications';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
function back(path: string, err: unknown, fallback: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(err instanceof Error ? err.message : fallback)}`);
}
function ok(path: string, status: string): never {
  revalidatePath('/', 'layout');
  redirect(`${path}${path.includes('?') ? '&' : '?'}status=${status}`);
}

export async function markReadFormAction(f: FormData) {
  await markNotificationsRead(f.getAll('key').map(String));
  ok(str(f, 'returnTo') || '/notifications', 'read');
}

export async function markAllReadFormAction(f: FormData) {
  const kind = str(f, 'kind');
  await markAllRead(kind === 'broadcasts' ? 'broadcasts' : kind === 'activity' ? 'activity' : 'all');
  ok(str(f, 'returnTo') || '/notifications', 'read');
}

export async function createBroadcastFormAction(f: FormData) {
  let id = '';
  try {
    const when = str(f, 'when');
    if (!when) throw new Error('Choose when it starts.');
    const startsAt = when === 'LATER' ? new Date(`${str(f, 'startsAt')}:00+01:00`) : new Date();
    if (when === 'LATER' && Number.isNaN(startsAt.getTime())) throw new Error('Choose the start date and time.');
    if (!str(f, 'sendEmail')) throw new Error('Choose whether to email it too.');
    id = (await createBroadcast({ category: str(f, 'category'), title: str(f, 'title'), message: str(f, 'message'), audience: str(f, 'audience'), audienceIds: f.getAll('audienceIds').map(String), startsAt, duration: str(f, 'duration'), sendEmail: str(f, 'sendEmail') === 'yes' })).id;
  } catch (err) {
    back('/notifications/broadcasts/new', err, 'Could not create the broadcast.');
  }
  ok(`/notifications/broadcasts/${id}`, 'created');
}

export async function broadcastActionFormAction(f: FormData) {
  const id = str(f, 'broadcastId');
  const action = str(f, 'action');
  const path = `/notifications/broadcasts/${id}`;
  try {
    if (action === 'stop') await stopBroadcast(id);
    else if (action === 'reactivate') await reactivateBroadcast(id, str(f, 'duration'), str(f, 'resendEmail') === 'yes');
    else if (action === 'delete') await deleteBroadcast(id);
    else throw new Error('Unknown action.');
  } catch (err) {
    back(path, err, 'Could not update the broadcast.');
  }
  if (action === 'delete') ok('/notifications/broadcasts?tab=all', 'deleted');
  ok(path, action);
}
