import { renderEmailLayout, escapeHtml } from './layout';

export type TechnicianJobCardAssignedEmailOptions = {
  technicianName: string;
  jobNumber: string;
  customerName: string;
  vehicleDescription: string;
  complaints: string[];
  supervisorName: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to a technician the moment they're assigned to a Job Card — asks
 * them to accept or reject the work, not just informs them of it. A
 * purpose-built template rather than reusing
 * supervisor-job-card-assigned.ts: that one is about a supervisor's
 * first touch on a brand-new card ("come inspect"); this is about a
 * specific person being asked to take on specific work at a later
 * stage, genuinely different content even though both share the same
 * underlying layout.
 */
export function renderTechnicianJobCardAssignedEmail(opts: TechnicianJobCardAssignedEmailOptions): string {
  const {
    technicianName,
    jobNumber,
    customerName,
    vehicleDescription,
    complaints,
    supervisorName,
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
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(technicianName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(supervisorName)} has assigned you to Job Card ${escapeHtml(jobNumber)}. Please review the
      details below and accept or reject the assignment.
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
    previewText: `You've been assigned to Job Card ${jobNumber} — please accept or reject.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    heading: 'You\u2019ve been assigned a Job Card',
    bodyHtml,
    ctaLabel: 'Review & respond',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
