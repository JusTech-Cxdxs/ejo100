import { renderEmailLayout, escapeHtml } from './layout';

export type SupervisorJobCardAssignedEmailOptions = {
  supervisorName: string;
  jobNumber: string;
  customerName: string;
  vehicleDescription: string;
  complaints: string[];
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent when a new Job Card is routed to a department and assigned to
 * that department's Supervisor/HOD at creation — the first step of the
 * multi-department Workshop workflow: the right department receives the
 * vehicle, and its supervisor is notified to inspect it and begin the
 * assessment before any technician is assigned. Built on the same
 * reusable layout as the customer welcome email — this is exactly the
 * second workflow email that architecture was built to support without
 * redesigning anything.
 */
export function renderSupervisorJobCardAssignedEmail(opts: SupervisorJobCardAssignedEmailOptions): string {
  const {
    supervisorName,
    jobNumber,
    customerName,
    vehicleDescription,
    complaints,
    jobCardUrl,
    logoUrl,
    companyName,
    branchName,
    departmentName,
  } = opts;

  const complaintsListHtml = complaints.length > 0
    ? `<ol style="margin: 0; padding-left: 20px;">${complaints.map((c) => `<li style="margin-bottom: 4px;">${escapeHtml(c)}</li>`).join('')}</ol>`
    : '<p style="margin: 0; color: #64748B;">No complaints recorded.</p>';

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(supervisorName)},</p>
    <p style="margin: 0 0 16px 0;">
      A new Job Card has been opened for a ${escapeHtml(departmentName)} vehicle and assigned to you.
      Please review the vehicle and complaints below, then begin your inspection and assessment.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Job Card</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(jobNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Customer</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(customerName)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(vehicleDescription)}</p>
          <p style="margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Complaints</p>
          <div style="font-size: 14px; color: #0F172A;">${complaintsListHtml}</div>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `New Job Card ${jobNumber} assigned to you — ${departmentName}.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    heading: 'New Job Card assigned to you',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
