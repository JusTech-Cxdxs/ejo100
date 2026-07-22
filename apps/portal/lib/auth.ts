import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@ejo/database';
import { sendEmail } from './email';

/**
 * Employee/Admin authentication (Better Auth). Deliberately scoped to
 * User/Session/Account/Verification only — Customer auth is a separate
 * instance (apps/website/lib/auth-customer.ts) writing into
 * CustomerSession/CustomerAccount, so an employee session can never
 * resolve against the Customer table and vice versa (Phase 2 isolation
 * requirement), even though both share this exact database.
 *
 * Employee accounts are provisioned by an administrator (Users module,
 * later phase) rather than opened to public self-signup — keep
 * emailAndPassword.disableSignUp = false only for the initial admin
 * bootstrap, then flip it to true once the first admin exists.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // set true once verification is confirmed working end-to-end
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(
        user.email,
        'Reset your EJO 100 password',
        `<p>Hello ${user.name ?? ''},</p>
         <p>Click the link below to reset your EJO 100 Enterprise Platform password. This link expires in 1 hour.</p>
         <p><a href="${url}">Reset password</a></p>
         <p>If you didn't request this, you can safely ignore this email.</p>`,
      );
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(
        user.email,
        'Verify your EJO 100 email address',
        `<p>Hello ${user.name ?? ''},</p>
         <p>Please verify your email address to finish setting up your EJO 100 account.</p>
         <p><a href="${url}">Verify email</a></p>`,
      );
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days when "remember me" is checked
    updateAge: 60 * 60 * 24, // refresh once per day of activity
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  user: {
    additionalFields: {
      accountType: { type: 'string', required: false, defaultValue: 'EMPLOYEE' },
      companyId: { type: 'string', required: false },
    },
  },

  advanced: {
    // Better Auth's Prisma adapter maps model names 1:1 to our schema's
    // User / Session / Account / Verification models — no field mapping
    // override needed as long as those model names stay as-is.
    useSecureCookies: process.env.NODE_ENV === 'production',
  },
});

export type Session = typeof auth.$Infer.Session;
