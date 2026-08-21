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
 *
 * IMPORTANT: remapping `modelName` (below) only tells Better Auth which
 * *table* to use — it does NOT rename the internal *field names* Better
 * Auth expects within that table. Better Auth's own default schema
 * expects `account.userId` and `session.userId` as the foreign key back
 * to the user row; our schema names that column `customerId` on both
 * CustomerAccount and CustomerSession (since it references Customer, not
 * User). Without the `fields: { userId: 'customerId' }` remap below,
 * every sign-in attempt fails with a real Prisma error —
 * `Unknown argument 'userId'` — surfaced to the customer only as a
 * generic "Invalid email or password." Confirmed directly from Better
 * Auth's own reference docs (the exact `fields: { userId: '...' }`
 * pattern), not guessed. Likewise, `Customer.fullName` isn't named
 * `name` (Better Auth's own default expectation) — mapped the same way.
 */
export const customerAuth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'http://localhost:3000',

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

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  session: {
    modelName: 'customerSession',
    fields: { userId: 'customerId' },
    expiresIn: 60 * 60 * 24 * 30, // customers stay signed in longer than staff
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
    cookiePrefix: 'customer-auth', // keeps customer cookies namespaced apart from the portal's
  },
});
