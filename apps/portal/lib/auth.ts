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
 * Employee accounts are created only by an administrator (Users →
 * "Add a staff member", lib/actions/users-admin.ts) — public self-sign-up
 * is closed. A deactivated account can never start a session (hook
 * below), and every request re-checks it (requireUser, the app layout).
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',

  emailAndPassword: {
    enabled: true,
    // Nobody can create a staff account from the internet.
    disableSignUp: true,
    requireEmailVerification: false, // set true once verification is confirmed working end-to-end
    sendResetPassword: async ({ user, url }) => {
      // Also sent when an administrator adds a new staff member: they set
      // their own password from this link (no password is ever emailed).
      const name = (user as { fullName?: string; name?: string }).fullName ?? user.name ?? '';
      await sendEmail(
        user.email,
        'Set your EJO 100 password',
        `<p>Hello ${escapeHtml(name)},</p>
         <p>Use the link below to set your EJO 100 Enterprise Platform password. It expires in 1 hour — if it has expired, use "Forgot password" on the sign-in page to get a new one.</p>
         <p><a href="${url}">Set my password</a></p>
         <p>If you were not expecting this, you can safely ignore this email.</p>`,
      );
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(
        user.email,
        'Verify your EJO 100 email address',
        `<p>Hello ${escapeHtml(user.name ?? '')},</p>
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

  // A deactivated person cannot sign in (their open sessions are removed on
  // deactivation, and every request re-checks — see requireUser).
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { isActive: true } });
          return Boolean(u?.isActive);
        },
      },
    },
  },

  user: {
    additionalFields: {
      accountType: { type: 'string', required: false, defaultValue: 'EMPLOYEE' },
      organisationId: { type: 'string', required: false },
    },
  },

  // Brute-force protection: at most 5 sign-in attempts a minute per client,
  // and 100 auth requests a minute overall. (Per server instance; a WAF /
  // shared store adds a global limit in front — see the platform blueprint.)
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 5 },
      '/forget-password': { window: 300, max: 3 },
      '/reset-password': { window: 300, max: 5 },
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

/** Text placed into an HTML email is always escaped (no markup injection). */
function escapeHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
