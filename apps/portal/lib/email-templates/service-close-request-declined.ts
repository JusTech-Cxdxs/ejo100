// Vehicle Service parallel of close-request-declined.ts — kept separate so Job Card's own
// email is never touched (project standing rule).
import { renderEmailLayout, escapeHtml } from './layout';

export type ServiceCloseRequestDeclinedEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  declinedByName: string;
  decisionNotes?: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Sent to whoever requested the close once a Manager declines it —
 * the Vehicle Service's own status was never touched (requesting a close
 * never changes status, same as requesting a cancellation), so this
 * is purely informational: the request didn't go through, here's why,
 * work continues as normal at whatever status it was already at.
 */
export function renderServiceCloseRequestDeclinedEmail(opts: ServiceCloseRequestDeclinedEmailOptions): string {
  const { recipientName, serviceNumber, customerName, declinedByName, decisionNotes, serviceUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(declinedByName)} has declined the request to close Vehicle Service ${escapeHtml(serviceNumber)} for
      ${escapeHtml(customerName)}. The Vehicle Service continues as normal.
    </p>
    ${decisionNotes?.trim()
      ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Note</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(decisionNotes.trim())}</p>
        </td>
      </tr>
    </table>
    `
      : ''}
  `;

  return renderEmailLayout({
    previewText: `Request to close Vehicle Service ${serviceNumber} was declined.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Close request declined',
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: serviceUrl,
    logoUrl,
  });
}
