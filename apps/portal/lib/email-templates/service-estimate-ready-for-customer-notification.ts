import { renderEmailLayout, escapeHtml } from './layout';

export type ServiceEstimateReadyForCustomerNotificationEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  approvedByManagerName: string;
  totalAmount: string;
  vehicleServiceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * The real Vehicle Service equivalent of Job Card's own
 * renderEstimateReadyForCustomerNotificationEmail — sent to whoever
 * created the Vehicle Service (VehicleService.createdById) the moment
 * the Manager approves. Same real reasoning as Job Card's own: the
 * Manager approving means the numbers are right, not that anyone has
 * decided the customer should be told yet — that's this person's own
 * explicit call, triggered separately.
 */
export function renderServiceEstimateReadyForCustomerNotificationEmail(opts: ServiceEstimateReadyForCustomerNotificationEmailOptions): string {
  const { recipientName, serviceNumber, customerName, approvedByManagerName, totalAmount, vehicleServiceUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(approvedByManagerName)} has approved the estimate on Vehicle Service ${escapeHtml(serviceNumber)} for
      ${escapeHtml(customerName)}. Please review it, and once you're satisfied everything is in order, notify
      the customer so they can review and proceed.
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
    previewText: `Estimate for Vehicle Service ${serviceNumber} is manager-approved — ready to notify the customer.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Estimate approved — ready for the customer',
    bodyHtml,
    ctaLabel: 'Review and notify customer',
    ctaUrl: vehicleServiceUrl,
    logoUrl,
  });
}
