import { renderEmailLayout, html, greeting, para, list, strong, plural } from './layout';

export type CustomerPasswordResetEmailOptions = {
  fullName: string;
  email: string;
  url: string;
  /** How long the link works, in minutes. */
  expiresInMinutes: number;
  companyName: string;
  logoUrl: string;
};

/** Customer "forgot password": a one-time link to choose a new password. */
export function renderCustomerPasswordResetEmail(o: CustomerPasswordResetEmailOptions): { subject: string; html: string } {
  const expiry = o.expiresInMinutes % 60 === 0 ? plural(o.expiresInMinutes / 60, 'hour') : plural(o.expiresInMinutes, 'minute');
  const bodyHtml = html`
    ${greeting(o.fullName)}
    ${para(html`We received a request to reset the password for the customer portal account ${strong(o.email)}. Use the button below to choose a new password.`)}
    ${list([
      html`The link works once and expires in ${strong(expiry)}.`,
      'Choosing a new password signs you out of the portal on every other device.',
      `${o.companyName} staff will never ask you for your password.`,
    ])}
    ${para(html`If you did not ask for this, you can ignore this email and your password will not change. If you keep receiving these emails, contact the branch.`, 'small')}`;
  return {
    subject: 'Reset your customer portal password',
    html: renderEmailLayout({
      previewText: `Use this link within ${expiry} to choose a new password.`,
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      orgContext: ['Customer portal'],
      status: { label: 'Security', tone: 'info' },
      heading: 'Reset your password',
      bodyHtml,
      ctaLabel: 'Choose a new password',
      ctaUrl: o.url,
      showLinkFallback: true,
      audience: 'customer',
      reason: `You are receiving this because a password reset was requested for your ${o.companyName} customer portal account.`,
    }),
  };
}
