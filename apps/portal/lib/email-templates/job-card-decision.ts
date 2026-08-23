import { renderEmailLayout, escapeHtml } from './layout';

export type JobCardDecisionEmailOptions = {
  decision: 'APPROVED' | 'REJECTED';
  recipientName: string;
  jobNumber: string;
  customerName: string;
  approverName: string;
  rejectionReason?: string;
  notes?: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to whoever created a Job Card the moment their supervisor
 * approves or rejects it — one function, not two near-duplicate
 * templates, since the shell (layout, org context, CTA) is identical
 * either way and only the heading, icon, and body content genuinely
 * differ between the two outcomes.
 */
export function renderJobCardDecisionEmail(opts: JobCardDecisionEmailOptions): string {
  const {
    decision,
    recipientName,
    jobNumber,
    customerName,
    approverName,
    rejectionReason,
    notes,
    jobCardUrl,
    logoUrl,
    companyName,
    branchName,
    departmentName,
  } = opts;

  const isApproved = decision === 'APPROVED';

  const detailsHtml = isApproved
    ? `
      <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Approved by</p>
      <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(approverName)}</p>
    `
    : `
      <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Rejected by</p>
      <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(approverName)}</p>
      <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Reason</p>
      <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(rejectionReason ?? '')}</p>
    `;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${isApproved
        ? `Job Card ${escapeHtml(jobNumber)} for ${escapeHtml(customerName)} has been approved and can now proceed.`
        : `Job Card ${escapeHtml(jobNumber)} for ${escapeHtml(customerName)} has been sent back for correction.`}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          ${detailsHtml}
        </td>
      </tr>
    </table>

    ${notes?.trim() ? `<p style="margin: 0 0 16px 0;"><strong>Additional notes:</strong> ${escapeHtml(notes.trim())}</p>` : ''}
    ${!isApproved ? '<p style="margin: 0;">Please review and correct as needed.</p>' : ''}
  `;

  return renderEmailLayout({
    previewText: isApproved
      ? `Job Card ${jobNumber} was approved.`
      : `Job Card ${jobNumber} was returned for correction.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: isApproved ? '✓' : '!',
    heading: isApproved ? 'Job Card approved' : 'Job Card returned for correction',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
