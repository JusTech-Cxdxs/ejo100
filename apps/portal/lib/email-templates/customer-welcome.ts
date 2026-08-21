import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerWelcomeEmailOptions = {
  customerName: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

export function renderCustomerWelcomeEmail(opts: CustomerWelcomeEmailOptions): string {
  const { customerName, email, temporaryPassword, loginUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      Thank you for visiting the ${escapeHtml(branchName)} ${escapeHtml(departmentName)}. We've created an
      account for you so you can track your vehicle's service progress, view estimates, and see your service
      history online.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Email</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(email)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Temporary password</p>
          <p style="margin: 0; font-size: 18px; color: #0F172A; font-weight: bold; font-family: 'Courier New', monospace; letter-spacing: 0.05em;">${escapeHtml(temporaryPassword)}</p>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 16px 0;">
      This password was generated automatically and only appears in this email —
      we recommend signing in and changing it to something memorable, though
      that's entirely up to you.
    </p>
    <p style="margin: 0;">
      If you weren't expecting this email, please contact ${escapeHtml(companyName)} directly and let us know.
    </p>
  `;

  return renderEmailLayout({
    previewText: `Your ${companyName} customer account is ready — sign in to track your vehicle's service.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '✓',
    heading: 'Your customer account is ready',
    bodyHtml,
    ctaLabel: 'Sign in to your account',
    ctaUrl: loginUrl,
    footerNote: `For your security, never share your password with anyone — ${companyName} staff will never ask for it.`,
    logoUrl,
  });
}
