import { renderEmailLayout, escapeHtml } from './layout';

export type CustomerEstimateApprovedEmailOptions = {
  customerName: string;
  jobNumber: string;
  vehicleDescription: string;
  lineItems: { description: string; quantity: number; amount: string }[];
  totalAmount: string;
  dashboardUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

/**
 * Sent to the customer once the Workshop Manager approves the
 * estimate — the first time an estimate reaches the customer at all,
 * and deliberately the ONE place in this whole workflow where the
 * internal type breakdown (Store Part / External Part / External Job /
 * Labour / Sundry) must never appear. Every other estimate email in
 * this codebase is staff-facing and shows the type per line
 * (supervisors and technicians need it); this one shows only
 * descriptions and amounts, presented as a single list — exactly what
 * a customer should see, nothing about who priced what or how the
 * workshop internally categorizes the work. The options type below has
 * no `type` field at all, so there's structurally nothing to leak, not
 * just careful wording.
 */
export function renderCustomerEstimateApprovedEmail(opts: CustomerEstimateApprovedEmailOptions): string {
  const { customerName, jobNumber, vehicleDescription, lineItems, totalAmount, dashboardUrl, logoUrl, companyName, branchName } = opts;

  const lineItemsHtml = lineItems.length > 0
    ? `<ol style="margin: 0; padding-left: 20px;">${lineItems
        .map((li) => `<li style="margin-bottom: 4px;">${escapeHtml(li.description)} (x${li.quantity}) — ${escapeHtml(li.amount)}</li>`)
        .join('')}</ol>`
    : '<p style="margin: 0; color: #64748B;">No items recorded.</p>';

  const bodyHtml = `
    <p style="margin: 0 0 16px 0;">Hello ${escapeHtml(customerName)},</p>
    <p style="margin: 0 0 16px 0;">
      The estimate for your vehicle's service has been approved. Please review it below and sign in to your
      account to proceed.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Job Card</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A; font-weight: bold;">${escapeHtml(jobNumber)}</p>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Vehicle</p>
          <p style="margin: 0 0 16px 0; font-size: 15px; color: #0F172A;">${escapeHtml(vehicleDescription)}</p>
          <p style="margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Estimate</p>
          <div style="font-size: 14px; color: #0F172A; margin-bottom: 16px;">${lineItemsHtml}</div>
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Total</p>
          <p style="margin: 0; font-size: 18px; color: #0F172A; font-weight: bold;">${escapeHtml(totalAmount)}</p>
        </td>
      </tr>
    </table>
  `;

  return renderEmailLayout({
    previewText: `Your estimate for Job Card ${jobNumber} has been approved.`,
    companyName,
    orgContext: [companyName, branchName],
    iconGlyph: '✓',
    iconTone: 'positive',
    heading: 'Your estimate has been approved',
    bodyHtml,
    ctaLabel: 'View in your account',
    ctaUrl: dashboardUrl,
    logoUrl,
  });
}
