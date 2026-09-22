import { renderEmailLayout, escapeHtml } from './layout';

export type ServiceEstimateReadyForManagerEmailOptions = {
  managerName: string;
  serviceNumber: string;
  customerName: string;
  approvedByName: string;
  totalAmount: string;
  vehicleServiceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * The real Vehicle Service equivalent of Job Card's own
 * renderEstimateReadyForManagerEmail — sent to every eligible
 * Workshop Manager for the branch once the supervisor has approved
 * a Service Estimate, same real "whichever one acts first" reasoning
 * as Job Card's own version.
 */
export function renderServiceEstimateReadyForManagerEmail(opts: ServiceEstimateReadyForManagerEmailOptions): string {
  const { managerName, serviceNumber, customerName, approvedByName, totalAmount, vehicleServiceUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(managerName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(approvedByName)} has approved the estimate on Vehicle Service ${escapeHtml(serviceNumber)} for
      ${escapeHtml(customerName)}. It's ready for your review before the customer is notified.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle Service</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(serviceNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Total Estimate</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(totalAmount)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Estimate for Vehicle Service ${serviceNumber} is ready for your review.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Estimate ready for your review',
    bodyHtml,
    ctaLabel: 'Review estimate',
    ctaUrl: vehicleServiceUrl,
    logoUrl,
  });
}
