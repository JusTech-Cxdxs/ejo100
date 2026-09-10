import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerJobCardClosedEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Fires once, the moment a Job Card's status genuinely transitions to
 * CLOSED — the Manager's own administrative sign-off that the job is
 * complete and settled. Deliberately distinct from the vehicle
 * physically leaving (that's CHECKED_OUT, its own separate email) —
 * the schema's own comments already settle that CLOSED can happen
 * while the vehicle is still sitting in the yard.
 *
 * Stays entirely off the subject of vehicle collection, on purpose —
 * that's what the separate Ready For Collection and Vehicle Checked
 * Out emails already cover, each at its own real moment. An earlier
 * version of this email tried to also reassure the customer about
 * collection ("if your vehicle is still with us...") and it read as
 * contradicting the Ready For Collection email's own message instead
 * — CLOSED is purely a settlement confirmation, nothing more.
 */
export function renderCustomerJobCardClosedEmail(opts: CustomerJobCardClosedEmailOptions): string {
  const { customerName, jobNumber, vehicleDescription, dashboardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      Your ${escapeHtml(vehicleDescription)} (Job Card ${escapeHtml(jobNumber)}) has now been closed — the work
      and payment on this job are fully settled. Thank you for choosing ${escapeHtml(companyName)}.
    </p>
  `;

  return renderEmailLayout({
    previewText: `Job Card ${jobNumber} has been closed.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Job Card closed',
    bodyHtml,
    ctaLabel: 'View in your account',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
