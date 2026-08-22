import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerJobCardAcknowledgmentEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  complaints: string[];
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to the customer themselves the moment a Job Card is opened for
 * their vehicle — confirms it was received, what was logged, and where
 * to track it, on the same reusable layout as every other workflow
 * email. This is a genuinely different audience than
 * supervisor-job-card-assigned.ts (which goes to staff): reassuring,
 * plain-language, and links to the customer's own portal dashboard
 * rather than the internal Job Card page.
 */
export function renderCustomerJobCardAcknowledgmentEmail(
  opts: CustomerJobCardAcknowledgmentEmailOptions,
): string {
  const { customerName, jobNumber, vehicleDescription, complaints, dashboardUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const complaintsListHtml = complaints.length > 0
    ? `<ol style="margin: 0; padding-left: 20px;">${complaints.map((c) => `<li style="margin-bottom: 4px;">${escapeHtml(c)}</li>`).join('')}</ol>`
    : '<p style="margin: 0; color: #64748B;">No specific concerns recorded.</p>';

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      Thank you for bringing your vehicle to ${escapeHtml(companyName)}. We've received it and logged the
      details below — our ${escapeHtml(departmentName)} team will begin the inspection shortly, and we'll
      keep you updated as your service progresses.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Job Card</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(jobNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(vehicleDescription)}</p>
          <p style="margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">What you told us</p>
          <div style="font-size: 14px; color: #0F172A;">${complaintsListHtml}</div>
        </td>
      </tr>
    </table>

    <p style="margin: 0;">
      You can track your vehicle's progress at any time by signing in to your account.
    </p>
  `;

  return renderEmailLayout({
    previewText: `We've received your vehicle — Job Card ${jobNumber} is now open.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '✓',
    heading: 'We\u2019ve received your vehicle',
    bodyHtml,
    ctaLabel: 'Track your service',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
