import { renderEmailLayout, html, raw, EMAIL_FONT, greeting, para, details, list, sectionTitle, strong, link, primaryButton, plural } from './layout';
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
  'Your account is personal. Never share your password or let anyone else work under your name. Nobody from IT or administration will ever ask for it.',
  'Everything you do in the platform is recorded in the audit trail with your name and the time.',
  'You can see and do only what your roles allow, mostly for your own branch. If you need more access, ask your administrator; never use a colleague\'s account.',
  'Use the proper steps: approvals, cancellations, refunds and stock movements each have their own step, so the history stays complete.',
  'Sign out when you leave a shared computer.',
  'Forgot your password? Use "Forgot password" on the sign-in page to get a new link.',
  'If your account is switched off, you are signed out everywhere at once. Any change to your roles or permissions is emailed to you.',
];

function accessBlock(o: StaffAccessEmailOptions) {
  if (o.isPlatformTeam) return para('As a member of the platform team you can see and do everything, across every organisation.');
  const groups = o.access.filter((g) => g.lines.length);
  if (!groups.length) return para('For now you can request your own exit passes. Your administrator will give you a role for your work.');
  return groups.map((g) => html`
    <p class="ejo-strong" style="margin: 16px 0 6px 0; font-family: ${raw(EMAIL_FONT)}; font-size: 13px; font-weight: 700; color: #b40000;">${g.module}</p>
    ${list(g.lines.map((l) => html`${l.label}${l.where ? html` <span class="ejo-muted" style="color: #64748b;">(${l.where})</span>` : ''}${l.added ? html` <span style="color: #b45309; font-size: 12px;">added by your administrator</span>` : ''}`))}`);
}

export function renderStaffAccessEmail(o: StaffAccessEmailOptions): { subject: string; html: string } {
  const welcome = o.kind === 'welcome';
  const hours = o.setPasswordHours ?? 72;
  const roleText = o.isPlatformTeam
    ? 'Platform team (Master Administrator)'
    : o.roles.length ? o.roles.join(', ') : 'None yet. Your administrator will give you one.';
  const subject = welcome
    ? `Welcome to EJO 100: your ${o.companyName} account`
    : 'Your EJO 100 roles and permissions have changed';

  const bodyHtml = html`
    ${greeting(o.fullName)}
    ${welcome
      ? para(`An account has been created for you on EJO 100, the system ${o.companyName} uses to run its daily work.`)
      : para(`${o.changeNote ? `${o.changeNote} ` : ''}Here is what your account can do from now on.`)}
    ${details([
      ['Employee ID', o.employeeId ?? 'Not issued yet'],
      [o.roles.length > 1 ? 'Roles' : 'Role', roleText],
      ['Organisation', o.companyName],
      ['Branch', o.branchName ?? 'Organisation-wide'],
      ['Department', o.departmentName],
      ['Sign-in email', o.email],
    ])}
    ${welcome && o.setPasswordUrl ? html`
      ${sectionTitle('How to sign in')}
      ${list([
        html`Press ${strong('Set my password')} and choose a password of at least 8 characters. The link works once and expires in ${plural(hours, 'hour')}.`,
        html`Go to ${link(o.signInUrl.replace(/^https?:\/\//, ''), o.signInUrl)}.`,
        html`Sign in with your work email ${strong(o.email)} and the password you chose.`,
      ], true)}
      ${primaryButton('Set my password', o.setPasswordUrl)}
      ${para('If the link has expired, use "Forgot password" on the sign-in page to get a new one.', 'small')}` : ''}
    ${sectionTitle('What you can do')}
    ${para('This is exactly what your account allows today. If it changes, you will get a new email.', 'small')}
    ${accessBlock(o)}
    ${sectionTitle('The rules')}
    ${list(STAFF_RULES)}`;

  const html_ = renderEmailLayout({
    previewText: welcome
      ? `Your employee ID${o.employeeId ? ` ${o.employeeId}` : ''}, your role and how to sign in.`
      : 'Your roles and permissions have changed. Here is what you can do now.',
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: welcome ? { label: 'New account', tone: 'success' } : { label: 'Access changed', tone: 'info' },
    heading: welcome ? `Welcome to ${o.companyName}` : 'Your access has changed',
    bodyHtml,
    ctaLabel: welcome ? undefined : 'Open EJO 100',
    ctaUrl: welcome ? undefined : o.signInUrl,
    footerNote: welcome
      ? 'If you were not expecting this email, you can ignore it; nothing happens until a password is set.'
      : 'If you did not expect this change, tell your administrator straight away.',
    audience: 'staff',
  });
  return { subject, html: html_ };
}
