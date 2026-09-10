import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerVehicleCheckedOutEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  collectedByName: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Fires once, the moment a Job Card's status genuinely transitions to
 * CHECKED_OUT — the real, physical moment the vehicle leaves, per the
 * schema's own comments. States plainly who actually collected it,
 * since that's the one detail that matters most if the vehicle was
 * ever collected by someone other than the customer themselves.
 */
export function renderCustomerVehicleCheckedOutEmail(opts: CustomerVehicleCheckedOutEmailOptions): string {
  const { customerName, jobNumber, vehicleDescription, collectedByName, dashboardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      This confirms your ${escapeHtml(vehicleDescription)} (Job Card ${escapeHtml(jobNumber)}) has now left our
      premises.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Collected By</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(collectedByName)}</p>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 16px 0;">
      If this wasn't you or someone you authorised, please contact us right away.
    </p>
  `;

  return renderEmailLayout({
    previewText: `Your vehicle has been collected — Job Card ${jobNumber}, collected by ${collectedByName}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Vehicle collected',
    bodyHtml,
    ctaLabel: 'View in your account',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
