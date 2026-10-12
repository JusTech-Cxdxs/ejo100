import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerWelcomeEmailOptions = {
  /** welcome: just registered · access: a new set-password link sent from the CRM. */
  kind: 'welcome' | 'access';
  customerName: string;
  email: string;
  /** The one-time link to choose their own password (on the website). */
  setPasswordUrl: string;
  setPasswordHours: number;
  /** The customer portal's sign-in page. */
  signInUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName?: string | null;
  /** How to reach the branch (never a member of staff by name). */
  branchContact?: { address?: string | null; phones?: string[]; email?: string | null };
};

/** What a customer can do in the portal — kept true to what the portal offers. */
export const CUSTOMER_PORTAL_FEATURES = [
  'Follow each visit live — check-in, estimate, work in progress, ready for collection.',
  'See your estimates, and what has been paid or is still due.',
  'Your vehicles, their service history and when the next service is due.',
  'Your warranties and their cover.',
  'Messages from the branch, and your own contact details and addresses.',
];

const label = 'margin: 0 0 4px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;';
const value = 'margin: 0 0 14px 0; font-size: 15px; color: #0F172A; font-weight: bold;';

/**
 * The customer's welcome / portal-access email: a "Set my password" button
 * (a one-time link — never a password in the email), what the portal is for,
 * and how to reach the branch. No staff names.
 */
export function renderCustomerWelcomeEmail(o: CustomerWelcomeEmailOptions): { subject: string; html: string } {
  const welcome = o.kind === 'welcome';
  const subject = welcome ? `Welcome to ${o.companyName} — set up your customer account` : `${o.companyName} — set your customer portal password`;
  const heading = welcome ? 'Your customer account is ready' : 'Set your password';
  const contact = o.branchContact ?? {};
  const contactRows: [string, string][] = [];
  if (contact.address) contactRows.push(['Address', contact.address]);
  if (contact.phones?.length) contactRows.push([contact.phones.length > 1 ? 'Phone numbers' : 'Phone', contact.phones.join(' · ')]);
  if (contact.email) contactRows.push(['Email', contact.email]);

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(o.customerName)},</p>
    <p style="margin: 0 0 8px 0;">${welcome
      ? `Thank you for choosing ${escapeHtml(o.companyName)}${o.branchName ? ` — ${escapeHtml(o.branchName)}` : ''}. We have created a customer account for you so you can follow your vehicle's work online.`
      : `Here is a new link to set the password for your ${escapeHtml(o.companyName)} customer account. Any earlier link no longer works.`}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr><td style="padding: 20px 24px 6px 24px;">
        <p style="${label}">Sign-in email</p><p style="${value}">${escapeHtml(o.email)}</p>
        <p style="${label}">Customer portal</p><p style="${value}"><a href="${escapeHtml(o.signInUrl)}" style="color: #15803D;">${escapeHtml(o.signInUrl)}</a></p>
      </td></tr>
    </table>

    <p style="margin: 24px 0 8px 0; font-size: 16px; font-weight: bold; color: #0F172A;">How to sign in</p>
    <ol style="margin: 0 0 8px 0; padding-left: 20px; font-size: 14px; line-height: 1.6; color: #0F172A;">
      <li>Press <strong>Set my password</strong> below and choose your own password (at least 8 characters). The link works once and expires in ${o.setPasswordHours} hours.</li>
      <li>Sign in at the customer portal with <strong>${escapeHtml(o.email)}</strong> and the password you chose.</li>
    </ol>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 14px 0 10px 0;"><tr><td style="border-radius: 8px; background-color: #16A34A;">
      <a href="${escapeHtml(o.setPasswordUrl)}" style="display: inline-block; padding: 12px 26px; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: bold; color: #ffffff; text-decoration: none;">Set my password</a>
    </td></tr></table>
    <p style="margin: 0 0 8px 0; font-size: 13px; color: #64748B;">Link expired? Use “Forgot password” on the customer portal's sign-in page to get a new one, or ask the branch to send you one.</p>

    <p style="margin: 24px 0 4px 0; font-size: 16px; font-weight: bold; color: #0F172A;">What you can do in the portal</p>
    <ul style="margin: 0 0 8px 0; padding-left: 20px; font-size: 14px; line-height: 1.6; color: #0F172A;">
      ${CUSTOMER_PORTAL_FEATURES.map((f) => `<li style="margin: 0 0 4px 0;">${escapeHtml(f)}</li>`).join('')}
    </ul>
    ${contactRows.length ? `
    <p style="margin: 24px 0 4px 0; font-size: 16px; font-weight: bold; color: #0F172A;">Contact ${escapeHtml(o.branchName || o.companyName)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 8px 0 0 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr><td style="padding: 16px 24px 4px 24px;">
        ${contactRows.map(([k, v]) => `<p style="${label}">${escapeHtml(k)}</p><p style="${value}">${escapeHtml(v)}</p>`).join('')}
      </td></tr>
    </table>` : ''}
  `;

  const html = renderEmailLayout({
    previewText: welcome ? `Your ${o.companyName} customer account is ready — set your password to sign in.` : 'A new link to set your customer portal password.',
    companyName: o.companyName,
    orgContext: [o.companyName, o.branchName, o.departmentName ?? ''].filter(Boolean),
    iconGlyph: '✓',
    heading,
    bodyHtml,
    ctaLabel: 'Set my password',
    ctaUrl: o.setPasswordUrl,
    footerNote: `If you were not expecting this email, you can ignore it — nothing happens until a password is set. ${o.companyName} staff will never ask for your password.`,
    logoUrl: o.logoUrl,
  });
  return { subject, html };
}
