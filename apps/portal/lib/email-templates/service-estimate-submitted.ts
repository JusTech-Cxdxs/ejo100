import { renderEmailLayout, escapeHtml } from './layout';

export type ServiceEstimateSubmittedEmailOptions = {
  recipientName: string;
  serviceNumber: string;
  customerName: string;
  submittedByName: string;
  totalAmount: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
  departmentName: string;
};

/**
 * Sent to the supervisor the moment a Service Estimate is submitted
 * for their approval — the real Vehicle Service equivalent of
 * renderEstimateSubmittedEmail, entirely its own file rather than a
 * branch inside that one, since that template's own copy is written
 * specifically around Job Card.
 */
export function renderServiceEstimateSubmittedEmail(opts: ServiceEstimateSubmittedEmailOptions): string {
  const { recipientName, serviceNumber, customerName, submittedByName, totalAmount, serviceUrl, logoUrl, companyName, branchName, departmentName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin: 0 0 16px 0;">
      ${escapeHtml(submittedByName)} has finished the estimate on Vehicle Service ${escapeHtml(serviceNumber)} for
      ${escapeHtml(customerName)} and submitted it for your approval.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle Service</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(serviceNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Total Estimate</p>
          <p style="margin: 0; font-size: 15px; color: #0F172A;">${escapeHtml(totalAmount)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `${submittedByName} submitted the estimate on ${serviceNumber} for your approval.`,
    companyName,
    orgContext: [companyName, branchName, departmentName],
    iconGlyph: '!',
    iconTone: 'neutral',
    heading: 'Estimate needs your approval',
    bodyHtml,
    ctaLabel: 'Review Estimate',
    ctaUrl: serviceUrl,
    logoUrl,
  });
}
