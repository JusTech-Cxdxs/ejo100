'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { binHref, isBinEntity, type BinEntity } from '@/lib/recycle-bin/rules';
import { moveToRecycleBin, purgeExpiredRecycleBinItems, purgeRecycleBinItems, restoreFromRecycleBin } from './recycle-bin';

/** <form action> wrappers for the Recycle bin. */

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

const LIST: Record<BinEntity, string> = {
  JobCard: '/workshop/job-cards',
  VehicleService: '/workshop/vehicle-service',
  Customer: '/crm',
  CustomerVehicle: '/workshop/vehicles',
  Part: '/inventory/parts',
  Supplier: '/inventory/suppliers',
};

export async function moveToRecycleBinFormAction(formData: FormData) {
  const entity = str(formData, 'entity');
  const id = str(formData, 'id');
  if (!isBinEntity(entity)) redirect('/dashboard');
  let reference = '';
  try {
    reference = (await moveToRecycleBin(entity, id, str(formData, 'reason'))).reference;
  } catch (err) {
    const message = friendlyError(err, 'Could not move this to the Recycle bin.', 'recycle-bin-form-handlers');
    redirect(`${binHref(entity, id)}?error=${encodeURIComponent(message)}`);
  }
  revalidatePath(LIST[entity]);
  revalidatePath('/recycle-bin');
  redirect(`${LIST[entity]}?binned=${encodeURIComponent(reference)}`);
}

export async function restoreFromRecycleBinFormAction(formData: FormData) {
  const itemId = str(formData, 'itemId');
  let target = '/recycle-bin';
  try {
    const res = await restoreFromRecycleBin(itemId);
    const p = new URLSearchParams({ restored: res.reference, entity: res.entity, rid: res.entityId });
    if (res.changed) p.set('was', res.originalReference);
    if (res.notes.length) p.set('notes', res.notes.join('\n'));
    target = `/recycle-bin?${p.toString()}`;
    revalidatePath(LIST[res.entity]);
  } catch (err) {
    const message = friendlyError(err, 'Could not restore this item.', 'recycle-bin-form-handlers');
    redirect(`/recycle-bin?error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/recycle-bin');
  redirect(target);
}

export async function purgeSelectedFormAction(formData: FormData) {
  let n = 0;
  try {
    n = await purgeRecycleBinItems(formData.getAll('ids').map(String));
  } catch (err) {
    const message = friendlyError(err, 'Could not remove these items.', 'recycle-bin-form-handlers');
    redirect(`/recycle-bin?state=expired&error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/recycle-bin');
  redirect(`/recycle-bin?state=purged&purged=${n}`);
}

export async function purgeExpiredFormAction() {
  let n = 0;
  try {
    n = await purgeExpiredRecycleBinItems();
  } catch (err) {
    const message = friendlyError(err, 'Could not remove the expired items.', 'recycle-bin-form-handlers');
    redirect(`/recycle-bin?state=expired&error=${encodeURIComponent(message)}`);
  }
  revalidatePath('/recycle-bin');
  redirect(`/recycle-bin?state=purged&purged=${n}`);
}
