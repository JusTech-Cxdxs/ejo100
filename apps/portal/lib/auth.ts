import { betterAuth } from 'better-auth';
import { createAuthMiddleware, isAPIError } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@ejo/database';
import { after } from 'next/server';
import { sendEmail } from './email';
import { renderPasswordResetEmail } from './email-templates/password-reset';
import { renderEmailLayout, html, greeting, para } from './email-templates/layout';
import { portalConfig } from './site-config';
import { portalBaseUrl } from './portal-url';

/**
 * Staff authentication (Better Auth), on User/Session/Account/Verification
 * only. Customers use a separate instance (apps/website/lib/auth-customer.ts)
 * on CustomerSession/CustomerAccount, so a staff session can never resolve
 * against the Customer table, or the reverse, although both share one
 * database.
 *
 * Staff accounts are created only by an administrator (Users → "Add a staff
 * member", lib/actions/users-admin.ts); public sign-up is closed. A
 * deactivated account cannot start a session (hook below), and every
 * request re-checks it (requireUser, the app layout).
 */
/** Staff "forgot password" links: one hour. */
export const RESET_LINK_SECONDS = 60 * 60;

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
    // Password rules: 8 to 128 characters (NIST SP 800-63B lengths).
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // "Forgot password" links work for one hour; welcome links (72 hours) are issued by lib/staff-onboarding.ts.
    resetPasswordTokenExpiresIn: RESET_LINK_SECONDS,
    // A reset signs the person out on every device.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url, token }) => {
      // Only the newest link works: earlier reset or set-password links for this person are withdrawn.
      await prisma.verification.deleteMany({ where: { value: user.id, identifier: { startsWith: 'reset-password:', not: `reset-password:${token}` } } }).catch(() => undefined);
      // The branded email, in the name of the person's own organisation.
      const name = (user as { fullName?: string; name?: string }).fullName ?? user.name ?? '';
      const base = portalBaseUrl();
      const org = await prisma.user.findUnique({ where: { id: user.id }, select: { organisation: { select: { name: true } } } }).catch(() => null);
      const companyName = org?.organisation?.name ?? portalConfig.organisationName;
      const message = renderPasswordResetEmail({ fullName: name, email: user.email, url, companyName, logoUrl: `${base}/images/logo/email-logo.png` });
      await sendEmail(user.email, message.subject, message.html);
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      const base = portalBaseUrl();
      const name = (user as { fullName?: string; name?: string }).fullName ?? user.name ?? '';
      await sendEmail(
        user.email,
        'Confirm your EJO 100 email address',
        renderEmailLayout({
          previewText: 'Confirm this address to finish setting up your EJO 100 account.',
          companyName: portalConfig.organisationName,
          logoUrl: `${base}/images/logo/email-logo.png`,
          status: { label: 'Security', tone: 'info' },
          heading: 'Confirm your email address',
          bodyHtml: html`${greeting(name)}${para('Please confirm this email address to finish setting up your EJO 100 account. If you did not expect this, you can ignore the email.')}`,
          ctaLabel: 'Confirm email address',
          ctaUrl: url,
          showLinkFallback: true,
          reason: 'You are receiving this because this address was used for an EJO 100 account.',
        }),
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
        // Every sign-in is recorded (when, from where) — not the sessions
        // Better Auth re-issues itself. Raw update: a sign-in is not a change
        // to the person's record, so it stays out of the data journal.
        after: async (session, ctx) => {
          if (!ctx?.path?.startsWith('/sign-in')) return;
          await recordStaffSignIn(session.userId, typeof session.ipAddress === 'string' ? session.ipAddress : null, typeof session.userAgent === 'string' ? session.userAgent : null);
        },
      },
    },
  },

  // A failed sign-in is recorded too (the address tried, why it failed, from
  // where — never the password): the Support centre uses it for "I can't log
  // in", and the integrity checks for password-guessing.
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/sign-in/email') return;
      const r = ctx.context.returned;
      if (!isAPIError(r)) return;
      const body = (ctx.body ?? {}) as { email?: unknown };
      const ip = ctx.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() || ctx.headers?.get('x-real-ip') || null;
      await recordFailedSignIn(typeof body.email === 'string' ? body.email : '', String((r.body as { code?: unknown } | undefined)?.code ?? r.status ?? 'failed'), ip, ctx.headers?.get('user-agent') ?? null);
    }),
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

async function recordStaffSignIn(userId: string, ip: string | null, userAgent: string | null): Promise<void> {
  try {
    await prisma.$executeRaw`UPDATE "users" SET "lastLoginAt" = now() WHERE "id" = ${userId}`;
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { organisationId: true } });
    await prisma.auditLog.create({ data: { organisationId: u?.organisationId ?? null, userId, action: 'user.signed_in', entityType: 'User', entityId: userId, ipAddress: ip?.slice(0, 64) ?? null, metadata: { userAgent: userAgent?.slice(0, 200) ?? null } } });
  } catch {
    /* never stops a sign-in */
  }
}

async function recordFailedSignIn(rawEmail: string, code: string, ip: string | null, userAgent: string | null): Promise<void> {
  try {
    const email = rawEmail.trim().toLowerCase().slice(0, 160);
    if (!email) return;
    const u = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, organisationId: true, isActive: true } });
    await prisma.auditLog.create({
      data: {
        organisationId: u?.organisationId ?? null, userId: null, action: 'user.sign_in_failed', entityType: 'User', entityId: u?.id ?? null, ipAddress: ip?.slice(0, 64) ?? null,
        metadata: { email, known: Boolean(u), inactive: u ? !u.isActive : undefined, reason: code.slice(0, 60), userAgent: userAgent?.slice(0, 200) ?? null },
      },
    });
  } catch {
    /* never changes the answer */
  }
}
