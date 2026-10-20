'use server';

import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { assignRole, removeRole, createStaffMember, setStaffActive, resendWelcomeEmail, assignMissingEmployeeIds, deleteStaffPermanently } from './users-admin';

function back(formData: FormData, error: string, status = 'saved') {
  const q = String(formData.get('q') ?? '');
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set(error ? 'error' : 'status', error || status);
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
  let employeeId = '';
  try {
    const r = await createStaffMember({ fullName: v('fullName'), email: v('email'), phone: v('phone') || undefined, branchId: v('branchId'), departmentId: v('departmentId') || undefined, roleId: v('roleId') || undefined });
    sent = r.emailSent;
    employeeId = r.employeeId;
  } catch (err) {
    error = friendlyError(err, 'Could not add the person.', 'users-admin-form-handlers');
  }
  if (error) back(formData, error);
  redirect(`/users?q=${encodeURIComponent(v('email'))}&status=${sent ? 'added' : 'added_no_email'}&id=${encodeURIComponent(employeeId)}`);
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

export async function resendWelcomeFormAction(formData: FormData): Promise<void> {
  let error = '';
  let sent = false;
  try { sent = await resendWelcomeEmail(String(formData.get('userId') ?? '')); } catch (err) { error = friendlyError(err, 'Could not send the welcome email.', 'users-admin-form-handlers'); }
  back(formData, error, sent ? 'welcome_sent' : 'welcome_failed');
}

export async function assignMissingEmployeeIdsFormAction(formData: FormData): Promise<void> {
  let error = '';
  let n = 0;
  try { n = await assignMissingEmployeeIds(); } catch (err) { error = friendlyError(err, 'Could not issue the employee IDs.', 'users-admin-form-handlers'); }
  back(formData, error, `ids_${n}`);
}

export type AddStaffState = { error: string | null; values: Record<string, string> };

/** The Add-staff form keeps what was typed when something is wrong (useActionState). */
export async function addStaffMemberAction(_prev: AddStaffState, formData: FormData): Promise<AddStaffState> {
  const v = (k: string) => String(formData.get(k) ?? '').trim();
  const values = { fullName: v('fullName'), email: v('email'), phone: v('phone'), branchId: v('branchId'), departmentId: v('departmentId'), roleId: v('roleId') };
  let sent = true;
  let employeeId = '';
  try {
    const r = await createStaffMember({ fullName: values.fullName, email: values.email, phone: values.phone || undefined, branchId: v('branchId'), departmentId: v('departmentId') || undefined, roleId: v('roleId') || undefined });
    sent = r.emailSent;
    employeeId = r.employeeId;
  } catch (err) {
    return { error: friendlyError(err, 'Could not add the person.', 'users-admin-form-handlers'), values };
  }
  redirect(`/users?q=${encodeURIComponent(values.email.toLowerCase())}&status=${sent ? 'added' : 'added_no_email'}&id=${encodeURIComponent(employeeId)}`);
}

export async function deleteStaffFormAction(formData: FormData): Promise<void> {
  let error = '';
  try {
    await deleteStaffPermanently(String(formData.get('userId') ?? ''), String(formData.get('confirmEmail') ?? ''));
  } catch (err) {
    error = friendlyError(err, 'Could not delete the account.', 'users-admin-form-handlers');
  }
  back(formData, error, 'deleted');
}
