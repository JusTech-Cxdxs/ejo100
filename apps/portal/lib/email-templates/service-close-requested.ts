// Vehicle Service parallel of close-requested.ts — kept separate so Job Card's own
// email is never touched (project standing rule).
import { renderEmailLayout, escapeHtml } from './layout';

export type ServiceCloseRequestedEmailOptions = {
  managerName: string;
  serviceNumber: string;
  customerName: string;
  requestedByName: string;
  serviceUrl: string;
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
export function renderServiceCloseRequestedEmail(opts: ServiceCloseRequestedEmailOptions): string {
  const { managerName, serviceNumber, customerName, requestedByName, serviceUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(managerName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(requestedByName)} has requested that Vehicle Service ${escapeHtml(serviceNumber)} for
      ${escapeHtml(customerName)} be closed. Please review and approve or decline.
    </p>
  `;

  return renderEmailLayout({
    previewText: `Close requested on Vehicle Service ${serviceNumber} — needs your review.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Close requested — needs your review',
    bodyHtml,
    ctaLabel: 'Review request',
    ctaUrl: serviceUrl,
    logoUrl,
  });
}
