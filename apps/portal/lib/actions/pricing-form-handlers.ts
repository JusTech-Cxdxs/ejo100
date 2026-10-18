'use server';
import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createPriceList, setPriceListItem, removePriceListItem, activatePriceList, retirePriceList, publishPriceBroadcast } from './pricing';

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
function num(formData: FormData, key: string): number {
  const n = Number(str(formData, key).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function fail(path: string, err: unknown, fallback: string): never {
  const message = friendlyError(err, fallback, 'pricing-form-handlers');
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}
function done(priceListId: string, status: string): never {
  revalidatePath(`/sales/price-lists/${priceListId}`);
  revalidatePath('/sales/price-lists');
  redirect(`/sales/price-lists/${priceListId}?status=${status}`);
}

/** → /sales/price-lists/<id>?status=created */
export async function createPriceListFormAction(formData: FormData) {
  let id = '';
  try {
    id = (await createPriceList({ name: str(formData, 'name'), channel: str(formData, 'channel'), tier: str(formData, 'tier') || undefined, effectiveFrom: new Date(`${str(formData, 'effectiveFrom') || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })}T00:00:00+01:00`), currency: str(formData, 'currency') || 'NGN' })).id;
  } catch (err) {
    fail('/sales/price-lists/new', err, 'Could not create the price list.');
  }
  done(id, 'created');
}

/** The product picker submits "productId|configurationId". → ?status=item_saved */
export async function setPriceListItemFormAction(formData: FormData) {
  const id = str(formData, 'priceListId');
  const [productId = '', configurationId = ''] = str(formData, 'product').split('|');
  try {
    await setPriceListItem(id, { productId, configurationId: configurationId || null, unitPrice: num(formData, 'unitPrice'), minQuantity: num(formData, 'minQuantity') || 1 });
  } catch (err) {
    fail(`/sales/price-lists/${id}`, err, 'Could not save the price.');
  }
  done(id, 'item_saved');
}

/** → ?status=item_removed */
export async function removePriceListItemFormAction(formData: FormData) {
  const id = str(formData, 'priceListId');
  try {
    await removePriceListItem(id, str(formData, 'itemId'));
  } catch (err) {
    fail(`/sales/price-lists/${id}`, err, 'Could not remove the line.');
  }
  done(id, 'item_removed');
}

/** → ?status=activated */
export async function activatePriceListFormAction(formData: FormData) {
  const id = str(formData, 'priceListId');
  try {
    await activatePriceList(id);
  } catch (err) {
    fail(`/sales/price-lists/${id}`, err, 'Could not activate the price list.');
  }
  done(id, 'activated');
}

/** → ?status=retired */
export async function retirePriceListFormAction(formData: FormData) {
  const id = str(formData, 'priceListId');
  try {
    await retirePriceList(id);
  } catch (err) {
    fail(`/sales/price-lists/${id}`, err, 'Could not retire the price list.');
  }
  done(id, 'retired');
}

/** → ?status=broadcast_published */
export async function publishPriceBroadcastFormAction(formData: FormData) {
  const id = str(formData, 'priceListId');
  try {
    await publishPriceBroadcast(id);
  } catch (err) {
    fail(`/sales/price-lists/${id}`, err, 'Could not publish the dealer prices.');
  }
  done(id, 'broadcast_published');
}
