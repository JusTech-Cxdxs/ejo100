import { renderEmailLayout, escapeHtml } from './layout';

export type CancellationDeclinedEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  declinedByName: string;
  decisionNotes?: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Sent to whoever requested the cancellation once a Manager declines
 * it — the Job Card's own status was never touched, so this is purely
 * informational: the request didn't go through, here's why, work
 * continues as normal.
 */
export function renderCancellationDeclinedEmail(opts: CancellationDeclinedEmailOptions): string {
  const { recipientName, jobNumber, customerName, declinedByName, decisionNotes, jobCardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(declinedByName)} has declined the cancellation request on Job Card ${escapeHtml(jobNumber)} for
      ${escapeHtml(customerName)}. The Job Card continues as normal.
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
    previewText: `Cancellation request on Job Card ${jobNumber} was declined.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Cancellation request declined',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
