import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@ejo/database';

/**
 * Customer authentication. A SEPARATE Better Auth instance from the
 * portal's employee/admin auth (apps/portal/lib/auth.ts), mapped onto
 * the Customer / CustomerSession / CustomerAccount tables instead of
 * User / Session / Account. Same Postgres database and secret, so both
 * flows share one backend as required — but a customer's session token
 * only ever resolves against Customer, so it structurally cannot
 * authenticate an employee-only route, and vice versa.
 */
export const customerAuth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'http://localhost:3000',

  // Map Better Auth's default "user/session/account" models onto our
  // customer-specific tables.
  user: { modelName: 'customer' },
  account: { modelName: 'customerAccount' },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  session: {
    modelName: 'customerSession',
    expiresIn: 60 * 60 * 24 * 30, // customers stay signed in longer than staff
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    cookiePrefix: 'customer-auth', // keeps customer cookies namespaced apart from the portal's
  },
});
