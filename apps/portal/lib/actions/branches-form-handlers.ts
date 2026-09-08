'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { updateBranch } from './branches';

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function strList(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function updateBranchFormAction(formData: FormData) {
  const branchId = str(formData, 'branchId');
  try {
    await updateBranch(branchId, {
      name: str(formData, 'name'),
      code: str(formData, 'code'),
      address: str(formData, 'address'),
      hotlines: strList(formData, 'hotlines'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update branch details.';
    redirect(`/branches/${branchId}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/branches/${branchId}`);
  revalidatePath('/branches');
  redirect(`/branches/${branchId}?status=updated`);
}
