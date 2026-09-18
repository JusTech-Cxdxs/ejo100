import { renderEmailLayout, escapeHtml } from './layout';

export type ServicePaymentRequirementMetEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  totalPaidSoFar: string;
  totalEstimate: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * The real Vehicle Service equivalent of renderPaymentRequirementMetEmail
 * — sent exactly once, the moment the 70% deposit is first met, to
 * every real party on the Vehicle Service. Same reasoning as Job
 * Card's own: this is the one thing a technician or supervisor
 * actually needs to know.
 */
export function renderServicePaymentRequirementMetEmail(opts: ServicePaymentRequirementMetEmailOptions): string {
  const { recipientName, serviceNumber, customerName, totalPaidSoFar, totalEstimate, serviceUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      The required 70% deposit has been met on Vehicle Service ${escapeHtml(serviceNumber)} for ${escapeHtml(customerName)}.
      Work can begin now.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle Service</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(serviceNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Total Received</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(totalPaidSoFar)} of ${escapeHtml(totalEstimate)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Required deposit met on Vehicle Service ${serviceNumber} — work can begin.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Deposit requirement met',
    bodyHtml,
    ctaLabel: 'Open Vehicle Service',
    ctaUrl: serviceUrl,
    logoUrl,
  });
}
