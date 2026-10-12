'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@ejo/database';
import { customerAuth } from '@/lib/auth-customer';
import { clientIp, diffFields, writeCustomerAudit } from '@/lib/customer-audit';
import { currentCustomer } from './session';
import { ownNoticeKeys } from './notifications';
import { logCustomerError } from '@/lib/error-events';

/**
 * Customer self-service changes. Every action:
 *  1. re-resolves the signed-in, ACTIVE customer from the session (never
 *     trusts an id sent by the browser for "who");
 *  2. touches only that customer's own rows (addresses are matched on
 *     id AND customerId);
 *  3. validates on the server, answers in plain words;
 *  4. writes the audit trail with before/after (contract 3).
 */

export type ActionState = { ok: boolean; message?: string; error?: string; fieldErrors?: Record<string, string>; at?: number };

const SIGNED_OUT: ActionState = { ok: false, error: 'Your session has ended. Please sign in again.' };
const MAX_EXTRA_ADDRESSES = 5;
const PRIMARY_ADDRESS_MAX = 80;

// Any one field is cut to 2,000 characters before it is cleaned, so an oversized
// post costs nothing; each field's own limit below then gives the friendly error.
const FIELD_CAP = 2000;
const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').slice(0, FIELD_CAP).replace(/\s+/g, ' ').trim();

function checkPhone(v: string, required: boolean): string | null {
  if (!v) return required ? 'Enter your phone number.' : null;
  const digits = v.replace(/\D/g, '');
  if (!/^\+?[0-9][0-9 ()-]*$/.test(v) || digits.length < 7 || digits.length > 15) return 'Enter a valid phone number (digits, spaces, + and - only).';
  return null;
}

async function ip(): Promise<string | null> {
  try { return clientIp(await headers()); } catch { return null; }
}

function done(message: string): ActionState {
  revalidatePath('/customer-portal/dashboard', 'layout');
  return { ok: true, message, at: Date.now() };
}

// ---------------------------------------------------------------- Contact details

export async function updateContactDetails(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await currentCustomer();
  if (!me) return SIGNED_OUT;
  const phone = text(fd, 'phone');
  const altPhone = text(fd, 'altPhone');
  const address = text(fd, 'address');
  const fieldErrors: Record<string, string> = {};
  const pErr = checkPhone(phone, true);
  if (pErr) fieldErrors.phone = pErr;
  const aErr = checkPhone(altPhone, false);
  if (aErr) fieldErrors.altPhone = aErr;
  if (!fieldErrors.altPhone && altPhone && altPhone.replace(/\D/g, '') === phone.replace(/\D/g, '')) fieldErrors.altPhone = 'Your second number is the same as your main number.';
  if (!address) fieldErrors.address = 'Enter your address.';
  else if (address.length > PRIMARY_ADDRESS_MAX) fieldErrors.address = `Keep it to ${PRIMARY_ADDRESS_MAX} characters — add more detail as an extra address below.`;
  if (Object.keys(fieldErrors).length) return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };

  const before = { phone: me.phone, altPhone: me.altPhone, address: me.address };
  const after = { phone, altPhone: altPhone || null, address };
  const changes = diffFields(before, after);
  if (!Object.keys(changes).length) return { ok: true, message: 'Nothing to change — your details are up to date.', at: Date.now() };
  try {
    await prisma.customer.update({ where: { id: me.id }, data: after });
  } catch (err) {
    const ref = await logCustomerError('updateContactDetails', err);
    return { ok: false, error: `We couldn’t save your details just now. Please try again. If it keeps happening, call your branch and quote reference ${ref}.` };
  }
  await writeCustomerAudit({ customerId: me.id, organisationId: me.organisationId, verb: 'profile_updated', changes, ipAddress: await ip() });
  return done('Your contact details are saved.');
}

// ---------------------------------------------------------------- Extra addresses

type AddressInput = { label: string | null; line1: string; line2: string | null; city: string | null; state: string | null; country: string | null };

function readAddress(fd: FormData): { value?: AddressInput; fieldErrors?: Record<string, string> } {
  const v: AddressInput = {
    label: text(fd, 'label') || null,
    line1: text(fd, 'line1'),
    line2: text(fd, 'line2') || null,
    city: text(fd, 'city') || null,
    state: text(fd, 'state') || null,
    country: text(fd, 'country') || null,
  };
  const e: Record<string, string> = {};
  if (!v.line1) e.line1 = 'Enter the street address.';
  else if (v.line1.length > 120) e.line1 = 'Keep it to 120 characters.';
  if (v.label && v.label.length > 40) e.label = 'Keep the label short (40 characters).';
  if (v.line2 && v.line2.length > 120) e.line2 = 'Keep it to 120 characters.';
  for (const k of ['city', 'state', 'country'] as const) if (v[k] && v[k]!.length > 60) e[k] = 'Keep it to 60 characters.';
  return Object.keys(e).length ? { fieldErrors: e } : { value: v };
}

export async function addAddress(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await currentCustomer();
  if (!me) return SIGNED_OUT;
  const { value, fieldErrors } = readAddress(fd);
  if (!value) return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };
  const count = await prisma.customerAddress.count({ where: { customerId: me.id } });
  if (count >= MAX_EXTRA_ADDRESSES) return { ok: false, error: `You can keep up to ${MAX_EXTRA_ADDRESSES} extra addresses. Remove one to add another.` };
  let id: string;
  try {
    id = (await prisma.customerAddress.create({ data: { ...value, customerId: me.id }, select: { id: true } })).id;
  } catch (err) {
    const ref = await logCustomerError('addAddress', err);
    return { ok: false, error: `We couldn’t add that address just now. Please try again. If it keeps happening, call your branch and quote reference ${ref}.` };
  }
  await writeCustomerAudit({
    customerId: me.id, organisationId: me.organisationId, verb: 'address_added', ipAddress: await ip(),
    details: { addressId: id }, changes: diffFields({ label: null, line1: null, line2: null, city: null, state: null, country: null }, value),
  });
  return done('Address added.');
}

export async function updateAddress(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await currentCustomer();
  if (!me) return SIGNED_OUT;
  const id = text(fd, 'id');
  const existing = id ? await prisma.customerAddress.findFirst({ where: { id, customerId: me.id }, select: { label: true, line1: true, line2: true, city: true, state: true, country: true } }) : null;
  if (!existing) return { ok: false, error: 'That address isn’t on your account any more. Refresh the page and try again.' };
  const { value, fieldErrors } = readAddress(fd);
  if (!value) return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };
  const changes = diffFields(existing, value);
  if (!Object.keys(changes).length) return { ok: true, message: 'Nothing to change.', at: Date.now() };
  const res = await prisma.customerAddress.updateMany({ where: { id, customerId: me.id }, data: value });
  if (res.count !== 1) return { ok: false, error: 'We couldn’t save that address. Please try again.' };
  await writeCustomerAudit({ customerId: me.id, organisationId: me.organisationId, verb: 'address_updated', details: { addressId: id }, changes, ipAddress: await ip() });
  return done('Address updated.');
}

export async function removeAddress(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await currentCustomer();
  if (!me) return SIGNED_OUT;
  const id = text(fd, 'id');
  const existing = id ? await prisma.customerAddress.findFirst({ where: { id, customerId: me.id }, select: { label: true, line1: true, line2: true, city: true, state: true, country: true } }) : null;
  if (!existing) return { ok: false, error: 'That address was already removed.' };
  const res = await prisma.customerAddress.deleteMany({ where: { id, customerId: me.id } });
  if (res.count !== 1) return { ok: false, error: 'We couldn’t remove that address. Please try again.' };
  await writeCustomerAudit({
    customerId: me.id, organisationId: me.organisationId, verb: 'address_removed', details: { addressId: id }, ipAddress: await ip(),
    changes: diffFields(existing, { label: null, line1: null, line2: null, city: null, state: null, country: null }),
  });
  return done('Address removed.');
}

// ---------------------------------------------------------------- Preferences

export async function updateEmailPreference(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await currentCustomer();
  if (!me) return SIGNED_OUT;
  const notifyByEmail = fd.get('notifyByEmail') === 'on' || fd.get('notifyByEmail') === 'true';
  if (notifyByEmail === me.notifyByEmail) return { ok: true, message: 'Saved.', at: Date.now() };
  await prisma.customer.update({ where: { id: me.id }, data: { notifyByEmail } });
  await writeCustomerAudit({ customerId: me.id, organisationId: me.organisationId, verb: 'preferences_updated', changes: { notifyByEmail: { from: me.notifyByEmail, to: notifyByEmail } }, ipAddress: await ip() });
  return done(notifyByEmail ? 'You’ll get announcements by email too.' : 'Announcement emails are off. Emails about your own vehicle still come, and you’ll see everything here.');
}

// ---------------------------------------------------------------- Password

function strongEnough(pw: string): boolean {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score += 1;
  if (pw.length < 8 || /^(password|12345678|qwerty)/i.test(pw)) score = Math.min(score, 1);
  return score >= 2;
}

export async function changePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const me = await currentCustomer();
  if (!me) return SIGNED_OUT;
  const currentPassword = String(fd.get('currentPassword') ?? '').slice(0, FIELD_CAP);
  const newPassword = String(fd.get('newPassword') ?? '').slice(0, FIELD_CAP);
  const confirmPassword = String(fd.get('confirmPassword') ?? '').slice(0, FIELD_CAP);
  const fieldErrors: Record<string, string> = {};
  if (!currentPassword) fieldErrors.currentPassword = 'Enter your current password.';
  if (newPassword.length < 8) fieldErrors.newPassword = 'Use at least 8 characters.';
  else if (newPassword.length > 128) fieldErrors.newPassword = 'Use 128 characters at most.';
  else if (!strongEnough(newPassword)) fieldErrors.newPassword = 'Choose a stronger password — longer, with a mix of letters, numbers and a symbol.';
  else if (newPassword === currentPassword) fieldErrors.newPassword = 'Your new password must be different from the current one.';
  if (!fieldErrors.newPassword && newPassword !== confirmPassword) fieldErrors.confirmPassword = 'The two new passwords don’t match.';
  if (Object.keys(fieldErrors).length) return { ok: false, error: 'Please check the highlighted fields.', fieldErrors };

  try {
    const h = await headers();
    // Keep THIS session (revoking inside changePassword issues a new cookie a
    // server action can't set, which signed the customer out — E2E-12), then
    // end every other device's session.
    await customerAuth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: false }, headers: h });
    await customerAuth.api.revokeOtherSessions({ headers: h });
  } catch (e) {
    const err = e as { status?: string | number; statusCode?: number; body?: { code?: string } };
    const code = err.body?.code ?? '';
    if (code === 'INVALID_PASSWORD') return { ok: false, error: 'Your current password isn’t right.', fieldErrors: { currentPassword: 'This doesn’t match your current password.' } };
    if (err.statusCode === 429 || err.status === 429 || err.status === 'TOO_MANY_REQUESTS') return { ok: false, error: 'Too many attempts. Please wait a minute, then try again.' };
    if (code === 'CREDENTIAL_ACCOUNT_NOT_FOUND') return { ok: false, error: 'Your account has no password yet. Use “Forgot password?” on the sign-in page to set one.' };
    if (code === 'PASSWORD_TOO_SHORT') return { ok: false, error: 'Use at least 8 characters.' };
    const ref = await logCustomerError('changePassword', e);
    return { ok: false, error: `We couldn’t change your password just now. Please try again. If it keeps happening, call your branch and quote reference ${ref}.` };
  }
  await writeCustomerAudit({ customerId: me.id, organisationId: me.organisationId, verb: 'password_changed', details: { otherSessionsSignedOut: true }, ipAddress: await ip() });
  return { ok: true, message: 'Your password is changed. Other devices have been signed out.', at: Date.now() };
}

// ---------------------------------------------------------------- Notifications

const KEY_RE = /^(bc:[A-Za-z0-9_-]{1,64}|(jc|vs|pay|wty):[A-Za-z0-9_-]{1,64}:[a-z_]{1,32})$/;

/** Mark one notification read — only a key that is really in this customer's own feed. */
export async function markNoticeRead(key: string): Promise<{ ok: boolean }> {
  const me = await currentCustomer();
  if (!me || typeof key !== 'string' || !KEY_RE.test(key)) return { ok: false };
  const own = await ownNoticeKeys(me);
  if (!own.has(key)) return { ok: true };
  await prisma.customerNotificationRead.upsert({
    where: { customerId_key: { customerId: me.id, key } },
    create: { customerId: me.id, key },
    update: {},
  });
  revalidatePath('/customer-portal/dashboard', 'layout');
  return { ok: true };
}

export async function markAllNoticesRead(): Promise<{ ok: boolean; count: number }> {
  const me = await currentCustomer();
  if (!me) return { ok: false, count: 0 };
  const own = [...(await ownNoticeKeys(me))];
  if (own.length) {
    await prisma.customerNotificationRead.createMany({ data: own.map((key) => ({ customerId: me.id, key })), skipDuplicates: true });
  }
  revalidatePath('/customer-portal/dashboard', 'layout');
  return { ok: true, count: own.length };
}
