// Vehicle Service parallel of job-card-cancelled-staff.ts — kept separate so Job Card's own
// email is never touched (project standing rule).
import { renderEmailLayout, escapeHtml } from './layout';

export type VehicleServiceCancelledStaffEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  approvedByName: string;
  reason: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to every real staff party on a Vehicle Service the moment a Manager
 * approves its cancellation — creator, supervisor, assigned
 * technician, and every eligible branch Manager, one send each, same
 * broadcast pattern already used for payment confirmation. Shows the
 * reason plainly, since staff are meant to see it — the customer's
 * own, separate email deliberately does not.
 */
export function renderVehicleServiceCancelledStaffEmail(opts: VehicleServiceCancelledStaffEmailOptions): string {
  const { recipientName, serviceNumber, customerName, approvedByName, reason, serviceUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(approvedByName)} has approved cancellation of Vehicle Service ${escapeHtml(serviceNumber)} for
      ${escapeHtml(customerName)}. No further work is needed on this Vehicle Service.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle Service</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(serviceNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Reason</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(reason)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Vehicle Service ${serviceNumber} has been cancelled.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'negative',
    heading: 'Vehicle Service cancelled',
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: serviceUrl,
    logoUrl,
  });
}
