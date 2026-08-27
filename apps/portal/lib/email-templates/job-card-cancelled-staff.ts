import { renderEmailLayout, escapeHtml } from './layout';

export type JobCardCancelledStaffEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  approvedByName: string;
  reason: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to every real staff party on a Job Card the moment a Manager
 * approves its cancellation — creator, supervisor, assigned
 * technician, and every eligible branch Manager, one send each, same
 * broadcast pattern already used for payment confirmation. Shows the
 * reason plainly, since staff are meant to see it — the customer's
 * own, separate email deliberately does not.
 */
export function renderJobCardCancelledStaffEmail(opts: JobCardCancelledStaffEmailOptions): string {
  const { recipientName, jobNumber, customerName, approvedByName, reason, jobCardUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(approvedByName)} has approved cancellation of Job Card ${escapeHtml(jobNumber)} for
      ${escapeHtml(customerName)}. No further work is needed on this Job Card.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Job Card</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(jobNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Reason</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(reason)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Job Card ${jobNumber} has been cancelled.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'negative',
    heading: 'Job Card cancelled',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
