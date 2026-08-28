import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerReadyForCollectionEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  dueDate: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Fires once, the moment a Job Card's status genuinely transitions to
 * READY_FOR_COLLECTION — the real "come get it" call, a deliberate
 * step the Manager or QC department takes once everything is
 * genuinely ready, not automatic on Completed. States the real
 * collection deadline plainly, since that's the one thing a customer
 * actually needs to act on here.
 */
export function renderCustomerReadyForCollectionEmail(opts: CustomerReadyForCollectionEmailOptions): string {
  const { customerName, jobNumber, vehicleDescription, dueDate, dashboardUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      Your ${escapeHtml(vehicleDescription)} (Job Card ${escapeHtml(jobNumber)}) is ready for collection.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #FEF3C7; border: 1px solid #FDE68A; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #B45309;">Please Collect By</p>
          <p style="margin: 0; font-size: 18px; color: #0F172A; font-weight: bold;">${escapeHtml(dueDate)}</p>
          <p style="margin: 8px 0 0 0; font-size: 13px; color: #78350F;">
            Charges may apply for any period the vehicle stays with us beyond this date.
          </p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Ready for collection — Job Card ${jobNumber}, please collect by ${dueDate}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Ready for collection',
    bodyHtml,
    ctaLabel: 'View in your account',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
