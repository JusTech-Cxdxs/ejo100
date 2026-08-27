import { renderEmailLayout, escapeHtml } from './layout';

export type CancellationRequestedEmailOptions = {
  managerName: string;
  jobNumber: string;
  customerName: string;
  requestedByName: string;
  reason: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Sent to every eligible Workshop Manager for the branch the moment a
 * cancellation is requested — same "notify every eligible manager,
 * one send each" pattern already used for estimate manager-review.
 * The Job Card's own status is never touched at this point; this is
 * purely "someone is asking, here's why, please decide."
 */
export function renderCancellationRequestedEmail(opts: CancellationRequestedEmailOptions): string {
  const { managerName, jobNumber, customerName, requestedByName, reason, jobCardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(managerName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(requestedByName)} has requested cancellation of Job Card ${escapeHtml(jobNumber)} for
      ${escapeHtml(customerName)}. Please review and approve or decline.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Job Card</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(jobNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Reason</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(reason)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Cancellation requested on Job Card ${jobNumber} — needs your review.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Cancellation requested — needs your review',
    bodyHtml,
    ctaLabel: 'Review request',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
