import { renderEmailLayout } from './layout';

export type CustomerWelcomeEmailOptions = {
  customerName: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
  logoUrl: string;
};

export function renderCustomerWelcomeEmail(opts: CustomerWelcomeEmailOptions): string {
  const { customerName, email, temporaryPassword, loginUrl, logoUrl } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      Thank you for visiting Kewalram Workshop. We've created an account for you
      so you can track your vehicle's service progress, view estimates, and see
      your service history online.
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
      If you weren't expecting this email, please contact Kewalram Workshop directly
      and let us know.
    </p>
  `;

  return renderEmailLayout({
    previewText: `Your Kewalram customer account is ready — sign in to track your vehicle's service.`,
    heading: 'Your customer account is ready',
    bodyHtml,
    ctaLabel: 'Sign in to your account',
    ctaUrl: loginUrl,
    footerNote: 'For your security, never share your password with anyone — Kewalram staff will never ask for it.',
    logoUrl,
  });
}

/** Minimal HTML-escaping for the handful of user-supplied values that get
 * interpolated into this template (name, email) — prevents a customer
 * name/email containing HTML-special characters from breaking the email's
 * markup. Not a general sanitizer; sufficient for plain-text fields going
 * into a fixed template, not for rendering arbitrary HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
