import { randomBytes } from 'node:crypto';
import { prisma } from '@ejo/database';
import { hashPassword } from 'better-auth/crypto';
import { sendEmail } from '@/lib/email';
import { redact } from '@/lib/errors';
import { writeAuditLog, getWorkshopBranchId } from '@/lib/workshop-core';
import { renderCustomerWelcomeEmail } from '@/lib/email-templates/customer-welcome';

/**
 * Server-only (NOT a 'use server' file): customer portal access — the
 * one-time set-password link and the welcome / access email.
 *
 * Contract (shared with the website): the link is redeemed at
 * `${NEXT_PUBLIC_WEBSITE_URL}/customer-portal/reset-password?token=<token>`;
 * the row lives in customer_verifications with identifier
 * `reset-password:<token>` and value = the customer id. Issuing a new link
 * withdraws every earlier one for that customer. No password is ever emailed.
 */

export const CUSTOMER_SET_PASSWORD_HOURS = 72;

export function websiteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://ejo100-website.vercel.app').replace(/\/+$/, '');
}

/** A new one-time set-password link for a customer (72 hours by default). */
export async function issueCustomerSetPasswordLink(customerId: string, hours = CUSTOMER_SET_PASSWORD_HOURS): Promise<string> {
  // Only the newest link works.
  await prisma.customerVerification.deleteMany({ where: { value: customerId, identifier: { startsWith: 'reset-password:' } } });
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  // Written with a plain statement on purpose: the data journal records every
  // ORM write with its values, and this row's identifier IS the one-time
  // token — it must never land in the audit trail.
  await prisma.$executeRaw`INSERT INTO customer_verifications (id, identifier, value, "expiresAt", "createdAt", "updatedAt")
    VALUES (${`cv_${randomBytes(12).toString('hex')}`}, ${`reset-password:${token}`}, ${customerId}, ${new Date(now.getTime() + hours * 3600_000)}, ${now}, ${now})`;
  return `${websiteBaseUrl()}/customer-portal/reset-password?token=${encodeURIComponent(token)}`;
}

/** Withdraw every unused set-password link (e.g. when access is switched off). */
export async function withdrawCustomerSetPasswordLinks(customerId: string): Promise<void> {
  await prisma.customerVerification.deleteMany({ where: { value: customerId, identifier: { startsWith: 'reset-password:' } } });
}

/** The credential row the auth library signs in against. Created with a random,
 * unusable password until the customer chooses their own through the link. */
async function ensureCredentialAccount(customerId: string): Promise<void> {
  const existing = await prisma.customerAccount.findFirst({ where: { customerId, providerId: 'credential' }, select: { id: true } });
  if (existing) return;
  await prisma.customerAccount.create({
    data: { customerId, accountId: customerId, providerId: 'credential', password: await hashPassword(randomBytes(32).toString('base64url')) },
  }).catch((err: { code?: string }) => {
    // Created by a parallel request a moment ago — fine.
    if (err?.code !== 'P2002') throw err;
  });
}

/** The branch the staff member works from — its name and how customers reach it. */
async function branchDetails() {
  const branchId = await getWorkshopBranchId().catch(() => null);
  if (!branchId) return null;
  return prisma.branch.findUnique({
    where: { id: branchId },
    select: { name: true, address: true, hotlines: true, email: true, businessUnit: { select: { organisation: { select: { name: true } } } } },
  }).catch(() => null);
}

export type CustomerEmailResult = { sent: boolean; reason?: string };

/**
 * The welcome (just registered) or access (link sent again from the CRM)
 * email, with a fresh set-password link. Never throws: the result says
 * whether the mail server accepted it. Always logged (Settings → Email
 * delivery) and written to the customer's activity.
 */
export async function sendCustomerAccessEmail(customerId: string, kind: 'welcome' | 'access', actorId: string | null): Promise<CustomerEmailResult> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, fullName: true, email: true, isActive: true, organisationId: true } }).catch(() => null);
  if (!customer) return { sent: false, reason: 'This customer no longer exists.' };
  if (!customer.isActive) return { sent: false, reason: 'Their portal access is switched off — switch it on first.' };
  const verb = kind === 'welcome' ? 'welcome' : 'set_password_link';
  let error: string | null = null;
  let subject = kind === 'welcome' ? 'Welcome email' : 'Set-password link';
  try {
    await ensureCredentialAccount(customer.id);
    const setPasswordUrl = await issueCustomerSetPasswordLink(customer.id);
    const branch = await branchDetails();
    const website = websiteBaseUrl();
    const companyName = branch?.businessUnit.organisation.name ?? (await prisma.organisation.findUnique({ where: { id: customer.organisationId }, select: { name: true } }))?.name ?? 'Kewalram';
    const rendered = renderCustomerWelcomeEmail({
      kind,
      customerName: customer.fullName,
      email: customer.email,
      setPasswordUrl,
      setPasswordHours: CUSTOMER_SET_PASSWORD_HOURS,
      signInUrl: `${website}/customer-portal`,
      logoUrl: `${website}/images/logo/logo.png`,
      companyName,
      branchName: branch?.name ?? '',
      branchContact: branch ? { address: branch.address, phones: branch.hotlines, email: branch.email } : undefined,
    });
    subject = rendered.subject;
    await sendEmail(customer.email, rendered.subject, rendered.html);
  } catch (err) {
    error = redact(err instanceof Error ? err.message : String(err)).slice(0, 300);
    // eslint-disable-next-line no-console
    console.error('Customer access email failed', customer.id, kind, error);
  }
  await prisma.securityEmailLog.create({ data: { entityType: 'Customer', entityId: customer.id, recipient: `${customer.fullName} <${customer.email}>`, subject, sent: !error, error } }).catch(() => undefined);
  await writeAuditLog({
    userId: actorId,
    organisationId: customer.organisationId,
    action: `customer.${verb}_${error ? 'failed' : 'sent'}`,
    entityType: 'Customer',
    entityId: customer.id,
    metadata: { actor: 'staff', to: customer.email, ...(error ? { error: 'The mail server did not accept it' } : {}) },
  });
  return error ? { sent: false, reason: 'The mail server did not accept the email — see Settings → Email delivery for the reason.' } : { sent: true };
}
