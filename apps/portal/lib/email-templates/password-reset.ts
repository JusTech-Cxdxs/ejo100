import { renderEmailLayout, html, greeting, para, list, strong } from './layout';

/** Staff "forgot password": a one-time link to choose a new password (valid for 1 hour). */
export function renderPasswordResetEmail(o: { fullName: string; email?: string; url: string; companyName: string; logoUrl: string }): { subject: string; html: string } {
  const bodyHtml = html`
    ${greeting(o.fullName)}
    ${para(html`We received a request to reset the password for your EJO 100 account${o.email ? html` (${strong(o.email)})` : ''}. Use the button below to choose a new one.`)}
    ${list([
      html`The link works once and expires in ${strong('1 hour')}.`,
      'Nobody from IT or administration will ever ask you for your password.',
    ])}
    ${para('If you did not ask for this, ignore this email: your password will not change. If you receive several of these without asking, tell your administrator.', 'small')}`;
  return {
    subject: 'Reset your EJO 100 password',
    html: renderEmailLayout({
      previewText: 'Use this link within 1 hour to choose a new password.',
      companyName: o.companyName,
      logoUrl: o.logoUrl,
      status: { label: 'Security', tone: 'info' },
      heading: 'Reset your password',
      bodyHtml,
      ctaLabel: 'Choose a new password',
      ctaUrl: o.url,
      showLinkFallback: true,
      reason: 'You are receiving this because a password reset was requested for your EJO 100 account.',
    }),
  };
}
