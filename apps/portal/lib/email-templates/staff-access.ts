import { renderEmailLayout, escapeHtml } from './layout';
import type { AccessGroup } from '../authz/describe-access';

export type StaffAccessEmailOptions = {
  kind: 'welcome' | 'updated';
  fullName: string;
  email: string;
  employeeId: string | null;
  companyName: string;
  branchName: string | null;
  departmentName: string | null;
  roles: string[];
  isPlatformTeam: boolean;
  access: AccessGroup[];
  /** Welcome: the one-time link to set their own password. */
  setPasswordUrl?: string;
  setPasswordHours?: number;
  signInUrl: string;
  logoUrl: string;
  /** Updated: what changed, in one line (e.g. "You were given the role Store Officer."). */
  changeNote?: string;
};

/** The house rules every member of staff is told (kept true to what the platform enforces). */
export const STAFF_RULES = [
  'Your account is personal. Never share your password or let anyone else work under your name — nobody from IT or administration will ever ask for it.',
  'Everything you do in the platform is recorded in the audit trail with your name and the time.',
  'You see and act only on what your roles allow, and mostly for your own branch. If you need more access, ask your administrator — never use a colleague\'s account.',
  'Work through the proper steps: approvals, cancellations, refunds and stock movements each have their own step, so the history always stays complete.',
  'Sign out when you leave a shared computer.',
  'Forgot your password? Use “Forgot password” on the sign-in page to get a new link.',
  'If your account is switched off, you are signed out everywhere at once. Any change to your roles or permissions is emailed to you.',
];

const label = 'margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;';
const value = 'margin: 0 0 14px 0; font-size: 15px; color: #0F172A; font-weight: bold;';

function detailsBox(o: StaffAccessEmailOptions): string {
  const rows: [string, string][] = [
    ['Employee ID', o.employeeId ?? 'Not yet issued'],
    [o.roles.length > 1 ? 'Roles' : 'Role', o.isPlatformTeam ? 'Platform team (Master Administrator)' : o.roles.length ? o.roles.join(', ') : 'No role yet — your administrator will give you one'],
    ['Organisation', o.companyName],
    ['Branch', o.branchName ?? 'Organisation-wide'],
  ];
  if (o.departmentName) rows.push(['Department', o.departmentName]);
  rows.push(['Sign-in email', o.email]);
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr><td style="padding: 20px 24px 6px 24px;">
        ${rows.map(([k, v]) => `<p style="${label}">${escapeHtml(k)}</p><p style="${value}">${escapeHtml(v)}</p>`).join('')}
      </td></tr>
    </table>`;
}

function accessBlock(o: StaffAccessEmailOptions): string {
  if (o.isPlatformTeam) return '<p style="margin: 0 0 16px 0;">As a member of the platform team you can see and do everything, across every organisation.</p>';
  const groups = o.access.filter((g) => g.lines.length);
  if (!groups.length) return '<p style="margin: 0 0 16px 0;">For now you can request your own exit passes. Your administrator will give you a role for your work.</p>';
  return groups.map((g) => `
    <p style="margin: 18px 0 6px 0; font-size: 13px; font-weight: bold; color: #15803D;">${escapeHtml(g.module)}</p>
    <ul style="margin: 0 0 8px 0; padding-left: 20px; color: #0F172A; font-size: 14px; line-height: 1.5;">
      ${g.lines.map((l) => `<li style="margin: 0 0 4px 0;">${escapeHtml(l.label)} — <span style="color: #64748B;">${escapeHtml(l.where)}</span>${l.added ? ' <span style="color: #B45309; font-size: 12px;">(added by your administrator)</span>' : ''}</li>`).join('')}
    </ul>`).join('');
}

export function renderStaffAccessEmail(o: StaffAccessEmailOptions): { subject: string; html: string } {
  const welcome = o.kind === 'welcome';
  const heading = welcome ? `Welcome to ${o.companyName}` : 'Your access has changed';
  const subject = welcome ? `Welcome to EJO 100 — your ${o.companyName} account` : 'EJO 100 — your roles and permissions have changed';
  const hours = o.setPasswordHours ?? 72;
  const signIn = welcome && o.setPasswordUrl
    ? `
    <p style="margin: 24px 0 8px 0; font-size: 16px; font-weight: bold; color: #0F172A;">How to sign in</p>
    <ol style="margin: 0 0 8px 0; padding-left: 20px; font-size: 14px; line-height: 1.6; color: #0F172A;">
      <li>Press <strong>Set my password</strong> below and choose your own password (at least 8 characters). The link works once and expires in ${hours} hours.</li>
      <li>Go to <a href="${escapeHtml(o.signInUrl)}" style="color: #15803D;">${escapeHtml(o.signInUrl)}</a>.</li>
      <li>Sign in with your work email <strong>${escapeHtml(o.email)}</strong> and the password you chose.</li>
    </ol>
    <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748B;">Link expired? Use “Forgot password” on the sign-in page to get a new one.</p>`
    : '';
  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(o.fullName)},</p>
    <p style="margin: 0 0 8px 0;">${welcome
      ? `An account has been created for you on the EJO 100 Enterprise Platform, the system ${escapeHtml(o.companyName)} uses to run its daily work.`
      : `${o.changeNote ? `${escapeHtml(o.changeNote)} ` : ''}Here is what your account can do from now on.`}</p>
    ${detailsBox(o)}
    ${signIn}
    <p style="margin: 24px 0 4px 0; font-size: 16px; font-weight: bold; color: #0F172A;">What you can do</p>
    <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748B;">Exactly what your account allows today. If this changes, you will get a new email.</p>
    ${accessBlock(o)}
    <p style="margin: 24px 0 8px 0; font-size: 16px; font-weight: bold; color: #0F172A;">The rules</p>
    <ul style="margin: 0 0 8px 0; padding-left: 20px; font-size: 14px; line-height: 1.6; color: #0F172A;">
      ${STAFF_RULES.map((r) => `<li style="margin: 0 0 4px 0;">${escapeHtml(r)}</li>`).join('')}
    </ul>`;
  const html = renderEmailLayout({
    previewText: welcome ? `Your employee ID${o.employeeId ? ` ${o.employeeId}` : ''}, your role and how to sign in.` : 'Your roles and permissions have changed.',
    companyName: o.companyName,
    orgContext: [o.companyName, o.branchName].filter((x): x is string => Boolean(x)),
    iconGlyph: welcome ? '✓' : '!',
    iconTone: welcome ? 'positive' : 'neutral',
    heading,
    bodyHtml,
    ctaLabel: welcome && o.setPasswordUrl ? 'Set my password' : 'Open EJO 100',
    ctaUrl: welcome && o.setPasswordUrl ? o.setPasswordUrl : o.signInUrl,
    footerNote: welcome ? 'If you were not expecting this email, you can ignore it — nothing happens until the password is set.' : 'If you did not expect this change, tell your administrator.',
    logoUrl: o.logoUrl,
  });
  return { subject, html };
}
