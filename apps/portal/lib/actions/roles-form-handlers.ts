'use server';

import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { grantRolePermission, revokeRolePermission } from './roles';

export async function grantRolePermissionFormAction(formData: FormData): Promise<void> {
  let error = '';
  try { await grantRolePermission(String(formData.get('roleId') ?? ''), String(formData.get('key') ?? '')); } catch (err) { error = friendlyError(err, 'Could not add the permission.', 'roles-form-handlers'); }
  redirect(`/roles${error ? `?error=${encodeURIComponent(error)}` : '?status=saved'}`);
}

export async function revokeRolePermissionFormAction(formData: FormData): Promise<void> {
  let error = '';
  try { await revokeRolePermission(String(formData.get('roleId') ?? ''), String(formData.get('key') ?? '')); } catch (err) { error = friendlyError(err, 'Could not remove the permission.', 'roles-form-handlers'); }
  redirect(`/roles${error ? `?error=${encodeURIComponent(error)}` : '?status=saved'}`);
}
