'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  addBomLine, addCheckTemplate, createConfiguration, createProduct, createSoftwarePackage, moveCheckTemplate, removeBomLine, removeConfigurationPackage,
  retireCheckTemplate, setConfigurationPackage, setProductActive, setSoftwarePackageActive, updateConfiguration, updateProduct, type ProductInput,
} from './catalogue';

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}
const flag = (formData: FormData, key: string): boolean => ['on', 'true', '1', 'yes'].includes(str(formData, key).toLowerCase());

function fail(path: string, err: unknown, fallback: string): never {
  const message = friendlyError(err, fallback, 'catalogue-form-handlers');
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}

function done(path: string, status: string, revalidate: string[] = []): never {
  for (const p of [path.split('?')[0]!, ...revalidate]) revalidatePath(p);
  redirect(`${path}${path.includes('?') ? '&' : '?'}status=${status}`);
}

function productInput(formData: FormData): ProductInput {
  return {
    sku: str(formData, 'sku'), name: str(formData, 'name'), family: str(formData, 'family'), subBrand: str(formData, 'subBrand'), source: str(formData, 'source'),
    description: str(formData, 'description'), baseUnitOfMeasure: str(formData, 'baseUnitOfMeasure'), serialised: flag(formData, 'serialised'),
    defaultWarrantyMonths: Number(str(formData, 'defaultWarrantyMonths') || '12'), warrantyPolicyId: str(formData, 'warrantyPolicyId') || null, specsText: str(formData, 'specsText'),
    imageUrl: str(formData, 'imageUrl') || null,
  };
}

export async function createProductFormAction(formData: FormData) {
  let id = '';
  try { id = (await createProduct(productInput(formData))).id; } catch (err) { fail('/catalogue/products/new', err, 'Could not add the product.'); }
  done(`/catalogue/products/${id}`, 'product_created', ['/catalogue/products', '/catalogue']);
}

export async function updateProductFormAction(formData: FormData) {
  const productId = str(formData, 'productId');
  try { await updateProduct(productId, productInput(formData)); } catch (err) { fail(`/catalogue/products/${productId}?edit=1`, err, 'Could not save the product.'); }
  done(`/catalogue/products/${productId}`, 'product_updated', ['/catalogue/products']);
}

export async function setProductActiveFormAction(formData: FormData) {
  const productId = str(formData, 'productId');
  const active = flag(formData, 'active');
  try { await setProductActive(productId, active); } catch (err) { fail(`/catalogue/products/${productId}`, err, 'Could not change the product.'); }
  done(`/catalogue/products/${productId}`, active ? 'product_restored' : 'product_archived', ['/catalogue/products', '/catalogue']);
}

export async function createConfigurationFormAction(formData: FormData) {
  const productId = str(formData, 'productId');
  let id = '';
  try {
    id = (await createConfiguration(productId, { code: str(formData, 'code'), name: str(formData, 'name'), specsText: str(formData, 'specsText'), isDefault: flag(formData, 'isDefault') })).id;
  } catch (err) { fail(`/catalogue/products/${productId}`, err, 'Could not add the configuration.'); }
  done(`/catalogue/products/${productId}/configurations/${id}`, 'configuration_created', [`/catalogue/products/${productId}`]);
}

export async function updateConfigurationFormAction(formData: FormData) {
  const productId = str(formData, 'productId');
  const configurationId = str(formData, 'configurationId');
  const back = `/catalogue/products/${productId}/configurations/${configurationId}`;
  try {
    await updateConfiguration(configurationId, { code: str(formData, 'code'), name: str(formData, 'name'), specsText: str(formData, 'specsText'), isDefault: flag(formData, 'isDefault'), isActive: !flag(formData, 'retire') });
  } catch (err) { fail(`${back}?edit=1`, err, 'Could not save the configuration.'); }
  done(back, 'configuration_updated', [`/catalogue/products/${productId}`]);
}

export async function addBomLineFormAction(formData: FormData) {
  const productId = str(formData, 'productId');
  const configurationId = str(formData, 'configurationId');
  const back = `/catalogue/products/${productId}/configurations/${configurationId}`;
  try {
    await addBomLine(configurationId, { partId: str(formData, 'partId'), quantity: Number(str(formData, 'quantity')), station: str(formData, 'station') || 'ASSEMBLY', isOptional: flag(formData, 'isOptional'), notes: str(formData, 'notes') });
  } catch (err) { fail(back, err, 'Could not add the part to the bill of materials.'); }
  done(back, 'bom_line_added', [`/catalogue/products/${productId}`]);
}

export async function removeBomLineFormAction(formData: FormData) {
  const productId = str(formData, 'productId');
  const configurationId = str(formData, 'configurationId');
  const back = `/catalogue/products/${productId}/configurations/${configurationId}`;
  try { await removeBomLine(configurationId, str(formData, 'partId')); } catch (err) { fail(back, err, 'Could not remove the line.'); }
  done(back, 'bom_line_removed', [`/catalogue/products/${productId}`]);
}

export async function setConfigurationPackageFormAction(formData: FormData) {
  const productId = str(formData, 'productId');
  const configurationId = str(formData, 'configurationId');
  const back = `/catalogue/products/${productId}/configurations/${configurationId}`;
  try { await setConfigurationPackage(configurationId, str(formData, 'packageId'), !flag(formData, 'optional')); } catch (err) { fail(back, err, 'Could not add the software package.'); }
  done(back, 'package_set', [`/catalogue/products/${productId}`]);
}

export async function removeConfigurationPackageFormAction(formData: FormData) {
  const productId = str(formData, 'productId');
  const configurationId = str(formData, 'configurationId');
  const back = `/catalogue/products/${productId}/configurations/${configurationId}`;
  try { await removeConfigurationPackage(configurationId, str(formData, 'packageId')); } catch (err) { fail(back, err, 'Could not remove the software package.'); }
  done(back, 'package_removed', [`/catalogue/products/${productId}`]);
}

export async function createSoftwarePackageFormAction(formData: FormData) {
  try {
    await createSoftwarePackage({ name: str(formData, 'name'), version: str(formData, 'version'), kind: str(formData, 'kind') || 'APPLICATION', licenceRequired: flag(formData, 'licenceRequired') });
  } catch (err) { fail('/catalogue/software', err, 'Could not add the software package.'); }
  done('/catalogue/software', 'software_created', ['/catalogue']);
}

export async function setSoftwarePackageActiveFormAction(formData: FormData) {
  const active = flag(formData, 'active');
  try { await setSoftwarePackageActive(str(formData, 'packageId'), active); } catch (err) { fail('/catalogue/software', err, 'Could not change the software package.'); }
  done('/catalogue/software', active ? 'software_restored' : 'software_retired', ['/catalogue']);
}

export async function addCheckTemplateFormAction(formData: FormData) {
  const stage = str(formData, 'stage');
  try { await addCheckTemplate({ stage, family: str(formData, 'family') || null, item: str(formData, 'item') }); } catch (err) { fail(`/catalogue/checklists?stage=${encodeURIComponent(stage)}`, err, 'Could not add the check item.'); }
  done(`/catalogue/checklists?stage=${encodeURIComponent(stage)}`, 'check_added');
}

export async function moveCheckTemplateFormAction(formData: FormData) {
  const stage = str(formData, 'stage');
  const direction = str(formData, 'direction') === 'up' ? 'up' : 'down';
  try { await moveCheckTemplate(str(formData, 'templateId'), direction); } catch (err) { fail(`/catalogue/checklists?stage=${encodeURIComponent(stage)}`, err, 'Could not move the check item.'); }
  done(`/catalogue/checklists?stage=${encodeURIComponent(stage)}`, 'check_moved');
}

export async function retireCheckTemplateFormAction(formData: FormData) {
  const stage = str(formData, 'stage');
  try { await retireCheckTemplate(str(formData, 'templateId')); } catch (err) { fail(`/catalogue/checklists?stage=${encodeURIComponent(stage)}`, err, 'Could not retire the check item.'); }
  done(`/catalogue/checklists?stage=${encodeURIComponent(stage)}`, 'check_retired');
}
