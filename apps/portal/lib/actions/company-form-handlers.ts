'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { updateCompany } from './company';

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

export async function updateCompanyFormAction(formData: FormData) {
  const companyId = str(formData, 'companyId');
  try {
    await updateCompany(companyId, {
      name: str(formData, 'name'),
      legalName: str(formData, 'legalName'),
      website: str(formData, 'website'),
      hotlines: strList(formData, 'hotlines'),
      hqAddress: str(formData, 'hqAddress'),
      poBox: str(formData, 'poBox'),
      rcNumber: str(formData, 'rcNumber'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update company details.';
    redirect(`/company?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/company');
  redirect('/company?status=updated');
}
