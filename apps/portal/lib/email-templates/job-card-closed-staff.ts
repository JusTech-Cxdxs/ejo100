import { renderEmailLayout, escapeHtml } from './layout';

export type JobCardClosedStaffEmailOptions = {
  recipientName: string;
  jobNumber: string;
  customerName: string;
  closedByName: string;
  jobCardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to every real staff party on a Job Card the moment its status
 * genuinely transitions to CLOSED — creator, supervisor, assigned
 * technician, and every eligible branch Manager, one send each, the
 * same broadcast pattern already used for cancellation approval and
 * payment confirmation. CLOSED is the Manager's own administrative
 * sign-off that the job is complete and settled — this is that
 * record, distinct from the vehicle's own separate CHECKED_OUT email.
 */
export function renderJobCardClosedStaffEmail(opts: JobCardClosedStaffEmailOptions): string {
  const { recipientName, jobNumber, customerName, closedByName, jobCardUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(closedByName)} has closed Job Card ${escapeHtml(jobNumber)} for ${escapeHtml(customerName)} —
      work and payment on this job are now fully settled.
    </p>
  `;

  return renderEmailLayout({
    previewText: `Job Card ${jobNumber} has been closed.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Job Card closed',
    bodyHtml,
    ctaLabel: 'Open Job Card',
    ctaUrl: jobCardUrl,
    logoUrl,
  });
}
