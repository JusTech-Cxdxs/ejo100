'use server';

import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { assignRole, removeRole } from './users-admin';

function back(formData: FormData, error: string) {
  const q = String(formData.get('q') ?? '');
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set(error ? 'error' : 'status', error || 'saved');
  redirect(`/users?${params.toString()}`);
}

export async function assignRoleFormAction(formData: FormData): Promise<void> {
  let error = '';
  try { await assignRole(String(formData.get('userId') ?? ''), String(formData.get('roleId') ?? '')); } catch (err) { error = friendlyError(err, 'Could not give the role.', 'users-admin-form-handlers'); }
  back(formData, error);
}

export async function removeRoleFormAction(formData: FormData): Promise<void> {
  let error = '';
  try { await removeRole(String(formData.get('userId') ?? ''), String(formData.get('roleId') ?? '')); } catch (err) { error = friendlyError(err, 'Could not remove the role.', 'users-admin-form-handlers'); }
  back(formData, error);
}
