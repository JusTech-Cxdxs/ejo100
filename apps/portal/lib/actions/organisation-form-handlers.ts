'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { updateOrganisation } from './organisation';

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

export async function updateOrganisationFormAction(formData: FormData) {
  const organisationId = str(formData, 'organisationId');
  try {
    await updateOrganisation(organisationId, {
      name: str(formData, 'name'),
      legalName: str(formData, 'legalName'),
      website: str(formData, 'website'),
      email: str(formData, 'email'),
      hotlines: strList(formData, 'hotlines'),
      hqAddress: str(formData, 'hqAddress'),
      poBox: str(formData, 'poBox'),
      rcNumber: str(formData, 'rcNumber'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not update organisation details.';
    redirect(`/organisation?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/organisation');
  redirect('/organisation?status=updated');
}
