'use server';

import { friendlyError } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAnnouncement, deactivateAnnouncement } from './dashboard';

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function createAnnouncementFormAction(formData: FormData) {
  const message = str(formData, 'message');
  const expiresAtRaw = str(formData, 'expiresAt');
  try {
    await createAnnouncement(message, expiresAtRaw ? new Date(expiresAtRaw) : null);
  } catch (err) {
    const message = friendlyError(err, 'Could not post this announcement.', 'dashboard-form-handlers');
    redirect(`/dashboard?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/dashboard');
  redirect('/dashboard?status=announcement_posted');
}

export async function deactivateAnnouncementFormAction(formData: FormData) {
  const announcementId = str(formData, 'announcementId');
  try {
    await deactivateAnnouncement(announcementId);
  } catch (err) {
    const message = friendlyError(err, 'Could not remove this announcement.', 'dashboard-form-handlers');
    redirect(`/dashboard?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/dashboard');
}
