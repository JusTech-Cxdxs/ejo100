'use server';

import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { assignRole, removeRole, createStaffMember, setStaffActive } from './users-admin';

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

export async function createStaffMemberFormAction(formData: FormData): Promise<void> {
  const v = (k: string) => String(formData.get(k) ?? '').trim();
  let error = '';
  let sent = true;
  try {
    const r = await createStaffMember({ fullName: v('fullName'), email: v('email'), employeeId: v('employeeId') || undefined, phone: v('phone') || undefined, branchId: v('branchId'), departmentId: v('departmentId') || undefined, roleId: v('roleId') || undefined });
    sent = r.emailSent;
  } catch (err) {
    error = friendlyError(err, 'Could not add the person.', 'users-admin-form-handlers');
  }
  if (error) back(formData, error);
  redirect(`/users?q=${encodeURIComponent(v('email'))}&status=${sent ? 'added' : 'added_no_email'}`);
}

export async function setStaffActiveFormAction(formData: FormData): Promise<void> {
  let error = '';
  try {
    await setStaffActive(String(formData.get('userId') ?? ''), formData.get('active') === 'true', String(formData.get('reason') ?? ''));
  } catch (err) {
    error = friendlyError(err, 'Could not change the account.', 'users-admin-form-handlers');
  }
  back(formData, error);
}
