import { renderEmailLayout, escapeHtml } from './layout';

export type ServicePaymentRecordedUpdateEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  amountReceived: string;
  totalPaidSoFar: string;
  totalEstimate: string;
  balanceRemaining?: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * The real Vehicle Service equivalent of renderPaymentRecordedUpdateEmail
 * — same real reasoning (Finance/Manager only, never the technician or
 * supervisor, and never claims a threshold was met), entirely its own
 * file rather than a branch inside the Job Card one.
 */
export function renderServicePaymentRecordedUpdateEmail(opts: ServicePaymentRecordedUpdateEmailOptions): string {
  const { recipientName, serviceNumber, customerName, amountReceived, totalPaidSoFar, totalEstimate, balanceRemaining, serviceUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      A payment of ${escapeHtml(amountReceived)} was recorded on Vehicle Service ${escapeHtml(serviceNumber)} for
      ${escapeHtml(customerName)}.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle Service</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(serviceNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Total Received So Far</p>
          <p style="margin: 0 ${balanceRemaining ? '0 16px 0' : '0'}; font-size: 15px; color: #0F172A;">${escapeHtml(totalPaidSoFar)} of ${escapeHtml(totalEstimate)}</p>
          ${balanceRemaining
            ? `<p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Balance Remaining</p><p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(balanceRemaining)}</p>`
            : ''}
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `${amountReceived} recorded on Vehicle Service ${serviceNumber}.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Payment recorded',
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: serviceUrl,
    logoUrl,
  });
}
