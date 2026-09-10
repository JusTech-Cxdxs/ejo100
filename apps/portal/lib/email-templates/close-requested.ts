import { renderEmailLayout, escapeHtml } from './layout';

export type CloseRequestedEmailOptions = {
  managerName: string;
  jobNumber: string;
  customerName: string;
  requestedByName: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Sent to every eligible Workshop Manager for the branch the moment a
 * close is requested — same "notify every eligible manager, one send
 * each" pattern already used for cancellation requests. The Job
 * Card's own status is never touched at this point; this is purely
 * "someone is asking, here's why, please decide."
 */
export function renderCloseRequestedEmail(opts: CloseRequestedEmailOptions): string {
  const { managerName, jobNumber, customerName, requestedByName, jobCardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(managerName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(requestedByName)} has requested that Job Card ${escapeHtml(jobNumber)} for
      ${escapeHtml(customerName)} be closed. Please review and approve or decline.
    </p>
  `;

  return renderEmailLayout({
    previewText: `Close requested on Job Card ${jobNumber} — needs your review.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Close requested — needs your review',
    bodyHtml,
    ctaLabel: 'Review request',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
