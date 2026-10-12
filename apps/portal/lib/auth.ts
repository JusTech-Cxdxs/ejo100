import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@ejo/database';
import { after } from 'next/server';
import { sendEmail } from './email';
import { renderPasswordResetEmail } from './email-templates/password-reset';
import { portalConfig } from './site-config';
import { portalBaseUrl } from './portal-url';

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
  baseURL: process.env.BETTER_AUTH_URL || portalBaseUrl() || undefined,

  // Endpoints this platform never uses are switched off entirely (defence in
  // depth): people never edit their own account record, email or deletion
  // through the auth library — administrators and the app's own pages do.
  disabledPaths: ['/update-user', '/change-email', '/delete-user', '/sign-up/email'],

  emailAndPassword: {
    enabled: true,
    // Nobody can create a staff account from the internet.
    disableSignUp: true,
    requireEmailVerification: false, // set true once verification is confirmed working end-to-end
    // Password rules, stated here rather than left to library defaults so a
    // reviewer can read them: 8 to 128 characters (NIST SP 800-63B lengths).
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // "Forgot password" links work for one hour. Set-password links for new
    // staff (72 hours) are issued separately in lib/staff-onboarding.ts.
    resetPasswordTokenExpiresIn: 60 * 60,
    // A reset signs the person out on every device (a stolen session dies).
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // The branded "set a new password" email (lib/email-templates/password-reset.ts),
      // in the name of the person's own organisation.
      const name = (user as { fullName?: string; name?: string }).fullName ?? user.name ?? '';
      const base = portalBaseUrl();
      const org = await prisma.user.findUnique({ where: { id: user.id }, select: { organisation: { select: { name: true } } } }).catch(() => null);
      const companyName = org?.organisation?.name ?? portalConfig.organisationName;
      const { subject, html } = renderPasswordResetEmail({ fullName: name, url, companyName, logoUrl: `${base}/images/logo/logo.png` });
      await sendEmail(user.email, subject, html);
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
    // No cookie cache: every request checks the session row, so signing out
    // other devices, a password reset or switching an account off takes effect
    // on the next click instead of up to five minutes later. The cost is one
    // indexed lookup by token per request.
    cookieCache: { enabled: false },
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
    // input: false — never settable by the person (Better Auth's own
    // update-user endpoint would otherwise let anyone change their
    // organisation, which is the tenant fence). Only administrators, through
    // the Users page, place people.
    additionalFields: {
      accountType: { type: 'string', required: false, defaultValue: 'EMPLOYEE', input: false },
      organisationId: { type: 'string', required: false, input: false },
    },
  },

  // Brute-force protection: sign-in attempts are limited per address (below),
  // and 100 auth requests a minute overall. (Per server instance; a WAF /
  // shared store adds a global limit in front — see the platform blueprint.)
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      // Per internet address: a whole office signs in from ONE address at
      // 8 am, so 20 a minute (one guess every 3 s is still useless for
      // brute force). Tunable with AUTH_SIGNIN_PER_MINUTE (tests raise it).
      '/sign-in/email': { window: 60, max: Number(process.env.AUTH_SIGNIN_PER_MINUTE) || 20 },
      '/sign-up/email': { window: 60, max: 5 },
      // Better Auth 1.6 names the reset request /request-password-reset (the
      // old /forget-password rule never matched). Tunable for tests.
      '/request-password-reset': { window: 300, max: Number(process.env.AUTH_RESET_REQUESTS_PER_5_MIN) || 5 },
      '/forget-password': { window: 300, max: Number(process.env.AUTH_RESET_REQUESTS_PER_5_MIN) || 5 },
      '/reset-password': { window: 300, max: 5 },
    },
  },

  advanced: {
    // Emails (e.g. "forgot password") are sent AFTER the response: the answer
    // takes the same time whether or not the email has an account, so timing
    // never reveals who works here.
    backgroundTasks: {
      handler: (task: Promise<unknown>) => {
        try { after(task); } catch { void task.catch(() => undefined); }
      },
    },
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
