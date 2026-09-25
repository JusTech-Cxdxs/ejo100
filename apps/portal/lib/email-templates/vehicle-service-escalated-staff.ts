import { renderEmailLayout, escapeHtml } from './layout';

export type VehicleServiceEscalatedStaffEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  jobNumber: string;
  customerName: string;
  escalatedByName: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * To the people on the original Vehicle Service (its creator, supervisor
 * and technician) when it is escalated: the service is now closed and
 * read-only, and everything continues on the new Job Card.
 */
export function renderVehicleServiceEscalatedStaffEmail(opts: VehicleServiceEscalatedStaffEmailOptions): string {
  const { recipientName, serviceNumber, jobNumber, customerName, escalatedByName, jobCardUrl, logoUrl, companyName, branchName } = opts;
  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      Vehicle Service ${escapeHtml(serviceNumber)} (${escapeHtml(customerName)}) has been escalated to Job Card
      <strong>${escapeHtml(jobNumber)}</strong> by ${escapeHtml(escalatedByName)} — the work found goes beyond routine maintenance.
    </p>
    <p style="margin: 0;">
      The Vehicle Service is now closed and read-only. All further work, the estimate, payment and check-out continue on the
      Job Card. The vehicle's next-service count starts when that Job Card is checked out.
    </p>
  `;
  return renderEmailLayout({
    previewText: `Vehicle Service ${serviceNumber} escalated to Job Card ${jobNumber}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '↗',
    iconTone: 'neutral',
    heading: 'Vehicle Service escalated to a Job Card',
    bodyHtml,
    ctaLabel: `Open Job Card ${jobNumber}`,
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
