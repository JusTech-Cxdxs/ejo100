import { renderEmailLayout, escapeHtml } from './layout';

export type TechnicianVehicleServiceAssignedEmailOptions = {
  technicianName: string;
  serviceNumber: string;
  customerName: string;
  vehicleDescription: string;
  supervisorName: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to a technician the moment they're assigned to a Vehicle
 * Service — a plain notification, not an accept/reject request like
 * Job Card's own technician-assigned email: Vehicle Service has no
 * real acceptance workflow for technicians, a deliberate part of
 * keeping this a genuinely lighter process than Job Card.
 */
export function renderTechnicianVehicleServiceAssignedEmail(opts: TechnicianVehicleServiceAssignedEmailOptions): string {
  const {
    technicianName,
    serviceNumber,
    customerName,
    vehicleDescription,
    supervisorName,
    serviceUrl,
    logoUrl,
    companyName,
    branchName,
    departmentName,
  } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(technicianName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(supervisorName)} has assigned you to Vehicle Service ${escapeHtml(serviceNumber)}.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle Service</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(serviceNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Customer</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(customerName)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(vehicleDescription)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `You've been assigned to Vehicle Service ${serviceNumber}.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'You\u2019ve been assigned a Vehicle Service',
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: serviceUrl,
    logoUrl,
  });
}
