import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerServiceEstimateApprovedEmailOptions = {
  customerName: string;
  serviceNumber: string;
  vehicleDescription: string;
  lineItems: { description: string; quantity: number; unitOfMeasure?: string | null; amount: string }[];
  totalAmount: string;
  serviceUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

function lineItemRows(lines: CustomerServiceEstimateApprovedEmailOptions['lineItems']): string {
  return lines
    .map(
      (l) => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0; font-size: 13px; color: #0F172A;">
        ${escapeHtml(l.description)}${l.unitOfMeasure ? ` <span style="color: #94A3B8;">(${escapeHtml(String(l.quantity))} ${escapeHtml(l.unitOfMeasure)})</span>` : ''}
      </td>
      <td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0; font-size: 13px; color: #0F172A; text-align: right;">${escapeHtml(l.amount)}</td>
    </tr>`,
    )
    .join('');
}

/**
 * Sent to the customer once a Vehicle Service estimate is approved —
 * the real Vehicle Service equivalent of renderCustomerEstimateApproved
 * (Job Card's own), but deliberately simpler: no minimum deposit, no
 * bank details, no payment reference suggestion, because Vehicle
 * Service has no real payment-collection flow behind it the way Job
 * Card does — showing bank instructions here would be describing a
 * process that doesn't actually exist. Just what was approved, and
 * what it costs.
 */
export function renderCustomerServiceEstimateApprovedEmail(opts: CustomerServiceEstimateApprovedEmailOptions): string {
  const { customerName, serviceNumber, vehicleDescription, lineItems, totalAmount, serviceUrl, logoUrl, companyName, branchName } = opts;

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      The estimate for your vehicle service (${escapeHtml(serviceNumber)} — ${escapeHtml(vehicleDescription)}) has
      been approved. Here's what's included:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px 0;">
      <thead>
        <tr>
          <th style="padding: 0 0 8px 0; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; border-bottom: 1.5px solid #0F172A;">Item</th>
          <th style="padding: 0 0 8px 0; text-align: right; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B; border-bottom: 1.5px solid #0F172A;">Amount</th>
        </tr>
      </thead>
      <tbody>${lineItemRows(lineItems)}</tbody>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 16px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 16px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Total</p>
          <p style="margin: 0; font-size: 18px; font-weight: bold; color: #0F172A;">${escapeHtml(totalAmount)}</p>
        </td>
      </tr>
    </table>

    <p style="margin: 0; font-size: 13px; color: #64748B;">Please reach out to the workshop if you have any questions.</p>
  `;

  return renderEmailLayout({
    previewText: `The estimate for ${serviceNumber} has been approved — ${totalAmount}.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Your estimate is approved',
    bodyHtml,
    ctaLabel: 'View Details',
    ctaUrl: serviceUrl,
    logoUrl,
  });
}
