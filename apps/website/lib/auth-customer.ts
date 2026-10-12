import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { after } from 'next/server';
import { prisma } from '@ejo/database';
import { sendEmail, websiteBaseUrl } from './email';
import { renderCustomerPasswordResetEmail } from './email-templates/customer-password-reset';
import { siteConfig } from './site-config';
import { markCustomerActor, writeCustomerAudit } from './customer-audit';

/** "Forgot password" links work for one hour (contract 1). */
const RESET_LINK_SECONDS = 60 * 60;

/**
 * Customer authentication: a separate Better Auth instance from the staff
 * portal's (apps/portal/lib/auth.ts), on the Customer / CustomerSession /
 * CustomerAccount tables. Same database and secret, but a customer session
 * only resolves against Customer, so it cannot authenticate a staff route,
 * and the reverse.
 *
 * `modelName` only changes the table. Better Auth still expects a `userId`
 * foreign key on sessions and accounts and a `name` on the user; our tables
 * use `customerId` and `fullName`, hence the `fields` mappings below. Without
 * them every sign-in fails with Prisma's "Unknown argument 'userId'", shown
 * to the customer as "Invalid email or password".
 */
export const customerAuth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: websiteBaseUrl() || undefined,

  // Map Better Auth's default "user/session/account" models onto our
  // customer-specific tables — modelName for the table, fields for the
  // column names that differ from Better Auth's own defaults.
  user: {
    modelName: 'customer',
    fields: { name: 'fullName' },
  },
  account: {
    modelName: 'customerAccount',
    fields: { userId: 'customerId' },
  },
  // Set-password / reset links live in customer_verifications (contract 1):
  // identifier `reset-password:<token>`, value = the customer's id. The
  // staff `verifications` table is never read or written from here.
  verification: {
    modelName: 'customerVerification',
  },

  // Endpoints this platform never uses are switched off entirely (defence in
  // depth): people never edit their own account record, email or deletion
  // through the auth library — administrators and the app's own pages do.
  disabledPaths: ['/update-user', '/change-email', '/delete-user', '/sign-up/email'],

  emailAndPassword: {
    enabled: true,
    // Customer accounts are opened by the front desk (with a welcome email),
    // never by self-sign-up from the internet.
    disableSignUp: true,
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: RESET_LINK_SECONDS,
    // A reset signs the customer out everywhere else (a stolen session dies).
    revokeSessionsOnPasswordReset: true,
    // Better Auth looks the email up in the CUSTOMERS table only (user model
    // above) and answers every request the same way, account or not. This
    // runs in the background (advanced.backgroundTasks), so the reply takes
    // the same time either way. A switched-off customer gets nothing — the
    // just-created token is removed again — and a new link replaces every
    // earlier one (contract 1).
    sendResetPassword: async ({ user, token }) => {
      const customer = await prisma.customer.findUnique({
        where: { id: user.id },
        select: { id: true, fullName: true, email: true, isActive: true, organisationId: true, organisation: { select: { name: true } } },
      });
      if (!customer || !customer.isActive) {
        await prisma.customerVerification.deleteMany({ where: { identifier: `reset-password:${token}` } });
        return;
      }
      markCustomerActor(customer.organisationId);
      await prisma.customerVerification.deleteMany({
        where: { value: customer.id, identifier: { startsWith: 'reset-password:', not: `reset-password:${token}` } },
      });
      const base = websiteBaseUrl();
      const url = `${base}/customer-portal/reset-password?token=${encodeURIComponent(token)}`;
      const { subject, html } = renderCustomerPasswordResetEmail({
        fullName: customer.fullName,
        email: customer.email,
        url,
        expiresInMinutes: RESET_LINK_SECONDS / 60,
        companyName: customer.organisation?.name || siteConfig.organisationName,
        logoUrl: `${base}/images/logo/email-logo.png`,
      });
      await sendEmail(customer.email, subject, html);
      await writeCustomerAudit({ customerId: customer.id, organisationId: customer.organisationId, verb: 'password_reset_requested' });
    },
    onPasswordReset: async ({ user }) => {
      const c = await prisma.customer.findUnique({ where: { id: user.id }, select: { organisationId: true } });
      if (c) await writeCustomerAudit({ customerId: user.id, organisationId: c.organisationId, verb: 'password_reset' });
    },
  },

  // A customer account switched off by the organisation cannot sign in
  // (and the dashboard re-checks on every visit).
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const c = await prisma.customer.findUnique({ where: { id: session.userId }, select: { isActive: true } });
          return Boolean(c?.isActive);
        },
        // Every sign-in is recorded (contract 3), but not the sessions Better Auth
        // re-issues itself (e.g. after a password change).
        after: async (session, ctx) => {
          if (!ctx?.path?.startsWith('/sign-in')) return;
          const c = await prisma.customer.update({
            where: { id: session.userId },
            data: { lastLoginAt: new Date() },
            select: { organisationId: true },
          }).catch(() => null);
          if (c) {
            await writeCustomerAudit({
              customerId: session.userId,
              organisationId: c.organisationId,
              verb: 'signed_in',
              details: { userAgent: typeof session.userAgent === 'string' ? session.userAgent.slice(0, 200) : null },
              ipAddress: typeof session.ipAddress === 'string' ? session.ipAddress : null,
            });
          }
        },
      },
    },
  },

  // Brute-force protection, per internet address. CUSTOMER_SIGNIN_PER_MINUTE
  // tunes sign-in (tests raise it; a family or office may share one address).
  rateLimit: {
    enabled: true,
    storage: 'memory',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: Number(process.env.CUSTOMER_SIGNIN_PER_MINUTE) || 20 },
      '/request-password-reset': { window: 300, max: Number(process.env.CUSTOMER_RESET_REQUESTS_PER_5_MIN) || 5 },
      '/reset-password': { window: 300, max: 10 },
      '/change-password': { window: 60, max: 5 },
    },
  },

  session: {
    modelName: 'customerSession',
    fields: { userId: 'customerId' },
    expiresIn: 60 * 60 * 24 * 30, // customers stay signed in longer than staff
    // No cookie cache: signing out other devices (password change / reset,
    // the organisation switching the account off) takes effect at once.
    cookieCache: { enabled: false },
  },

  advanced: {
    // Emails ("forgot password") are sent AFTER the response, so the answer
    // takes the same time whether or not the email has an account.
    backgroundTasks: {
      handler: (task: Promise<unknown>) => {
        try { after(task); } catch { void task.catch(() => undefined); }
      },
    },
    useSecureCookies: process.env.NODE_ENV === 'production',
    cookiePrefix: 'customer-auth', // keeps customer cookies namespaced apart from the portal's
  },

  // Lets server actions (Profile → change password) set the refreshed
  // session cookie. Must stay the last plugin.
  plugins: [nextCookies()],
});
