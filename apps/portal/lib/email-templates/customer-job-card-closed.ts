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
 * while the vehicle is still sitting in the yard, so this email is
 * careful not to say the vehicle has left.
 */
export function renderCustomerJobCardClosedEmail(opts: CustomerJobCardClosedEmailOptions): string {
  const { customerName, jobNumber, vehicleDescription, dashboardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      Your ${escapeHtml(vehicleDescription)} (Job Card ${escapeHtml(jobNumber)}) has now been closed — our
      records show the work and payment on this job are fully settled.
    </p>
    <p style="margin: 0 0 16px 0;">
      If your vehicle is still with us, this doesn't change anything about collecting it — please come by at
      your convenience.
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
