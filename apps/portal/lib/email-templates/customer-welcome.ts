import { renderEmailLayout, html, greeting, para, details, list, sectionTitle, strong, link, plural, primaryButton, type BranchContact } from './layout';

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
  branchContact?: BranchContact;
};

/** What a customer can do in the portal — kept true to what the portal offers. */
export const CUSTOMER_PORTAL_FEATURES = [
  'Follow each visit as it moves from check-in to estimate, work and collection.',
  'See your estimates, what you have paid and what is still due.',
  'Keep track of your vehicles, their service history and when the next service is due.',
  'See your warranties and what they cover.',
  'Read messages from the branch and keep your contact details up to date.',
];

/**
 * The customer's welcome / portal-access email: a "Set my password" button
 * (a one-time link, never a password), what the portal is for, and how to
 * reach the branch. No staff names.
 */
export function renderCustomerWelcomeEmail(o: CustomerWelcomeEmailOptions): { subject: string; html: string } {
  const welcome = o.kind === 'welcome';
  const expiry = plural(o.setPasswordHours, 'hour');
  const subject = welcome
    ? `Welcome to ${o.companyName}: set up your customer portal account`
    : `Your link to set your customer portal password`;
  const bodyHtml = html`
    ${greeting(o.customerName)}
    ${welcome
      ? para(html`Thank you for choosing ${o.companyName}${o.branchName ? html`, ${o.branchName}` : ''}. We have opened a customer portal account for you, so you can follow the work on your vehicle online.`)
      : para(html`Here is a new link to set the password for your ${o.companyName} customer portal account. Any earlier link no longer works.`)}
    ${details([
      ['Sign-in email', o.email],
      ['Customer portal', link(o.signInUrl.replace(/^https?:\/\//, ''), o.signInUrl)],
      ['Link expires', `${expiry} after this email was sent`],
    ])}
    ${sectionTitle('How to sign in')}
    ${list([
      html`Press ${strong('Set my password')} and choose a password of at least 8 characters.`,
      html`Sign in to the customer portal with ${strong(o.email)} and that password.`,
    ], true)}
    ${primaryButton('Set my password', o.setPasswordUrl)}
    ${para(html`If the link has expired, use ${strong('Forgot password')} on the customer portal sign-in page, or ask the branch to send a new one.`, 'small')}
    ${welcome ? html`${sectionTitle('What you can do in the portal')}${list(CUSTOMER_PORTAL_FEATURES)}` : ''}`;

  const html_ = renderEmailLayout({
    previewText: welcome
      ? `Your ${o.companyName} customer portal account is ready. Set your password to sign in.`
      : `Set your customer portal password. The link expires in ${expiry}.`,
    companyName: o.companyName,
    logoUrl: o.logoUrl,
    orgContext: [o.branchName, o.departmentName],
    status: welcome ? { label: 'Account ready', tone: 'success' } : { label: 'Security', tone: 'info' },
    heading: welcome ? 'Your customer portal account is ready' : 'Set your password',
    bodyHtml,
    footerNote: `If you were not expecting this email, you can ignore it; nothing happens until a password is set. ${o.companyName} staff will never ask for your password.`,
    audience: 'customer',
    branchContact: o.branchContact,
  });
  return { subject, html: html_ };
}
