import { renderEmailLayout, escapeHtml } from './layout';

export type ServicePaymentCompletedInFullEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  totalPaid: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * The real Vehicle Service equivalent of renderPaymentCompletedInFullEmail
 * — sent exactly once, the moment the cumulative total first reaches
 * the full estimate.
 */
export function renderServicePaymentCompletedInFullEmail(opts: ServicePaymentCompletedInFullEmailOptions): string {
  const { recipientName, serviceNumber, customerName, totalPaid, serviceUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      Vehicle Service ${escapeHtml(serviceNumber)} for ${escapeHtml(customerName)} has been paid in full.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle Service</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(serviceNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Total Paid</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(totalPaid)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Vehicle Service ${serviceNumber} has been paid in full.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Paid in full',
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: serviceUrl,
    logoUrl,
  });
}
