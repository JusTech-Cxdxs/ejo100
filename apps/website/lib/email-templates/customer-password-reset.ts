import { renderEmailLayout, escapeHtml } from './layout';

/** Customer "forgot password" — the branded email with a one-time link (1 hour). */
export function renderCustomerPasswordResetEmail(o: { fullName: string; url: string; companyName: string; logoUrl: string }): { subject: string; html: string } {
  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(o.fullName || 'there')},</p>
    <p style="margin: 0 0 16px 0;">Someone — hopefully you — asked to set a new password for your customer portal account with ${escapeHtml(o.companyName)}. Press the button below to choose one.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 8px 0 16px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr><td style="padding: 14px 18px; font-size: 13px; color: #334155; line-height: 1.6;">
        &bull; The link works <strong>once</strong> and expires in <strong>1 hour</strong>.<br />
        &bull; Our staff will never ask you for your password.<br />
        &bull; Didn&rsquo;t ask for this? Ignore this email &mdash; your password stays as it is.
      </td></tr>
    </table>`;
  const html = renderEmailLayout({
    previewText: 'Your link to set a new customer portal password (expires in 1 hour).',
    companyName: o.companyName,
    orgContext: ['Customer portal'],
    iconGlyph: '⚿',
    iconTone: 'neutral',
    heading: 'Set a new password',
    bodyHtml,
    ctaLabel: 'Set a new password',
    ctaUrl: o.url,
    footerNote: 'For your security this link can only be used once.',
    logoUrl: o.logoUrl,
  });
  return { subject: 'Set a new password for your customer portal', html };
}
