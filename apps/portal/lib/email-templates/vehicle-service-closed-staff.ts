// Vehicle Service parallel of job-card-closed-staff.ts — kept separate so Job Card's own
// email is never touched (project standing rule).
import { renderEmailLayout, escapeHtml } from './layout';

export type VehicleServiceClosedStaffEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  closedByName: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to every real staff party on a Vehicle Service the moment its status
 * genuinely transitions to CLOSED — creator, supervisor, assigned
 * technician, and every eligible branch Manager, one send each, the
 * same broadcast pattern already used for cancellation approval and
 * payment confirmation. CLOSED is the Manager's own administrative
 * sign-off that the job is complete and settled — this is that
 * record, distinct from the vehicle's own separate CHECKED_OUT email.
 */
export function renderVehicleServiceClosedStaffEmail(opts: VehicleServiceClosedStaffEmailOptions): string {
  const { recipientName, serviceNumber, customerName, closedByName, serviceUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(closedByName)} has closed Vehicle Service ${escapeHtml(serviceNumber)} for ${escapeHtml(customerName)} —
      work and payment on this service are now fully settled.
    </p>
  `;

  return renderEmailLayout({
    previewText: `Vehicle Service ${serviceNumber} has been closed.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Vehicle Service closed',
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: serviceUrl,
    logoUrl,
  });
}
