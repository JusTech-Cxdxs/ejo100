'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { friendlyError } from '@/lib/errors';
import { findOrCreateCustomer } from './workshop';
import {
  updateCustomer, setCustomerPortalAccess, sendCustomerSetPasswordLink, addCustomerAddress, updateCustomerAddress, removeCustomerAddress,
  addCustomerContact, updateCustomerContact, removeCustomerContact, addCustomerNote, setCustomerNotePinned, deleteCustomerNote,
} from './crm';

/** <form action> wrappers for the Customers (CRM) pages. */

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const page = (id: string) => `/crm/customers/${encodeURIComponent(id)}`;

function back(path: string, err: unknown, fallback: string): never {
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(friendlyError(err, fallback, 'crm-form-handlers'))}`);
}
function done(path: string, status: string): never {
  revalidatePath(path.split('?')[0]!);
  redirect(`${path}${path.includes('?') ? '&' : '?'}status=${status}`);
}

export type CustomerFormState = { error: string | null; values: Record<string, string> };

/** Register a customer — what was typed stays when something is wrong. */
export async function registerCustomerAction(_prev: CustomerFormState, f: FormData): Promise<CustomerFormState> {
  const values = { customerType: str(f, 'customerType'), fullName: str(f, 'fullName'), email: str(f, 'email'), phone: str(f, 'phone'), altPhone: str(f, 'altPhone'), address: str(f, 'address'), tags: str(f, 'tags') };
  let target = '';
  try {
    const r = await findOrCreateCustomer({
      customerType: values.customerType === 'ORGANIZATION' ? 'ORGANIZATION' : 'INDIVIDUAL',
      fullName: values.fullName, email: values.email, phone: values.phone, altPhone: values.altPhone || undefined, address: values.address,
      tags: values.tags ? values.tags.split(',') : [],
    });
    target = `${page(r.customer.id)}?status=${r.wasExisting ? 'existing' : r.welcomeEmailSent ? 'registered' : 'registered_no_email'}`;
  } catch (err) {
    return { error: friendlyError(err, 'Could not register the customer.', 'crm-form-handlers'), values };
  }
  revalidatePath('/crm');
  redirect(target);
}

/** Edit a customer — what was typed stays when something is wrong. */
export async function updateCustomerAction(_prev: CustomerFormState, f: FormData): Promise<CustomerFormState> {
  const id = str(f, 'customerId');
  const values = { fullName: str(f, 'fullName'), customerType: str(f, 'customerType'), email: str(f, 'email'), phone: str(f, 'phone'), altPhone: str(f, 'altPhone'), address: str(f, 'address'), tags: str(f, 'tags'), notifyByEmail: str(f, 'notifyByEmail'), companyName: str(f, 'companyName'), taxId: str(f, 'taxId') };
  let changed = 0;
  try {
    changed = (await updateCustomer({
      customerId: id, fullName: values.fullName, customerType: values.customerType === 'ORGANIZATION' ? 'ORGANIZATION' : 'INDIVIDUAL', email: values.email,
      phone: values.phone, altPhone: values.altPhone, address: values.address, tags: values.tags, notifyByEmail: values.notifyByEmail === 'yes',
      companyName: values.companyName, taxId: values.taxId,
    })).changed;
  } catch (err) {
    return { error: friendlyError(err, 'Could not save the changes.', 'crm-form-handlers'), values };
  }
  revalidatePath(page(id));
  redirect(`${page(id)}?status=${changed ? 'saved' : 'unchanged'}`);
}

export async function setCustomerPortalAccessFormAction(f: FormData) {
  const id = str(f, 'customerId');
  const active = str(f, 'active') === 'true';
  try {
    await setCustomerPortalAccess(id, active, str(f, 'reason'));
  } catch (err) {
    back(page(id), err, 'Could not change their portal access.');
  }
  done(page(id), active ? 'access_on' : 'access_off');
}

export async function sendCustomerSetPasswordLinkFormAction(f: FormData) {
  const id = str(f, 'customerId');
  let status = 'link_sent';
  try {
    const r = await sendCustomerSetPasswordLink(id);
    if (!r.sent) status = 'link_failed';
  } catch (err) {
    back(page(id), err, 'Could not send the link.');
  }
  done(page(id), status);
}

const addressOf = (f: FormData) => ({ label: str(f, 'label'), line1: str(f, 'line1'), line2: str(f, 'line2'), city: str(f, 'city'), state: str(f, 'state'), country: str(f, 'country') });
const contactOf = (f: FormData) => ({ name: str(f, 'name'), role: str(f, 'role'), phone: str(f, 'phone'), email: str(f, 'email') });

export async function customerAddressFormAction(f: FormData) {
  const id = str(f, 'customerId');
  const op = str(f, 'op');
  const path = `${page(id)}?tab=contacts`;
  try {
    if (op === 'add') await addCustomerAddress(id, addressOf(f));
    else if (op === 'update') await updateCustomerAddress(str(f, 'addressId'), addressOf(f));
    else if (op === 'remove') await removeCustomerAddress(str(f, 'addressId'));
    else throw new Error('Unknown action.');
  } catch (err) {
    back(path, err, 'Could not save the address.');
  }
  done(path, `address_${op}`);
}

export async function customerContactFormAction(f: FormData) {
  const id = str(f, 'customerId');
  const op = str(f, 'op');
  const path = `${page(id)}?tab=contacts`;
  try {
    if (op === 'add') await addCustomerContact(id, contactOf(f));
    else if (op === 'update') await updateCustomerContact(str(f, 'contactId'), contactOf(f));
    else if (op === 'remove') await removeCustomerContact(str(f, 'contactId'));
    else throw new Error('Unknown action.');
  } catch (err) {
    back(path, err, 'Could not save the contact person.');
  }
  done(path, `contact_${op}`);
}

export async function customerNoteFormAction(f: FormData) {
  const id = str(f, 'customerId');
  const op = str(f, 'op');
  const path = `${page(id)}?tab=notes`;
  try {
    if (op === 'add') await addCustomerNote(id, String(f.get('body') ?? ''), str(f, 'pinned') === 'yes');
    else if (op === 'pin' || op === 'unpin') await setCustomerNotePinned(str(f, 'noteId'), op === 'pin');
    else if (op === 'delete') await deleteCustomerNote(str(f, 'noteId'));
    else throw new Error('Unknown action.');
  } catch (err) {
    back(path, err, 'Could not save the note.');
  }
  done(path, `note_${op}`);
}
