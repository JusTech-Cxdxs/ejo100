'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { updateCompany } from './company';

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export async function updateCompanyFormAction(formData: FormData) {
  const companyId = str(formData, 'companyId');
  try {
    await updateCompany(companyId, {
      name: str(formData, 'name'),
      legalName: str(formData, 'legalName'),
      website: str(formData, 'website'),
      hotline: str(formData, 'hotline'),
      hqAddress: str(formData, 'hqAddress'),
      pmb: str(formData, 'pmb'),
      rcNumber: str(formData, 'rcNumber'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update company details.';
    redirect(`/company?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/company');
  redirect('/company?status=updated');
}
