import { renderEmailLayout, escapeHtml } from './layout';

/** "Forgot password" — the branded email with a one-time link (1 hour). */
export function renderPasswordResetEmail(o: { fullName: string; url: string; companyName: string; logoUrl: string }): { subject: string; html: string } {
  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(o.fullName || 'there')},</p>
    <p style="margin: 0 0 16px 0;">Someone — hopefully you — asked to set a new password for your EJO 100 account. Press the button below to choose one.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 8px 0 16px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr><td style="padding: 14px 18px; font-size: 13px; color: #334155; line-height: 1.6;">
        • The link works <strong>once</strong> and expires in <strong>1 hour</strong>.<br />
        • Nobody from IT or administration will ever ask you for your password.<br />
        • Didn’t ask for this? Ignore this email — your password stays as it is.
      </td></tr>
    </table>`;
  const html = renderEmailLayout({
    previewText: 'Your link to set a new EJO 100 password (expires in 1 hour).',
    companyName: o.companyName,
    iconGlyph: '⚿',
    iconTone: 'neutral',
    heading: 'Set a new password',
    bodyHtml,
    ctaLabel: 'Set a new password',
    ctaUrl: o.url,
    footerNote: 'For your security this link can only be used once.',
    logoUrl: o.logoUrl,
  });
  return { subject: 'Set a new EJO 100 password', html };
}
