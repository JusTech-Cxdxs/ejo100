import { renderEmailLayout, escapeHtml } from './layout';

export type TechnicianResponseEmailOptions = {
  response: 'ACCEPTED' | 'REJECTED';
  supervisorName: string;
  jobNumber: string;
  customerName: string;
  technicianName: string;
  rejectionReason?: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to the supervisor the moment an assigned technician accepts or
 * rejects the work — same "one function, two branches" pattern as
 * job-card-decision.ts, for the same reason: the shell is identical,
 * only the heading/icon/body content genuinely differ.
 */
export function renderTechnicianResponseEmail(opts: TechnicianResponseEmailOptions): string {
  const {
    response,
    supervisorName,
    jobNumber,
    customerName,
    technicianName,
    rejectionReason,
    jobCardUrl,
    logoUrl,
    companyName,
    branchName,
    departmentName,
  } = opts;

  const isAccepted = response === 'ACCEPTED';

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(supervisorName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${isAccepted
        ? `${escapeHtml(technicianName)} has accepted the assignment on Job Card ${escapeHtml(jobNumber)} for ${escapeHtml(customerName)} and can begin work.`
        : `${escapeHtml(technicianName)} has rejected the assignment on Job Card ${escapeHtml(jobNumber)} for ${escapeHtml(customerName)} — it will need to be reassigned.`}
    </p>

    ${!isAccepted && rejectionReason?.trim()
      ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Reason</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(rejectionReason.trim())}</p>
        </td>
      </tr>
    </table>
    `
      : ''}
  `;

  return renderEmailLayout({
    previewText: isAccepted
      ? `${technicianName} accepted the assignment on Job Card ${jobNumber}.`
      : `${technicianName} rejected the assignment on Job Card ${jobNumber}.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: isAccepted ? '✓' : '!',
    heading: isAccepted ? 'Assignment accepted' : 'Assignment rejected',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
