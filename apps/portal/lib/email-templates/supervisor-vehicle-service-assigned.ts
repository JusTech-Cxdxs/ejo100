import { renderEmailLayout, escapeHtml } from './layout';

export type SupervisorVehicleServiceAssignedEmailOptions = {
  supervisorName: string;
  serviceNumber: string;
  customerName: string;
  vehicleDescription: string;
  reasons: string[];
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent when a new Vehicle Service is opened and assigned to a
 * supervisor — the same first-touch notification pattern as Job
 * Card's own supervisor-assigned email, built on the same reusable
 * layout.
 */
export function renderSupervisorVehicleServiceAssignedEmail(opts: SupervisorVehicleServiceAssignedEmailOptions): string {
  const {
    supervisorName,
    serviceNumber,
    customerName,
    vehicleDescription,
    reasons,
    serviceUrl,
    logoUrl,
    companyName,
    branchName,
    departmentName,
  } = opts;

  const reasonsListHtml = reasons.length > 0
    ? `<ol style="margin: 0; padding-left: 20px;">${reasons.map((r) => `<li style="margin-bottom: 4px;">${escapeHtml(r)}</li>`).join('')}</ol>`
    : '<p style="margin: 0; color: #64748B;">No additional requests recorded.</p>';

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(supervisorName)},</p>
    <p style="margin: 0 0 16px 0;">
      A new Vehicle Service has been opened for a ${escapeHtml(departmentName)} vehicle and assigned to you.
      Please review the vehicle and requests below, then approve it to proceed.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle Service</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(serviceNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Customer</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(customerName)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(vehicleDescription)}</p>
          <p style="margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Requests</p>
          <div style="font-size: 14px; color: #0F172A;">${reasonsListHtml}</div>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `New Vehicle Service ${serviceNumber} assigned to you — ${departmentName}.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'New Vehicle Service assigned to you',
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: serviceUrl,
    logoUrl,
  });
}
